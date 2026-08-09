import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./support/fixtures.js";
import { revealChrome } from "./support/chrome.js";
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
  {
    name: "goalpost-move",
    why: "A narrows their own claim only after B produces a counterexample.",
    turns: [
      "User A: No phone under £300 has a decent camera.",
      "User B: The Pixel 8a is £299 and its camera is excellent.",
      "User A: I meant no phone under £300 has a decent camera and good battery life.",
    ],
    expect: { goalpost: true },
  },
  {
    name: "false-dilemma",
    why: "B presents two options as exhaustive when they plainly aren't.",
    turns: [
      "User A: The new hospital wing should be funded.",
      "User B: Either we fund the hospital or we fund the schools. There is no third option.",
    ],
    expect: { tacticsAny: ["false_dilemma"] },
  },
  {
    name: "circular-reasoning",
    why: "A's reason restates the claim.",
    turns: [
      "User A: Speeding fines reduce accidents, and we know they reduce accidents because they cut the number of crashes.",
      "User B: That reasoning doesn't establish anything.",
    ],
    expect: { tacticsAny: ["circular_reasoning"] },
  },
  {
    name: "no-true-scotsman",
    why: "A redefines the category to exclude B's counterexample.",
    turns: [
      "User A: Real cyclists always signal before turning.",
      "User B: My friend cycles every day and never signals.",
      "User A: Then he isn't a real cyclist.",
    ],
    expect: { tacticsAny: ["no_true_scotsman"] },
  },
  {
    name: "slippery-slope",
    why: "B chains unsupported consequences from one modest proposal.",
    turns: [
      "User A: E-scooters should be allowed on cycle paths.",
      "User B: Allow that and next it's motorbikes, then cars, and there will be no cycle paths left at all.",
    ],
    expect: { tacticsAny: ["slippery_slope"] },
  },
  {
    name: "hasty-generalization",
    why: "A generalises from a sample of two.",
    turns: [
      "User A: I met two rude people in Paris, so Parisians are rude.",
      "User B: That's two people out of two million.",
    ],
    expect: { tacticsAny: ["hasty_generalization"] },
  },
  {
    name: "red-herring",
    why: "B answers a spending question with a different administration's spending.",
    turns: [
      "User A: The council overspent on the leisure centre.",
      "User B: What about all the money the previous administration wasted on consultants?",
    ],
    expect: { tacticsAny: ["red_herring"] },
  },
  {
    name: "appeal-to-authority",
    why: "B's whole case is who said it, not what the evidence is.",
    turns: [
      "User A: Intermittent fasting has no proven benefit.",
      "User B: Dr Hoffman is a Nobel laureate and he says it does, so it does.",
    ],
    expect: { tacticsAny: ["appeal_to_authority"] },
  },
  {
    name: "steel-man",
    why: "B states A's point at its strongest before answering it.",
    turns: [
      "User A: Congestion charging is just a tax on the poor.",
      "User B: The strongest version of that is that a flat charge takes a bigger share of a low income, which is true. Exemptions can be means-tested though.",
    ],
    expect: { tacticsAny: ["steel_man"] },
  },
  {
    name: "analogy",
    why: "B argues from a parallel case rather than directly.",
    turns: [
      "User A: Banning phones in schools will never work.",
      "User B: Schools already ban alcohol and that works — a phone ban is the same kind of rule.",
    ],
    expect: { tacticsAny: ["analogy"] },
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
    for (const ref of ["contradicts", "moves_goalposts_from"]) {
      if (m[ref] && !ids.has(m[ref])) problems.push(`${n.id}.${ref} points at a node that does not exist: ${m[ref]}`);
    }
    // "A speaker cannot move the goalposts of the OTHER speaker — that is just
    // normal counter-argument." Deterministic, so it belongs here rather than
    // in a scenario's expectations.
    if (m.moves_goalposts_from) {
      const from = nodes.find((x) => x.id === m.moves_goalposts_from);
      if (from && from.speaker !== n.speaker) {
        problems.push(`${n.id} (${n.speaker}) claims to move the goalposts of ${from.id} (${from.speaker})`);
      }
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
    possibleConcession: nodes.some((n) => n.metadata?.possible_concession),
    contradiction: nodes.some((n) => n.metadata?.contradicts),
    goalpost: nodes.some((n) => n.metadata?.moves_goalposts_from),
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
      // Back in Turns mode. Not toBeVisible(): a finished run hides the chrome.
      await expect(page.getByTestId("statement-textarea")).toBeAttached();

      // Copy map JSON is the only route to the full metadata — cytoscape's node
      // data carries a rendering subset, not agreed_by, tactic_reasons and the
      // rest of what needs judging here.
      await revealChrome(page);   // a finished turn hides the header the button lives in
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
      if (s.expect.goalpost) {
        check("spots the goalpost move", found.goalpost, "no node carried metadata.moves_goalposts_from");
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
