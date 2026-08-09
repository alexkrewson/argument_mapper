// Waits for combined mode to finish processing a pasted conversation.
//
// Combined mode runs every turn sequentially through the AI in one background
// loop, then App.jsx switches inputMode back to "turns" when the whole thing
// finishes. That switch — the plain statement textarea reappearing — is the
// real completion signal. A node-count threshold is not enough: it can pass
// after turn 1 while later turns are still in flight, and Playwright tears the
// page down at the end of a test, which would truncate the AI's work and save
// a half-processed debate to a real account.
//
// WHY IDLE TIME RATHER THAN A TOTAL BUDGET. This used to be a flat 220s. Two
// @costly tests failed on 2026-08-03 having built correct maps — they simply
// weren't finished yet, and a sibling test with the SAME number of turns
// passed in 132s. So the variance is in per-call AI latency, not in the size
// of the conversation, and no fixed total is both tight enough to catch a
// genuine hang and loose enough to survive a slow afternoon.
//
// Waiting on *progress* separates those two cases: as long as new nodes keep
// landing, the run is healthy and we keep waiting. The overall cap only exists
// so a wedged run can't hang the suite forever.

const IDLE_MS = 90_000;         // no new node and no completion → treat as stalled
const PER_TURN_MS = 75_000;     // ceiling allowance per turn in the conversation
const FLOOR_MS = 180_000;

/** Turns are "Speaker: text" lines; fall back to 1 so the cap is never zero. */
export function countTurns(conversation) {
  const lines = String(conversation).split("\n").filter((l) => l.trim());
  return Math.max(1, lines.length);
}

/** Total wall-clock a run is allowed, used for the cap and for test.setTimeout(). */
export function combinedBudgetMs(conversation) {
  return Math.max(FLOOR_MS, countTurns(conversation) * PER_TURN_MS);
}

/**
 * Resolves when the run completes. Throws with a diagnosis rather than a bare
 * timeout, because "stalled after 3 nodes" and "still working at the cap" are
 * different problems and the old flat timeout reported them identically.
 *
 * @param {(count: number) => Promise<void>} [onNode] called after each new node
 *        lands, for step screenshots.
 */
export async function waitForCombinedRun(page, conversation, onNode) {
  const nodeBadges = page.locator(".type-badge");
  const statementTextarea = page.getByTestId("statement-textarea");
  const combinedTextarea = page.getByTestId("combined-textarea");

  const cap = Date.now() + combinedBudgetMs(conversation);
  let lastCount = 0;
  let lastProgress = Date.now();

  while (Date.now() < cap) {
    const count = await nodeBadges.count();
    if (count > lastCount) {
      lastCount = count;
      lastProgress = Date.now();
      await page.waitForTimeout(300); // let the new node's layout/fit settle
      if (onNode) await onNode(count);
    }

    // Completion is "the app went back to Turns mode", which is the combined
    // textarea being gone and the statement one being in the DOM.
    //
    // This used to check that the statement textarea was VISIBLE, and that
    // stopped being true on 2026-08-08: a finished run now hides the whole
    // chrome to reveal the map, so the element exists and is deliberately not
    // visible. Every combined test then waited out its cap — four minutes of
    // dead time after thirty-eight seconds of real work — and reported a stall
    // while the AI call log showed nothing but 200s.
    if (
      count > 0 &&
      (await combinedTextarea.count()) === 0 &&
      (await statementTextarea.count()) > 0
    ) return count;

    if (Date.now() - lastProgress > IDLE_MS) {
      throw new Error(
        `combined run stalled: no new node for ${Math.round(IDLE_MS / 1000)}s ` +
        `after ${lastCount} node(s), from ${countTurns(conversation)} turns`,
      );
    }
    await page.waitForTimeout(1000);
  }

  throw new Error(
    `combined run did not finish within ${Math.round(combinedBudgetMs(conversation) / 1000)}s ` +
    `(${lastCount} node(s) from ${countTurns(conversation)} turns). It was still making ` +
    `progress, so this is a slow run rather than a hang — raise PER_TURN_MS if it recurs.`,
  );
}
