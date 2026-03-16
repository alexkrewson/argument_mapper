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
 *
 * All node colors are calm, earthy, and muted — never electric or
 * fluorescent. Vivid badge colors (type badges, contradiction chips) are
 * intentionally harsh to contrast against these soft backgrounds.
 */

export const THEMES = {
  classic: {
    label: "Classic",
    a: { name: "Blue",   bg: "#6a8ca8", border: "#4a6882" },  // dusty steel blue
    b: { name: "Green",  bg: "#7a9c78", border: "#5a7658" },  // sage green
  },
  ocean: {
    label: "Ocean",
    a: { name: "Teal",   bg: "#5a7898", border: "#3c5872" },  // deep ocean slate
    b: { name: "Coral",  bg: "#b87c68", border: "#8a5444" },  // warm sand coral
  },
  sunset: {
    label: "Sunset",
    a: { name: "Amber",  bg: "#c49a6c", border: "#927244" },  // warm caramel
    b: { name: "Violet", bg: "#9478a8", border: "#6c5280" },  // dusty mauve
  },
  forest: {
    label: "Forest",
    a: { name: "Sage",   bg: "#5a8460", border: "#3a6040" },  // deep moss
    b: { name: "Rust",   bg: "#9c6450", border: "#724030" },  // muted terracotta
  },
  dusk: {
    label: "Dusk",
    a: { name: "Indigo", bg: "#8878a8", border: "#645684" },  // dusty periwinkle
    b: { name: "Rose",   bg: "#ac748c", border: "#845a6a" },  // dusty rose
  },
  night: {
    label: "Night",
    dark: true,
    a: { name: "Azure",  bg: "#6a8eaa", border: "#486a84" },  // muted steel blue
    b: { name: "Jade",   bg: "#5a8a7a", border: "#386858" },  // dusty pine
  },
  midnight: {
    label: "Midnight",
    dark: true,
    a: { name: "Violet", bg: "#7868a0", border: "#564878" },  // dusty iris
    b: { name: "Plum",   bg: "#9c6878", border: "#744858" },  // dusty plum
  },
  ember: {
    label: "Ember",
    dark: true,
    a: { name: "Amber",          bg: "#b87040", border: "#7a4820" },
    b: { name: "Teal",           bg: "#3d8c7a", border: "#255c50" },
  },
  // lcars: {
  //   label: "LCARS",
  //   dark: true,
  //   lcars: true,
  //   a: { name: "Callisto Orange", bg: "#FF9900", border: "#CC7700" },
  //   b: { name: "Melrose",         bg: "#9999CC", border: "#6666AA" },
  // },
};

export const DEFAULT_THEME_KEY = "classic";
