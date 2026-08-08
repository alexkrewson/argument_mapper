import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./support/fixtures.js";

// Contrast, checked at the token level rather than by eye.
//
// apps-shared/css-best-practices.md: body and small UI text needs 4.5:1 against
// its background, non-text UI 3:1, and "text on an accent-coloured card must
// independently clear 4.5:1 — don't assume it's fine just because the palette
// looks high-contrast overall". That last line is exactly what went wrong: eight
// theme colours and four chips shipped below AA, and the control-row labels sat
// at 2.45:1, which is what Alex noticed on screen.
//
// This runs with no browser. It reads the palette straight out of themes.js, so
// a new theme is covered the moment it is added; the fixed colours below are
// mirrored from source and asserted to still BE in source, so changing one
// without the other fails here rather than silently drifting.

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AA_TEXT = 4.5;

const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Speaker palettes, read from source so new themes are covered automatically. */
function readThemes() {
  const src = fs.readFileSync(path.join(ROOT, "src", "utils", "themes.js"), "utf8");
  const out = [];
  const block = /(\w+)\s*:\s*\{([\s\S]*?)\n {2}\}/g;
  let m;
  while ((m = block.exec(src))) {
    const [, key, body] = m;
    const a = /a:\s*\{[^}]*bg:\s*"(#[0-9a-fA-F]+)",\s*border:\s*"(#[0-9a-fA-F]+)"/.exec(body);
    const b = /b:\s*\{[^}]*bg:\s*"(#[0-9a-fA-F]+)",\s*border:\s*"(#[0-9a-fA-F]+)"/.exec(body);
    if (a && b) out.push({ key, aBg: a[1], aBorder: b && a[2], bBg: b[1], bBorder: b[2] });
  }
  return out;
}

// Mirrored from source. `where` is asserted to still contain the literal, so a
// colour changed in one place and not the other is caught here.
const FIXED = [
  { name: "tactic · fallacy",        fg: "#ffffff", bg: "#dc2626", where: "src/components/ArgumentMap.jsx" },
  { name: "tactic · technique",      fg: "#ffffff", bg: "#12883e", where: "src/components/ArgumentMap.jsx" },
  { name: "tactic · rhetorical",     fg: "#ffffff", bg: "#b36205", where: "src/components/ArgumentMap.jsx" },
  { name: "badge · possible concession", fg: "#ffffff", bg: "#0c857b", where: "src/components/ArgumentMap.jsx" },
  { name: "chip · possible concession",  fg: "#ffffff", bg: "#0c857b", where: "src/App.css" },
  { name: "chip · possible concession (dark)", fg: "#ffffff", bg: "#0f766e", where: "src/App.css" },
  { name: "ctrl label · light",      fg: "#5b6675", bg: "#f8fafc", where: "src/App.css" },
  { name: "ctrl label · dark",       fg: "#8b98ab", bg: "#1e293b", where: "src/App.css" },
  { name: "ctrl icon · light",       fg: "#475569", bg: "#f8fafc", where: "src/App.css" },
  { name: "ctrl icon · dark",        fg: "#94a3b8", bg: "#1e293b", where: "src/App.css" },
  { name: "type badge · claim",      fg: "#ffffff", bg: "#6265f1", where: "src/App.css" },
  { name: "type badge · premise",    fg: "#ffffff", bg: "#64748b", where: "src/App.css" },
  { name: "type badge · evidence",   fg: "#ffffff", bg: "#07819f", where: "src/App.css" },
  { name: "type badge · objection",  fg: "#ffffff", bg: "#dc2626", where: "src/App.css" },
  { name: "type badge · rebuttal",   fg: "#ffffff", bg: "#cd4d0b", where: "src/App.css" },
  { name: "node text · light",       fg: "#0f172a", bg: "#f8fafc", where: "src/components/ArgumentMap.jsx" },
  { name: "node text · dark",        fg: "#e2e8f0", bg: "#1e293b", where: "src/components/ArgumentMap.jsx" },
];

test.describe("Contrast — every colour pair clears WCAG AA", () => {
  test("speaker palettes carry readable text in every theme", async () => {
    const themes = readThemes();
    expect(themes.length, "no themes parsed — has themes.js changed shape?").toBeGreaterThan(5);

    const failures = [];
    for (const t of themes) {
      // The node summary is near-black on the speaker fill, in every theme.
      for (const [side, bg] of [["A", t.aBg], ["B", t.bBg]]) {
        const r = contrast("#0f172a", bg);
        if (r < AA_TEXT) failures.push(`node text · ${t.key} ${side}: ${r.toFixed(2)}:1 on ${bg}`);
      }
      // The speaker-name chip is white on the border colour.
      for (const [side, bg] of [["A", t.aBorder], ["B", t.bBorder]]) {
        const r = contrast("#ffffff", bg);
        if (r < AA_TEXT) failures.push(`speaker chip · ${t.key} ${side}: ${r.toFixed(2)}:1 on ${bg}`);
      }
    }
    expect(failures, `below ${AA_TEXT}:1 —\n  ${failures.join("\n  ")}`).toEqual([]);
  });

  test("fixed UI colours clear AA, and still match source", async () => {
    const drift = [];
    const failures = [];
    for (const f of FIXED) {
      const src = fs.readFileSync(path.join(ROOT, f.where), "utf8");
      if (!src.includes(f.bg)) drift.push(`${f.name}: ${f.bg} no longer in ${f.where}`);
      const r = contrast(f.fg, f.bg);
      if (r < AA_TEXT) failures.push(`${f.name}: ${r.toFixed(2)}:1 (${f.fg} on ${f.bg})`);
    }
    expect(drift, `this table has drifted from source —\n  ${drift.join("\n  ")}`).toEqual([]);
    expect(failures, `below ${AA_TEXT}:1 —\n  ${failures.join("\n  ")}`).toEqual([]);
  });
});
