import { test, expect } from "./support/fixtures.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

// playwright.config.js loads .env.test, which carries only the test account.
// The Supabase URL and anon key live in .env — both are inlined into the public
// bundle at build time, so neither is a secret.
try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch { /* a clean clone has no .env; the assertion below reports it */ }

// A possible-concession badge is normally produced by an AI turn, which costs
// real credits. So this seeds one instead: build a node by hand (free), let the
// auto-save create the row, PATCH the stored map to add the metadata Claude
// would have produced, then load it back through History. That exercises
// everything downstream of detection — persistence, the map badge, and the info
// box — without spending anything.
//
// Cleanup is by the exact id captured from the insert response. Never by "the
// newest History row": that assumption once deleted a real user's debate.

const SEEDED_QUOTE = "fair enough, that part is true";

test.describe("Possible concession — a suggestion, not a verdict", () => {
  test("badge and explanation survive a save/load round trip", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();

    const insertResponse = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/debates") && r.request().method() === "POST",
    );

    await page.getByTestId("controls-chevron").click();
    await page.getByTestId("ctrl-add-node").click();
    await page.getByTestId("node-edit-content").fill("Manual testing is obsolete");
    await page.getByTestId("node-edit-save").click();
    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();

    const debateId = (await (await insertResponse).json()).id;
    expect(debateId).toBeTruthy();

    // Add the metadata the app would have written when someone declined the
    // confirmation, then reload it through the normal load path.
    // base/anon come from the test process: playwright.config.js loads .env.test,
    // and import.meta.env is a build-time substitution that an injected evaluate
    // never sees.
    const base = process.env.VITE_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY;
    expect(base && anon, "VITE_SUPABASE_URL / ANON_KEY missing from .env.test").toBeTruthy();

    const patched = await page.evaluate(async ({ id, quote, base, anon }) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const token = JSON.parse(localStorage.getItem(key)).access_token;
      // The client is created with db.schema "argument_mapper", so a raw REST
      // call needs the profile headers or PostgREST looks in public and 404s
      // with "Could not find the table 'public.debates'".
      const headers = {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept-Profile": "argument_mapper",
        "Content-Profile": "argument_mapper",
        Prefer: "return=representation",
      };
      const got = await fetch(`${base}/rest/v1/debates?id=eq.${id}&select=map_data`, { headers });
      const body = await got.json();
      if (!Array.isArray(body) || !body.length) {
        return { ok: false, why: `GET ${got.status}: ${JSON.stringify(body).slice(0, 200)}` };
      }
      // map_data is a history ENTRY ({ map, analysis }), not the map itself.
      const map = body[0].map_data;
      const inner = map.map?.argument_map ?? map.argument_map;
      if (!inner?.nodes?.length) {
        return { ok: false, why: `unexpected map_data shape: ${Object.keys(map).join(",")}` };
      }
      inner.nodes[0].metadata = {
        ...(inner.nodes[0].metadata || {}),
        possible_concession: { type: "other", speaker: "Green", text: quote },
      };
      const res = await fetch(`${base}/rest/v1/debates?id=eq.${id}`, {
        method: "PATCH", headers, body: JSON.stringify({ map_data: map }),
      });
      return { ok: res.ok, why: res.ok ? "" : `PATCH ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }, { id: debateId, quote: SEEDED_QUOTE, base, anon });
    expect(patched.ok, `could not seed the metadata — ${patched.why}`).toBe(true);

    // Clear the canvas before loading. The row title only loads directly when
    // the map is empty -- otherwise it raises a replace-confirmation instead --
    // and after a reload the map is still there. Load by data-debate-id, never
    // by "the row with this text": several suites leave rows with similar
    // titles, which is exactly how this passed alone and failed in the suite.
    await page.reload();
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();
    await page.getByTestId("tab-history").click();
    await page.locator(`[data-debate-id="${debateId}"]`).getByTestId("history-row-title").click();
    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();

    // On the map: the badge, in its own right, on the node itself.
    await expect(page.locator('[data-node-id="node_1"]')).toContainText("possible concession");

    // In the info box: what it means, and the words it was inferred from —
    // the quote is the whole point, since it's what lets a reader judge the
    // suggestion rather than take it on trust.
    const badge = page.locator('[data-node-id="node_1"]');
    const box = await badge.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const chip = page.locator(".flag-chip--possible-concession");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("Possible concession");
    await expect(chip).toContainText("Nobody has confirmed it");
    await expect(chip).toContainText(SEEDED_QUOTE);

    // Nothing was applied: a suggestion must not move the score or fade anything.
    const applied = await page.evaluate(`(() => {
      const el = [...document.querySelectorAll("div")].find(d => d._cyreg);
      const n = el._cyreg.cy.getElementById("node_1");
      return { rating: n.data("rating"), opacity: n.style("opacity") };
    })()`);
    expect(applied.rating ?? null).toBe(null);
    expect(Number(applied.opacity)).toBe(1);

    // Clean up by id.
    await page.evaluate(async ({ id, base, anon }) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const token = JSON.parse(localStorage.getItem(key)).access_token;
      await fetch(`${base}/rest/v1/debates?id=eq.${id}`, {
        method: "DELETE",
        headers: {
          apikey: anon,
          Authorization: `Bearer ${token}`,
          "Accept-Profile": "argument_mapper",
          "Content-Profile": "argument_mapper",
        },
      });
    }, { id: debateId, base, anon });
  });
});
