import { test, expect } from "@playwright/test";

// Manual node add/edit/rate/undo/redo/delete are all pure client-side map
// edits — the App.jsx handlers explicitly make no API call. This test builds
// a small throwaway argument by hand, exercises every editable/toggleable
// field on the node popup, then cleans up the auto-saved History row it
// creates (also exercising the History delete confirm/cancel flow).

async function clickNode(page, nodeId) {
  const badge = page.locator(`[data-node-id="${nodeId}"]`);
  const box = await badge.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} badge not found on screen`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe("Node lifecycle — manual add/edit/rate/undo/redo/delete", () => {
  test("full CRUD + flags on a hand-built argument", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();

    // Capture this test's own debate ID from the very first auto-save
    // response, so cleanup can delete it by exact ID rather than by
    // "whichever History row looks newest" — that assumption is what caused
    // a real user debate to get deleted by mistake during earlier test
    // development (a race between this test's debounced auto-save and the
    // History list's ordering). Never delete-by-position again.
    const insertResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/rest/v1/debates") && res.request().method() === "POST"
    );

    // ── Add node_1 (root claim) ─────────────────────────────────────────
    await page.getByTestId("controls-chevron").click();
    await page.getByTestId("ctrl-add-node").click();
    await page.getByTestId("node-edit-content").fill("Coffee is better than tea");
    await page.getByTestId("node-edit-save").click();

    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();
    await expect(page.locator(".type-badge")).toHaveCount(1);

    // App.jsx calls .insert(row).select().single(), so PostgREST returns a
    // single JSON object here, not an array.
    const insertResponse = await insertResponsePromise;
    const insertedRow = await insertResponse.json();
    const debateId = insertedRow.id;
    expect(debateId).toBeTruthy();

    // ── Add node_2, parented to node_1 ──────────────────────────────────
    await page.getByTestId("ctrl-add-node").click();
    await page.getByTestId("node-edit-content").fill("Tea has far more flavor variety");
    await page.getByTestId("node-edit-type").selectOption("objection");
    await page.getByTestId("node-edit-parent").selectOption("node_1");
    await page.getByTestId("node-edit-save").click();

    await expect(page.locator('[data-node-id="node_2"]')).toBeVisible();
    await expect(page.locator(".type-badge")).toHaveCount(2);

    // ── Open node_1, verify view mode, then edit every field ────────────
    await clickNode(page, "node_1");
    await expect(page.locator(".popup-summary")).toHaveText("Coffee is better than tea");

    await page.getByTestId("node-view-edit-btn").click();
    await page.getByTestId("node-edit-content").fill("Coffee is objectively better than tea");
    await page.getByTestId("node-edit-type").selectOption("premise");
    await page.getByTestId("node-edit-tactic-straw_man").click();
    await page.getByTestId("node-edit-nonsequitur-toggle").click();
    await page.getByTestId("node-edit-tag-input").fill("test-tag");
    await page.getByTestId("node-edit-tag-input").press("Enter");
    await page.getByTestId("node-edit-contradicts-toggle").click();
    await page.getByTestId("node-edit-contradicts-select").selectOption("node_2");
    await page.getByTestId("node-edit-save").click();

    // Save returns to view mode on the same node.
    await expect(page.locator(".popup-summary")).toHaveText("Coffee is objectively better than tea");
    await expect(page.locator(".type-badge.type-premise").first()).toBeVisible();
    await expect(page.locator(".popup-tag", { hasText: "test-tag" })).toBeVisible();
    await expect(page.locator(".flag-chip--contradiction")).toContainText("Contradicts");
    await expect(page.locator(".flag-chip--non-sequitur")).toBeVisible();
    await page.getByTestId("node-view-close-btn").click();

    // ── Undo reverts the entire edit in one step ────────────────────────
    await page.getByTestId("ctrl-undo").click();
    await clickNode(page, "node_1");
    await expect(page.locator(".popup-summary")).toHaveText("Coffee is better than tea");
    await expect(page.locator(".type-badge.type-claim").first()).toBeVisible();
    await page.getByTestId("node-view-close-btn").click();

    // ── Redo re-applies it ───────────────────────────────────────────────
    await page.getByTestId("ctrl-redo").click();
    await clickNode(page, "node_1");
    await expect(page.locator(".popup-summary")).toHaveText("Coffee is objectively better than tea");
    await page.getByTestId("node-view-close-btn").click();

    // ── Concede node_2 (retract own point — same speaker as node_2) ─────
    await clickNode(page, "node_2");
    const concedeBtn = page.getByTestId("node-concede-btn");
    await concedeBtn.click();
    await expect(concedeBtn).toHaveClass(/concede-btn--active/);
    await page.getByTestId("node-view-close-btn").click();

    // ── Delete node_2 (no children — single confirm step) ───────────────
    await clickNode(page, "node_2");
    await page.getByTestId("node-delete-btn").click();
    await page.getByTestId("node-delete-confirm-btn").click();
    await expect(page.locator('[data-node-id="node_2"]')).toHaveCount(0);

    // ── Delete node_1 — exercise Cancel first, then actually delete ─────
    await clickNode(page, "node_1");
    await page.getByTestId("node-delete-btn").click();
    await page.getByTestId("node-delete-cancel-btn").click();
    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();

    await page.getByTestId("node-delete-btn").click();
    await page.getByTestId("node-delete-confirm-btn").click();
    await expect(page.locator(".type-badge")).toHaveCount(0);
    await expect(page.locator("text=No statements yet.")).toBeVisible();

    // ── Clean up the exact History row this test created, by ID ─────────
    // Doubles as a test of the History delete confirm/cancel flow.
    await page.getByTestId("tab-history").click();
    const ownRow = page.locator(`[data-debate-id="${debateId}"]`);
    await expect(ownRow).toBeVisible();

    await ownRow.getByTestId("history-delete-btn").click();
    await page.getByTestId("history-delete-confirm-cancel").click();
    await expect(ownRow).toBeVisible();

    await ownRow.getByTestId("history-delete-btn").click();
    await page.getByTestId("history-delete-confirm-yes").click();
    await expect(page.locator(`[data-debate-id="${debateId}"]`)).toHaveCount(0);
  });
});
