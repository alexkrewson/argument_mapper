/**
 * themes.js — Color theme presets for the two speakers.
 *
 * Internal speaker IDs remain "Blue" and "Green" in the data model and
 * Claude API. Themes provide display names and colors that replace them
 * throughout the UI.
 *
 * bg     — used as the full card/node background fill
 * border — a slightly deeper shade of the same hue; used for badges,
 *          gauge markers, and subtle accents (not rendered as a visible
 *          border on cards or nodes — border-width is 0).
 */

export const THEMES = {
  classic: {
    label: "Classic",
    a: { name: "Blue",   bg: "#3b82f6", border: "#1d4ed8" },
    b: { name: "Green",  bg: "#22c55e", border: "#15803d" },
  },
  ocean: {
    label: "Ocean",
    a: { name: "Teal",   bg: "#0d9488", border: "#0f766e" },
    b: { name: "Coral",  bg: "#f43f5e", border: "#be123c" },
  },
  sunset: {
    label: "Sunset",
    a: { name: "Amber",  bg: "#d97706", border: "#b45309" },
    b: { name: "Violet", bg: "#7c3aed", border: "#6d28d9" },
  },
  forest: {
    label: "Forest",
    a: { name: "Sage",   bg: "#059669", border: "#047857" },
    b: { name: "Rust",   bg: "#c2410c", border: "#9a3412" },
  },
  dusk: {
    label: "Dusk",
    a: { name: "Indigo", bg: "#4338ca", border: "#3730a3" },
    b: { name: "Rose",   bg: "#be185d", border: "#9d174d" },
  },
  night: {
    label: "Night",
    dark: true,
    a: { name: "Azure",   bg: "#60a5fa", border: "#2563eb" },
    b: { name: "Jade",    bg: "#34d399", border: "#059669" },
  },
  midnight: {
    label: "Midnight",
    dark: true,
    a: { name: "Violet",  bg: "#a78bfa", border: "#7c3aed" },
    b: { name: "Crimson", bg: "#f87171", border: "#dc2626" },
  },
  ember: {
    label: "Ember",
    dark: true,
    a: { name: "Amber",   bg: "#b87040", border: "#7a4820" },
    b: { name: "Teal",    bg: "#3d8c7a", border: "#255c50" },
  },
};

export const DEFAULT_THEME_KEY = "classic";
