import { test, expect } from "./support/fixtures.js";

// Signed out: this is a pure client-side map interaction, so no account is
// needed and nothing reaches Supabase. Same reasoning as map-styling.spec.js.
test.use({ storageState: { cookies: [], origins: [] }, hasTouch: true });

// Sentry a39d0447, 2026-08-13: "Cannot read properties of undefined (reading
// 'emit')", from a real user on the web app. Reproduced against production
// before the fix, and it is not a race -- it happens every time.
//
// cytoscape's touchstart activates whatever element is under the finger, but
// only initialises `dragData.touchDragEles` inside an `if (nodeIsGrabbable)`
// branch. We set `autoungrabify: true`, so that branch never runs and the
// field is undefined for the entire life of the map. Land a second finger far
// enough away to count as a pinch and the handler does
// `draggedEles.emit('free')` on it, unguarded, and throws. cytoscape 3.34.1
// wraps those emits in `if (draggedEles)`.
//
// Three things about the gesture are load-bearing, and each one silently
// turned this test green while the bug was still there:
//
//  - Dispatch on the CANVAS, not the container div. eventInContainer walks up
//    from target.parentNode, so an event targeted at the container itself is
//    dropped before the handler body runs.
//  - The fingers must start MORE THAN 200px apart. Closer than that and
//    cytoscape reads the second finger as a context tap, which returns early
//    and never reaches the pinch code.
//  - The first finger must land ON a node, so `touchData.start` is set and
//    active. The crash sits behind `if (_start && _start.active())`.
const CXT_DIST_THRESHOLD = 200; // cytoscape's context-tap cutoff

const pinchStartingOnANode = `(() => {
  const el = [...document.querySelectorAll("div")].find(d => d._cyreg);
  if (!el) throw new Error("no cytoscape container on the page");
  const n = el._cyreg.cy.nodes()[0];
  if (!n) throw new Error("no nodes on the map");

  const box = el.getBoundingClientRect();
  const p = n.renderedPosition();
  const x = box.left + p.x;
  const y = box.top + p.y;

  const target = document.elementFromPoint(x, y);
  if (!target || target.tagName !== "CANVAS") {
    throw new Error("expected a cytoscape canvas under the node, got " + (target && target.tagName));
  }

  const at = (id, cx, cy) => new Touch({
    identifier: id, target, clientX: cx, clientY: cy, pageX: cx, pageY: cy,
  });
  const fire = (type, touches) => target.dispatchEvent(new TouchEvent(type, {
    bubbles: true, cancelable: true,
    touches, targetTouches: touches, changedTouches: touches,
  }));

  const spread = ${CXT_DIST_THRESHOLD} + 60;
  const f1 = at(0, x, y);
  fire("touchstart", [f1]);                                    // finger on the node
  fire("touchstart", [f1, at(1, x + spread, y + 40)]);         // second finger, a real pinch
  fire("touchmove",  [at(0, x - 30, y - 30), at(1, x + spread + 70, y + 90)]);
  fire("touchend", []);
  return true;
})()`;

test.describe("Map — two-finger gestures", () => {
  test("pinching with a finger that started on a node does not throw", async ({ page }) => {
    // An exception inside a dispatched listener does not propagate out of
    // dispatchEvent -- it surfaces as an uncaught error, which is exactly how
    // Sentry saw it. So watch the page, not the evaluate() call.
    const crashes = [];
    page.on("pageerror", (err) => crashes.push(err.message));

    await page.goto("/");
    await page.getByTestId("controls-chevron").click();
    await page.getByTestId("ctrl-add-node").click();
    await page.getByTestId("node-edit-content").fill("Pinching should not crash the map");
    await page.getByTestId("node-edit-save").click();
    await expect(page.locator('[data-node-id="node_1"]')).toBeVisible();

    await page.evaluate(pinchStartingOnANode);

    expect(crashes, "uncaught error during pinch").toEqual([]);

    // And the map is still alive afterwards, not wedged mid-gesture.
    const nodes = await page.evaluate(
      `[...document.querySelectorAll("div")].find(d => d._cyreg)._cyreg.cy.nodes().length`
    );
    expect(nodes).toBe(1);
  });
});
