/**
 * tactics.js — Definitions for argumentative tactics (fallacies & good techniques).
 *
 * Single source of truth imported by ArgumentMap.jsx, NodeList.jsx, and claude.js.
 */

export const TACTICS = {
  // Fallacies (bad)
  straw_man:            { symbol: "♟️", name: "Straw Man",                 type: "fallacy" },
  ad_hominem:           { symbol: "🎯", name: "Ad Hominem",               type: "fallacy" },
  no_true_scotsman:     { symbol: "🏴", name: "No True Scotsman",         type: "fallacy" },
  false_dilemma:        { symbol: "⚖️", name: "False Dilemma",            type: "fallacy" },
  slippery_slope:       { symbol: "🎿", name: "Slippery Slope",           type: "fallacy" },
  appeal_to_authority:  { symbol: "👑", name: "Appeal to Authority",      type: "fallacy" },
  red_herring:          { symbol: "🐟", name: "Red Herring",              type: "fallacy" },
  circular_reasoning:   { symbol: "🔄", name: "Circular Reasoning",      type: "fallacy" },
  appeal_to_emotion:    { symbol: "💔", name: "Appeal to Emotion",        type: "fallacy" },
  hasty_generalization: { symbol: "🏃", name: "Hasty Generalization",     type: "fallacy" },

  // Good techniques
  steel_man:                  { symbol: "💪", name: "Steel Man",                  type: "technique" },
  evidence_based:             { symbol: "📊", name: "Evidence Based",             type: "technique" },
  logical_deduction:          { symbol: "🧠", name: "Logical Deduction",          type: "technique" },
  addresses_counterargument:  { symbol: "🤝", name: "Addresses Counterargument",  type: "technique" },
  cites_source:               { symbol: "📚", name: "Cites Source",               type: "technique" },
};

/** All valid tactic keys, for use in prompts */
export const TACTIC_KEYS = Object.keys(TACTICS);
