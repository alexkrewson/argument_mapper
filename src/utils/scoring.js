/**
 * scoring.js — Points system for Game Mode.
 *
 * Point values are intentionally asymmetric: intellectual honesty (conceding
 * your own point) earns the most; personal attacks lose the most.
 */

// --- Point table --------------------------------------------------------

export const POINTS = {
  // Tactics — fallacies (bad)
  ad_hominem:                -15,  // personal attack, worst offence
  straw_man:                 -12,  // misrepresenting the opponent
  no_true_scotsman:          -10,
  false_dilemma:              -8,
  circular_reasoning:         -8,
  appeal_to_emotion:          -8,
  red_herring:                -8,
  slippery_slope:             -6,
  appeal_to_authority:        -6,
  hasty_generalization:       -6,

  // Tactics — good techniques (good)
  steel_man:                 +10,  // acknowledged strongest version of opponent's argument
  evidence_based:             +6,
  logical_deduction:          +5,
  addresses_counterargument:  +5,
  cites_source:               +4,

  // Tactics — rhetorical devices (mild positive)
  analogy:                    +2,

  // Structural flags
  contradiction:             -12,  // contradicted your own earlier position
  goalposts:                 -10,  // moved the goalposts
  non_sequitur:               -5,  // disconnected / off-topic node

  // Concessions
  self_retraction:           +20,  // YOU retracted your own node — most points (hardest to do)
  concession_given:          +12,  // you agree with the opponent's node (intellectual honesty)
  concession_received:        +8,  // opponent agrees with your node (your argument was strong)
};

// Map tactic keys to their point entry
const TACTIC_POINT_KEYS = {
  ad_hominem:               "ad_hominem",
  straw_man:                "straw_man",
  no_true_scotsman:         "no_true_scotsman",
  false_dilemma:            "false_dilemma",
  circular_reasoning:       "circular_reasoning",
  appeal_to_emotion:        "appeal_to_emotion",
  red_herring:              "red_herring",
  slippery_slope:           "slippery_slope",
  appeal_to_authority:      "appeal_to_authority",
  hasty_generalization:     "hasty_generalization",
  steel_man:                "steel_man",
  evidence_based:           "evidence_based",
  logical_deduction:        "logical_deduction",
  addresses_counterargument:"addresses_counterargument",
  cites_source:             "cites_source",
  analogy:                  "analogy",
};

// --- Score computation --------------------------------------------------

/** Compute total scores for both speakers from the full node list. */
export function computeScores(nodes) {
  const scores = { Blue: 0, Green: 0 };

  for (const node of nodes) {
    const sp = node.speaker;
    if (sp !== "Blue" && sp !== "Green") continue;

    // Tactics
    for (const tKey of (node.metadata?.tactics || [])) {
      const pointKey = TACTIC_POINT_KEYS[tKey];
      if (pointKey != null) scores[sp] += POINTS[pointKey];
    }

    // Structural flags
    if (node.metadata?.contradicts)          scores[sp] += POINTS.contradiction;
    if (node.metadata?.moves_goalposts_from) scores[sp] += POINTS.goalposts;
    if (node.metadata?.non_sequitur)         scores[sp] += POINTS.non_sequitur;

    // Self-retraction: speaker's own node was thumbed down
    if (node.rating === "down") {
      scores[sp] += POINTS.self_retraction;
    }

    // Concession: someone agreed with this node
    if (node.rating === "up") {
      const agreedBy = node.metadata?.agreed_by?.speaker;
      if (agreedBy && agreedBy !== sp) {
        scores[sp]      += POINTS.concession_received; // your point was validated
        scores[agreedBy] += POINTS.concession_given;   // you were honest enough to agree
      }
    }
  }

  return scores;
}

/** Compute per-speaker score delta between two node lists. */
export function computeScoreDelta(nodesBefore, nodesAfter) {
  const before = computeScores(nodesBefore);
  const after  = computeScores(nodesAfter);
  return {
    Blue:  after.Blue  - before.Blue,
    Green: after.Green - before.Green,
  };
}
