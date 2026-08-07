import { test, expect } from "./support/fixtures.js";

// Signed out on purpose. Adding a node is a pure client-side map edit, so this
// file needs no account -- and staying signed out means no debounced auto-save
// and therefore no Supabase row to clean up afterwards.
test.use({ storageState: { cookies: [], origins: [] } });

// Twice now the map has silently reverted to stock cytoscape rendering -- grey
// ellipses, 30px wide, black labels -- while every other assertion in the suite
// still passed. 2026-08-03 it was an undefined value in the stylesheet; today it
// was cy.style(sheet) swapping in a Style instance the rendered elements were
// never re-bound to. Different causes, identical symptom, and both invisible to
// a suite that only ever checked that nodes EXIST.
//
// So this asserts on what actually renders. `shape` is the tell: no theme, no
// speaker and no node type ever makes a node an ellipse, so reading "ellipse"
// means styling has collapsed to defaults no matter which bug caused it.
const nodeStyle = `(() => {
  const el = [...document.querySelectorAll("div")].find(d => d._cyreg);
  if (!el) throw new Error("no cytoscape container on the page");
  const n = el._cyreg.cy.nodes()[0];
  if (!n) throw new Error("no nodes on the map");
  return { shape: n.style("shape"), width: n.style("width"), bg: n.style("background-color") };
})()`;

async function addNode(page, text) {
  await page.getByTestId("ctrl-add-node").click();
  await page.getByTestId("node-edit-content").fill(text);
  await page.getByTestId("node-edit-save").click();
  await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();
}

test.describe("Map styling — nodes must never fall back to cytoscape defaults", () => {
  test("renaming a speaker does not reset the map to grey ellipses", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("controls-chevron").click();
    await addNode(page, "Manual testing is obsolete");

    const before = await page.evaluate(nodeStyle);
    expect(before.shape).toBe("roundrectangle");

    // The speaker name is not read by the stylesheet at all, so this must be a
    // no-op for rendering. It was not: App's resolvedTheme changes identity on
    // every keystroke here, which re-applied the whole stylesheet.
    await page.getByTestId("speaker-name-refresh").click();
    await expect.poll(async () => (await page.evaluate(nodeStyle)).shape).toBe("roundrectangle");

    const after = await page.evaluate(nodeStyle);
    expect(after).toEqual(before);
  });

  test("switching theme restyles the nodes instead of unstyling them", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("controls-chevron").click();
    await addNode(page, "Manual testing is obsolete");

    const before = await page.evaluate(nodeStyle);
    expect(before.shape).toBe("roundrectangle");

    await page.getByTestId("settings-btn").click();
    await page.getByTestId("settings-themes-toggle").click();
    await page.getByTestId("theme-option-classic").click();

    await expect.poll(async () => (await page.evaluate(nodeStyle)).bg).not.toBe(before.bg);

    const after = await page.evaluate(nodeStyle);
    // The colour changed because the theme did — the geometry must not have.
    expect(after.shape).toBe("roundrectangle");
    expect(after.width).toBe(before.width);
  });
});
