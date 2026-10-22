import { test, expect } from "./support/fixtures.js";

// View-only share links, end to end: the owner makes a link, a signed-OUT
// browser opens it, sees the map, sees the owner's next node arrive without
// reloading, and loses access the moment the owner stops sharing.
//
// Free to run: nodes are added by hand (no AI call). The debate is created
// here and deleted by exact ID at the end, never by position.
test.describe("Share view-only", () => {
  test("a signed-out viewer watches the map live until sharing stops", async ({ page, browser }) => {
    await page.goto("/");
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();

    const insertResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/rest/v1/debates") && res.request().method() === "POST"
    );
    await page.getByTestId("controls-chevron").click();
    await page.getByTestId("ctrl-add-node").click();
    await page.getByTestId("node-edit-content").fill("Share check root — safe to delete");
    await page.getByTestId("node-edit-save").click();
    const debateId = (await (await insertResponsePromise).json()).id;
    expect(debateId).toBeTruthy();

    try {
      await page.getByTestId("share-btn").click();
      await page.getByTestId("share-enable").click();
      const link = await page.getByTestId("share-link").inputValue();
      expect(link).toMatch(/\/\?view=[0-9a-f-]{36}$/);
      await page.getByTestId("share-copy").click();
      await expect(page.getByText("Link copied")).toBeVisible();
      await page.getByTestId("share-modal").click({ position: { x: 5, y: 5 } });
      await expect(page.getByTestId("share-modal")).toHaveCount(0);

      // A context of its own with no storage state: no session, no account.
      const viewerContext = await browser.newContext();
      const viewer = await viewerContext.newPage();
      try {
        await viewer.goto(link);
        await expect(viewer.getByTestId("shared-view")).toBeVisible();
        await expect(viewer.getByTestId("shared-badge")).toHaveText("View only · live");
        await expect(viewer.locator('[data-node-id="node_1"]')).toBeVisible();
        // Nothing to type into, and none of the app's chrome.
        await expect(viewer.locator("textarea")).toHaveCount(0);
        await expect(viewer.getByTestId("tab-map")).toHaveCount(0);

        // The owner adds a node; the viewer gets it on a poll, no reload.
        await page.getByTestId("ctrl-add-node").click();
        await page.getByTestId("node-edit-content").fill("Share check reply");
        await page.getByTestId("node-edit-type").selectOption("objection");
        await page.getByTestId("node-edit-parent").selectOption("node_1");
        await page.getByTestId("node-edit-save").click();
        await expect(viewer.locator('[data-node-id="node_2"]')).toBeVisible({ timeout: 20_000 });

        // Tapping a node shows it read-only.
        // A real mouse click at the badge: the tap is cytoscape's, not the DOM's.
        // Retried: each poll re-renders the badges, so the one just measured
        // can be detached by the time boundingBox() asks (null box).
        await expect(async () => {
          const box = await viewer.locator('[data-node-id="node_2"]').boundingBox();
          expect(box).not.toBeNull();
          await viewer.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await expect(viewer.getByTestId("shared-node-card")).toContainText("Share check reply", { timeout: 2_000 });
        }).toPass({ timeout: 15_000 });

        // Stop sharing: the next poll loses the map.
        await page.getByTestId("share-btn").click();
        await page.getByTestId("share-disable").click();
        await expect(page.getByTestId("share-enable")).toBeVisible();
        await expect(viewer.getByTestId("shared-unavailable")).toBeVisible({ timeout: 20_000 });
        await viewer.reload();
        await expect(viewer.getByTestId("shared-unavailable")).toBeVisible();
      } finally {
        await viewerContext.close();
      }
    } finally {
      // Cleanup — by ID.
      await page.goto("/");
      await page.getByTestId("tab-history").click();
      const ownRow = page.locator(`[data-debate-id="${debateId}"]`);
      await ownRow.getByTestId("history-delete-btn").click();
      await page.getByTestId("history-delete-confirm-yes").click();
      await expect(ownRow).toHaveCount(0);
    }
  });
});
