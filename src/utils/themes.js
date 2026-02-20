/**
 * themes.js — Color theme presets for the two speakers.
 *
 * Internal speaker IDs remain "Blue" and "Green" in the data model and
 * Claude API. Themes provide display names and colors that replace them
 * throughout the UI.
 */

export const THEMES = {
  classic: {
    label: "Classic",
    a: { name: "Blue",   bg: "#dbeafe", border: "#3b82f6" },
    b: { name: "Green",  bg: "#dcfce7", border: "#22c55e" },
  },
  ocean: {
    label: "Ocean",
    a: { name: "Teal",   bg: "#ccfbf1", border: "#0d9488" },
    b: { name: "Coral",  bg: "#ffe4e6", border: "#f43f5e" },
  },
  sunset: {
    label: "Sunset",
    a: { name: "Amber",  bg: "#fef3c7", border: "#d97706" },
    b: { name: "Violet", bg: "#ede9fe", border: "#7c3aed" },
  },
  forest: {
    label: "Forest",
    a: { name: "Sage",   bg: "#d1fae5", border: "#059669" },
    b: { name: "Rust",   bg: "#ffedd5", border: "#c2410c" },
  },
  dusk: {
    label: "Dusk",
    a: { name: "Indigo", bg: "#e0e7ff", border: "#4338ca" },
    b: { name: "Rose",   bg: "#fce7f3", border: "#be185d" },
  },
  night: {
    label: "Night",
    dark: true,
    a: { name: "Azure",   bg: "#1e3a5f", border: "#60a5fa" },
    b: { name: "Jade",    bg: "#064e3b", border: "#34d399" },
  },
  midnight: {
    label: "Midnight",
    dark: true,
    a: { name: "Violet",  bg: "#2d1b69", border: "#a78bfa" },
    b: { name: "Crimson", bg: "#450a0a", border: "#f87171" },
  },
  ember: {
    label: "Ember",
    dark: true,
    a: { name: "Amber",   bg: "#b87040", border: "#7a4820" },
    b: { name: "Teal",    bg: "#3d8c7a", border: "#255c50" },
  },
};

export const DEFAULT_THEME_KEY = "classic";
