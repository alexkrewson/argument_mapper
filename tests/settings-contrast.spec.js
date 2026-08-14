import { test, expect } from "./support/fixtures.js";

// Contrast of the settings panel as RENDERED, in every theme.
//
// contrast.spec.js already checks the palette at the token level, with no
// browser. It cannot catch this class of bug: the settings labels were fixed
// greys in App.css, not theme tokens, so they never appeared in themes.js and
// every token-level check passed while the panel shipped at 1.57:1.
//
// Alex reported the section text as hard to read on 2026-08-14. It was 19 of 34
// text nodes below AA in all eight themes -- worst in the dark ones, where
// .settings-section-label was #475569 on #1e293b (1.93:1) and the chevron, with
// opacity 0.7 on top, reached 1.57:1.
//
// Two things this measures that a naive version gets wrong, both found by
// checking rather than assuming:
//   - ancestor opacity compounds. The label's own opacity is 1 while its row
//     sits at 0.38, so reading only the element understates nothing and
//     overstates everything.
//   - translucent colours must be composited onto what is actually behind them,
//     walking up until something opaque is found.
test.use({ storageState: { cookies: [], origins: [] } });

const THEMES = ["classic", "ocean", "sunset", "forest", "dusk", "night", "midnight", "ember"];

const AUDIT = `(() => {
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const parse = (s) => {
    const m = s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(",").map(x => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => 0.2126*srgb(c.r) + 0.7152*srgb(c.g) + 0.0722*srgb(c.b);
  const ratio = (f, b) => { const [hi, lo] = [lum(f), lum(b)].sort((x,y)=>y-x); return (hi+0.05)/(lo+0.05); };
  const over = (fg, bg) => ({
    r: fg.r*fg.a + bg.r*(1-fg.a),
    g: fg.g*fg.a + bg.g*(1-fg.a),
    b: fg.b*fg.a + bg.b*(1-fg.a), a: 1,
  });

  // First opaque background at or above this element, compositing any
  // translucent layers on the way up.
  const effBg = (el) => {
    let n = el, acc = null;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (c.a === 1) return acc; }
      n = n.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor) || { r:255, g:255, b:255, a:1 };
    return acc ? over(acc, body) : body;
  };

  // Opacity multiplies down the tree, so the element's own value is not enough.
  const stackedOpacity = (el) => {
    let o = 1, n = el;
    while (n && n !== document.documentElement) {
      o *= parseFloat(getComputedStyle(n).opacity);
      n = n.parentElement;
    }
    return o;
  };

  const root = document.querySelector('[data-testid="settings-dropdown"]');
  if (!root) return { error: "settings dropdown is not open" };

  const out = [];
  for (const el of root.querySelectorAll("*")) {
    // Only elements holding their own text, so a wrapper is not blamed for its
    // children's colours.
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;

    // WCAG 1.4.3 exempts inactive controls. "Point sounds" is dormant until
    // Game Mode is on, and is dimmed to say so.
    if (el.closest(".settings-toggle-row--dormant")) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;

    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const bg = effBg(el);
    const o = stackedOpacity(el);
    const fg = over({ ...fg0, a: fg0.a * o }, bg);

    const px = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;   // WCAG large-text rule

    const r = ratio(fg, bg);
    if (r < need) {
      out.push({
        cls: (el.className || "").toString().split(" ").filter(Boolean).slice(0, 2).join(" ") || el.tagName,
        text: el.textContent.trim().slice(0, 24),
        ratio: +r.toFixed(2), need, color: cs.color, fontSize: +px.toFixed(1),
      });
    }
  }
  return { failures: out };
})()`;

test.describe("Settings panel contrast", () => {
  for (const theme of THEMES) {
    test(`every label clears AA in the ${theme} theme`, async ({ page }) => {
      await page.goto("/");
      await page.evaluate((t) => localStorage.setItem("theme", t), theme);
      await page.reload();

      await page.getByTestId("settings-btn").click();
      await expect(page.getByTestId("settings-dropdown")).toBeVisible();

      // Collapsed sections have zero-size text, which the audit skips -- so open
      // everything, or most of the panel goes unchecked.
      for (const toggle of await page.locator(".settings-section-toggle").all()) {
        await toggle.click().catch(() => {});
      }
      // Clicking leaves the pointer on the last toggle; :hover has its own
      // colour, and the resting state is what we mean to assert.
      await page.mouse.move(0, 0);

      const res = await page.evaluate(AUDIT);
      expect(res.error, res.error ?? "").toBeUndefined();
      expect(res.failures.length, `below AA:\n${JSON.stringify(res.failures, null, 2)}`).toBe(0);
    });
  }
});
