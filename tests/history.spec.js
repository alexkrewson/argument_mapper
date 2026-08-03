import { test, expect } from "./support/fixtures.js";

// Creates its own debate instead of assuming the test account already owns one.
// It used to assume, and the assumption broke: the July 2026 probe incident
// deleted every debate belonging to the .env.test account, so this spec failed
// against the old Supabase project and the new one alike, for reasons that had
// nothing to do with History.
//
// Still free to run. Adding a node by hand is a pure client-side map edit — the
// App.jsx handlers make no AI call — and loading a saved debate just fetches
// stored map_data. Cleanup deletes by exact ID, never by position; see the note
// in node-lifecycle.spec.js for the incident that rule exists to prevent.
test.describe("History", () => {
  test("lists a saved debate and loads it back", async ({ page }) => {
    const STATEMENT = "History reload check — safe to delete";

    await page.goto("/");
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();

    // Capture the ID from the first auto-save so cleanup can target this exact
    // row. App.jsx calls .insert(row).select().single(), so PostgREST returns a
    // single object rather than an array.
    const insertResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/rest/v1/debates") && res.request().method() === "POST"
    );

    await page.getByTestId("controls-chevron").click();
    await page.getByTestId("ctrl-add-node").click();
    await page.getByTestId("node-edit-content").fill(STATEMENT);
    await page.getByTestId("node-edit-save").click();
    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();

    const insertedRow = await (await insertResponsePromise).json();
    const debateId = insertedRow.id;
    expect(debateId).toBeTruthy();

    // Clear the canvas before loading, for two reasons: what comes back is then
    // provably from the server rather than left over in component state, and
    // the title click only loads directly when the current map is empty —
    // otherwise it raises a "replace what you have?" confirmation instead.
    await page.getByTestId("tab-history").click();
    await page.getByTestId("history-new-argument").click();
    await expect(page.locator(".type-badge")).toHaveCount(0);

    await page.getByTestId("tab-history").click();
    const ownRow = page.locator(`[data-debate-id="${debateId}"]`);
    await expect(ownRow).toBeVisible({ timeout: 10_000 });

    await ownRow.getByTestId("history-row-title").click();

    await expect(page.getByTestId("tab-map")).toHaveClass(/tab-btn--active/);
    await expect(page.locator(".type-badge").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();

    // Cleanup — by ID.
    await page.getByTestId("tab-history").click();
    await ownRow.getByTestId("history-delete-btn").click();
    await page.getByTestId("history-delete-confirm-yes").click();
    await expect(page.locator(`[data-debate-id="${debateId}"]`)).toHaveCount(0);
  });
});
