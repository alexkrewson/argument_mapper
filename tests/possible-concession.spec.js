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

// Open a node's popup by emitting the tap cytoscape itself listens for. Clicking
// the badge's centre in page coordinates looked equivalent and wasn't: once a
// map has two roots the layout moves, and the click landed on the neighbour.
async function openNode(page, id) {
  await page.evaluate((nodeId) => {
    const el = [...document.querySelectorAll("div")].find((d) => d._cyreg);
    el._cyreg.cy.getElementById(nodeId).emit("tap");
  }, id);
  await page.waitForSelector(".popup-summary, .flag-chip", { timeout: 10000 });
}


// Seed a two-node map: node_1 owned by Blue, node_2 by Green. `link` decides
// which route produces the badge — the metadata on node_1, or a concessive
// rebuttal pointing at it from node_2.
async function seedPair(page, link) {
  await page.goto("/");
  await page.getByTestId("tab-history").click();
  await page.getByTestId("history-new-argument").click();
  const insert = page.waitForResponse(
    (r) => r.url().includes("/rest/v1/debates") && r.request().method() === "POST");
  await page.getByTestId("controls-chevron").click();
  await page.getByTestId("ctrl-add-node").click();
  await page.getByTestId("node-edit-content").fill("A sandwich is a filling between bread");
  await page.getByTestId("node-edit-save").click();
  await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();
  const id = (await (await insert).json()).id;

  const base = process.env.VITE_SUPABASE_URL, anon = process.env.VITE_SUPABASE_ANON_KEY;
  await page.evaluate(async ({ id, link, base, anon }) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    const token = JSON.parse(localStorage.getItem(key)).access_token;
    const headers = { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      "Accept-Profile": "argument_mapper", "Content-Profile": "argument_mapper", Prefer: "return=representation" };
    const [row] = await (await fetch(`${base}/rest/v1/debates?id=eq.${id}&select=map_data`, { headers })).json();
    const map = row.map_data;
    const inner = map.map?.argument_map ?? map.argument_map;
    inner.nodes.push({ id: "node_2", type: "premise", speaker: "Green", rating: null,
      content: "Structure is what decides it, not filling",
      metadata: link === "despite" || link === "settled" ? { despite_concession_of: "node_1" } : {} });
    if (link === "settled") {
      inner.nodes[0].rating = "up";
      inner.nodes[0].metadata = { ...(inner.nodes[0].metadata || {}),
        agreed_by: { speaker: "Green", text: "yeah you're right about the bread" } };
    }
    if (link === "metadata") {
      inner.nodes[0].metadata = { ...(inner.nodes[0].metadata || {}),
        possible_concession: { type: "other", speaker: "Green", text: "granted, the bread part is right" } };
    }
    await fetch(`${base}/rest/v1/debates?id=eq.${id}`, { method: "PATCH", headers, body: JSON.stringify({ map_data: map }) });
  }, { id, link, base, anon });

  await page.reload();
  await page.getByTestId("tab-history").click();
  await page.getByTestId("history-new-argument").click();
  await page.getByTestId("tab-history").click();
  await page.locator(`[data-debate-id="${id}"]`).getByTestId("history-row-title").click();
  await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();
  return id;
}

async function cleanup(page, id) {
  const base = process.env.VITE_SUPABASE_URL, anon = process.env.VITE_SUPABASE_ANON_KEY;
  await page.evaluate(async ({ id, base, anon }) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    const token = JSON.parse(localStorage.getItem(key)).access_token;
    await fetch(`${base}/rest/v1/debates?id=eq.${id}`, { method: "DELETE",
      headers: { apikey: anon, Authorization: `Bearer ${token}`,
                 "Accept-Profile": "argument_mapper", "Content-Profile": "argument_mapper" } });
  }, { id, base, anon });
}

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
    await openNode(page, "node_1");
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

  // The second route into the badge, and the one that shipped unbadged: a
  // concessive rebuttal. Claude records that on the REBUTTING node, as
  // metadata.despite_concession_of, which never passed through the rating
  // interception and so never became a question. The map said "conceded here"
  // about a node nobody had agreed to concede.
  test("a concessive rebuttal badges the node it concedes", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();

    const insertResponse = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/debates") && r.request().method() === "POST",
    );
    await page.getByTestId("controls-chevron").click();
    await page.getByTestId("ctrl-add-node").click();
    await page.getByTestId("node-edit-content").fill("A sandwich is a filling between bread");
    await page.getByTestId("node-edit-save").click();
    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();
    const debateId = (await (await insertResponse).json()).id;

    const base = process.env.VITE_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_ANON_KEY;

    const seeded = await page.evaluate(async ({ id, base, anon }) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const token = JSON.parse(localStorage.getItem(key)).access_token;
      const headers = {
        apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        "Accept-Profile": "argument_mapper", "Content-Profile": "argument_mapper",
        Prefer: "return=representation",
      };
      const [row] = await (await fetch(`${base}/rest/v1/debates?id=eq.${id}&select=map_data`, { headers })).json();
      const map = row.map_data;
      const inner = map.map?.argument_map ?? map.argument_map;
      inner.nodes.push({
        id: "node_2", type: "premise", speaker: "Green", rating: null,
        content: "BLT and Reuben are sandwiches because of structure",
        metadata: { despite_concession_of: "node_1" },
      });
      const res = await fetch(`${base}/rest/v1/debates?id=eq.${id}`, {
        method: "PATCH", headers, body: JSON.stringify({ map_data: map }),
      });
      return res.ok;
    }, { id: debateId, base, anon });
    expect(seeded).toBe(true);

    await page.reload();
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();
    await page.getByTestId("tab-history").click();
    await page.locator(`[data-debate-id="${debateId}"]`).getByTestId("history-row-title").click();
    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();

    // The conceded node carries the badge, even though the metadata lives on
    // the OTHER node.
    await expect(page.locator('[data-node-id="node_1"]')).toContainText("possible concession");

    await openNode(page, "node_1");
    const chip = page.locator(".flag-chip--possible-concession");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("Nobody has confirmed it");
    // And nothing anywhere may claim it as settled.
    await expect(page.locator(".popup-overlay, .concession-modal, body")).not.toContainText("Conceded here, rebutted");

    await page.evaluate(async ({ id, base, anon }) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const token = JSON.parse(localStorage.getItem(key)).access_token;
      await fetch(`${base}/rest/v1/debates?id=eq.${id}`, {
        method: "DELETE",
        headers: { apikey: anon, Authorization: `Bearer ${token}`,
                   "Accept-Profile": "argument_mapper", "Content-Profile": "argument_mapper" },
      });
    }, { id: debateId, base, anon });
  });

  test("the chip opens the node that implies the concession", async ({ page }) => {
    const id = await seedPair(page, "despite");
    await openNode(page, "node_1");
    const chip = page.locator(".flag-chip--possible-concession");
    await expect(chip).toHaveClass(/flag-chip--linked/);
    await chip.click();
    // The popup should now be node_2 — the rebuttal that implies the concession.
    await expect(page.locator(".flag-chip--despite")).toContainText("Despite a possible concession of");
    await cleanup(page, id);
  });

  test("the owner can withdraw it, and that clears the implying reference too", async ({ page }) => {
    const id = await seedPair(page, "despite");
    await expect(page.locator('[data-node-id="node_1"]')).toContainText("possible concession");

    // node_1 belongs to Blue, the current speaker, so the edit window opens.
    await openNode(page, "node_1");
    await page.getByTestId("node-view-edit-btn").click();
    await page.getByTestId("node-edit-concession-toggle").click();
    await page.getByTestId("node-edit-save").click();

    // Gone from the map. The badge came from node_2's despite_concession_of, so
    // clearing only node_1's own metadata would have left it exactly where it was.
    await expect(page.locator('[data-node-id="node_1"]')).not.toContainText("possible concession");
    await cleanup(page, id);
  });

  test("you may suggest one on the other speaker's node, but not withdraw it", async ({ page }) => {
    const id = await seedPair(page, "none");
    // node_2 is Green's; the current speaker is Blue.
    await openNode(page, "node_2");
    await page.getByTestId("node-flag-concession").click();
    await expect(page.locator('[data-node-id="node_2"]')).toContainText("possible concession");

    // Reopen it: the suggest button is gone (it only ever adds), and there is no
    // edit window on someone else's node, so Blue cannot take it back.
    await openNode(page, "node_2");
    await expect(page.getByTestId("node-flag-concession")).toHaveCount(0);
    await expect(page.getByTestId("node-view-edit-btn")).toHaveCount(0);
    await cleanup(page, id);
  });

  // From Alex's screw-type map: node_3 had rating "up" AND agreed_by -- an
  // explicitly confirmed concession -- and still wore the badge, because the
  // derived rule badged anything a despite_concession_of pointed at without
  // asking whether the question had already been answered.
  test("an explicitly conceded node loses the badge and the hedged wording", async ({ page }) => {
    const id = await seedPair(page, "settled");

    await expect(page.locator('[data-node-id="node_1"]')).not.toContainText("possible concession");

    await openNode(page, "node_1");
    await expect(page.locator(".flag-chip--possible-concession")).toHaveCount(0);
    // The relationship is still true and still shown — only the hedge goes.
    await expect(page.locator(".flag-chip--despite")).toContainText("Conceded here, rebutted by");
    await expect(page.locator(".flag-chip--despite")).not.toContainText("Possibly conceded");

    // And from the rebutting node's side.
    await openNode(page, "node_2");
    await expect(page.locator(".flag-chip--despite")).toContainText("Despite conceding");
    await expect(page.locator(".flag-chip--despite")).not.toContainText("possible concession of");
    await cleanup(page, id);
  });
});
