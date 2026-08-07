import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./support/fixtures.js";
import { combinedBudgetMs, waitForCombinedRun } from "./support/waitForCombined.js";
import { TACTIC_KEYS } from "../src/utils/tactics.js";

// Does the AI actually make the right calls?
//
// Everything else in this repo tests the app given whatever the AI returned.
// This tests the AI itself, on scenarios engineered so that there is only one
// defensible answer. It spends real credits — roughly 4p a turn, ~70p a full
// run — so it is tagged @costly (excluded from `npm run test:web`) AND
// @judgement, so it can be run on its own:
//
//   npm run test:web:judgement
//
// TWO LAYERS, ON PURPOSE, because they fail for different reasons and deserve
// different treatment.
//
//   INVARIANTS are properties of the map that must hold no matter what the AI
//   decided — one root, one parent per node, no dangling reference, no tactic
//   outside the known set, a non-sequitur's edge never claiming support, a
//   possible concession never carrying a rating. These are deterministic. If
//   one breaks, the app or the schema is broken, and it is a real failure.
//
//   JUDGEMENT is whether the model reached the right conclusion. That is not
//   deterministic, so the scenarios are deliberately blatant — a textbook straw
//   man, a flat self-contradiction, an explicit "you're right, I'll grant
//   that". A model worth shipping gets these every time, and one that starts
//   missing them has regressed in a way worth being told about loudly. That is
//   why they are assertions and not warnings.
//
// Every run writes the full map and a per-expectation verdict to
// test-results/judgement/<scenario>.json, so a failure can be read rather than
// guessed at, and so the maps can be reviewed even when everything passes.

// playwright.config.js loads .env.test, which holds only the test account. The
// Supabase URL and anon key live in .env — both are inlined into the public
// bundle at build time, so neither is a secret.
try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch { /* a clean clone has no .env; the cleanup step reports it */ }

const OUT_DIR = path.join(process.cwd(), "test-results", "judgement");

const SCENARIOS = [
  {
    name: "straw-man",
    why: "B answers a claim about speed limits with a claim about wanting deaths.",
    turns: [
      "User A: The speed limit on rural motorways should be raised to 80.",
      "User B: So you want more people to die in crashes.",
    ],
    expect: { tacticsAny: ["straw_man"] },
  },
  {
    name: "ad-hominem",
    why: "B attacks the person rather than the flood-defence argument.",
    turns: [
      "User A: The budget should prioritise flood defences over road resurfacing.",
      "User B: You've never owned a home in your life, so your opinion here is worthless.",
    ],
    expect: { tacticsAny: ["ad_hominem"] },
  },
  {
    name: "evidence-and-source",
    why: "B answers with a named source and a figure.",
    turns: [
      "User A: Separated cycle lanes don't make any real difference to road deaths.",
      "User B: The Dutch transport ministry recorded a 40% fall in cycling fatalities after separated lanes were built.",
    ],
    expect: { tacticsAny: ["evidence_based", "cites_source"] },
  },
  {
    name: "concession",
    why: "B grants A's point outright, then argues on. Nothing may be scored for it.",
    turns: [
      "User A: Remote work saves companies a fortune in office costs.",
      "User B: You're right, I'll grant that the office savings are real. But team cohesion suffers badly.",
    ],
    expect: { possibleConcession: true, noRatings: true },
  },
  {
    name: "self-contradiction",
    why: "A says nuclear is too expensive, then that it is the cheapest option.",
    turns: [
      "User A: Nuclear power is far too expensive to build at scale.",
      "User B: Then how should we decarbonise the grid?",
      "User A: With nuclear — it's the cheapest low-carbon option we have.",
    ],
    expect: { contradiction: true },
  },
  {
    name: "non-sequitur-genuine",
    why: "B changes the subject entirely. This one SHOULD be flagged.",
    turns: [
      "User A: The number 47 bus should run later on weekends.",
      "User B: My sister has started training for a marathon.",
    ],
    expect: { nonSequitur: true },
  },
  {
    name: "non-sequitur-false-positive",
    why:
      "A eliminates a rival criterion, which is on-topic. On 2026-08-07 the " +
      "model flagged exactly this shape as a non-sequitur — see aafbe97.",
    turns: [
      "User A: What makes something a sandwich is its structure — filling held by bread.",
      "User B: Structure isn't how we categorise food.",
      "User A: Sorting by cooking method fails too, since a wrap is a sandwich and it's never grilled.",
    ],
    expect: { nonSequitur: false },
  },
];

/** Structural facts that must hold whatever the model decided. */
function invariants(map) {
  const nodes = map.argument_map.nodes ?? [];
  const edges = map.argument_map.edges ?? [];
  const ids = new Set(nodes.map((n) => n.id));
  const problems = [];

  const withParent = new Set(edges.map((e) => e.from));
  const roots = nodes.filter((n) => !withParent.has(n.id));
  if (roots.length !== 1) problems.push(`expected exactly one root, found ${roots.length}: ${roots.map((r) => r.id).join(", ")}`);

  const outgoing = new Map();
  for (const e of edges) outgoing.set(e.from, (outgoing.get(e.from) ?? 0) + 1);
  for (const [id, n] of outgoing) if (n > 1) problems.push(`${id} has ${n} outgoing edges; a node may have one parent`);

  for (const e of edges) {
    if (!ids.has(e.from)) problems.push(`edge ${e.id} comes from a node that does not exist: ${e.from}`);
    if (!ids.has(e.to)) problems.push(`edge ${e.id} points at a node that does not exist: ${e.to}`);
  }

  for (const n of nodes) {
    const m = n.metadata ?? {};
    for (const t of m.tactics ?? []) {
      if (!TACTIC_KEYS.includes(t)) problems.push(`${n.id} carries an unknown tactic "${t}"`);
    }
    for (const ref of ["contradicts", "moves_goalposts_from", "despite_concession_of"]) {
      if (m[ref] && !ids.has(m[ref])) problems.push(`${n.id}.${ref} points at a node that does not exist: ${m[ref]}`);
    }
    if (m.non_sequitur) {
      const edge = edges.find((e) => e.from === n.id);
      if (edge && edge.relationship !== "unrelated") {
        problems.push(`${n.id} is flagged non-sequitur but its edge claims "${edge.relationship}"`);
      }
    }
    // The whole point of the 08-07 concession work: a suggestion is never applied.
    if (m.possible_concession && n.rating) {
      problems.push(`${n.id} carries a possible concession AND a rating of "${n.rating}"`);
    }
    if (m.possible_concession && (m.agreed_by || m.conceded_by)) {
      problems.push(`${n.id} is both a possible concession and a settled one`);
    }
  }
  return problems;
}

/** What the model concluded, reduced to the handful of facts a scenario cares about. */
function findings(map) {
  const nodes = map.argument_map.nodes ?? [];
  return {
    tactics: [...new Set(nodes.flatMap((n) => n.metadata?.tactics ?? []))],
    possibleConcession: nodes.some((n) => n.metadata?.possible_concession)
      || nodes.some((n) => n.metadata?.despite_concession_of),
    contradiction: nodes.some((n) => n.metadata?.contradicts),
    nonSequitur: nodes.some((n) => n.metadata?.non_sequitur),
    ratings: nodes.filter((n) => n.rating).map((n) => `${n.id}=${n.rating}`),
    nodeCount: nodes.length,
  };
}

test.describe("AI judgement — does the model reach the right conclusion", () => {
  for (const s of SCENARIOS) {
    test(`${s.name} @costly @judgement`, async ({ page }, testInfo) => {
      const conversation = s.turns.join("\n");
      test.setTimeout(combinedBudgetMs(conversation) + 60_000);

      await page.goto("/");
      await page.getByTestId("tab-history").click();
      await page.getByTestId("history-new-argument").click();

      const insertResponse = page.waitForResponse(
        (r) => r.url().includes("/rest/v1/debates") && r.request().method() === "POST",
      );

      await page.getByTestId("controls-chevron").click();
      await page.getByTestId("ctrl-combined").click();
      await page.getByTestId("combined-textarea").fill(conversation);
      await page.getByTestId("statement-submit").click();
      await waitForCombinedRun(page, conversation);
      await expect(page.getByTestId("statement-textarea")).toBeVisible();

      // Copy map JSON is the only route to the full metadata — cytoscape's node
      // data carries a rendering subset, not agreed_by, tactic_reasons and the
      // rest of what needs judging here.
      await page.getByTestId("settings-btn").click();
      await page.getByTestId("settings-advanced-toggle").click();
      await page.getByTestId("settings-copy-json").click();
      const raw = await page.evaluate(() => navigator.clipboard.readText());
      await page.keyboard.press("Escape");
      const map = JSON.parse(raw);

      const found = findings(map);
      const structural = invariants(map);
      const verdicts = [];
      const check = (label, ok, detail) => { verdicts.push({ label, ok, detail }); return ok; };

      if (s.expect.tacticsAny) {
        check(`detects one of [${s.expect.tacticsAny.join(", ")}]`,
          s.expect.tacticsAny.some((t) => found.tactics.includes(t)),
          `saw [${found.tactics.join(", ") || "none"}]`);
      }
      if (s.expect.possibleConcession) {
        check("records a possible concession", found.possibleConcession, "no node carried one");
      }
      if (s.expect.noRatings) {
        check("applies no rating", found.ratings.length === 0, `rated: ${found.ratings.join(", ")}`);
      }
      if (s.expect.contradiction) {
        check("spots the self-contradiction", found.contradiction, "no node carried metadata.contradicts");
      }
      if (s.expect.nonSequitur === true) {
        check("flags the change of subject", found.nonSequitur, "nothing flagged");
      }
      if (s.expect.nonSequitur === false) {
        check("does NOT flag an on-topic reply", !found.nonSequitur, "something was flagged non-sequitur");
      }

      fs.mkdirSync(OUT_DIR, { recursive: true });
      const report = { scenario: s.name, why: s.why, turns: s.turns, found, structural, verdicts, map };
      const file = path.join(OUT_DIR, `${s.name}.json`);
      fs.writeFileSync(file, JSON.stringify(report, null, 2));
      await testInfo.attach(`${s.name}.json`, { path: file, contentType: "application/json" });

      // Delete this run's row by id — never by "the newest".
      const debateId = (await (await insertResponse).json()).id;
      await page.evaluate(async ({ id, base, anon }) => {
        const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
        const token = JSON.parse(localStorage.getItem(key)).access_token;
        await fetch(`${base}/rest/v1/debates?id=eq.${id}`, {
          method: "DELETE",
          headers: { apikey: anon, Authorization: `Bearer ${token}`,
                     "Accept-Profile": "argument_mapper", "Content-Profile": "argument_mapper" },
        });
      }, { id: debateId, base: process.env.VITE_SUPABASE_URL, anon: process.env.VITE_SUPABASE_ANON_KEY });

      expect(structural, `structural invariants broken — see ${file}`).toEqual([]);
      const missed = verdicts.filter((v) => !v.ok);
      expect(missed, `the model got this wrong (${s.why}) — see ${file}`).toEqual([]);
    });
  }
});
