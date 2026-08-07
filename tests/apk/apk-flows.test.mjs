// Node lifecycle on the APK — add, inspect, edit, concede, delete, undo/redo.
//
// FREE: every node here is placed with ctrl-add-node, which makes no AI call and
// spends no credits. The only cost is a saved debate row on the test account,
// which newDebate() resets at the start.
//
//   npm run test:apk:flows

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { connectedDevices, findAdb, sleep } from "./support/android.mjs";
import { connect, loadTestEnv, screenshotter } from "./support/app.mjs";

const env = loadTestEnv();
const shot = screenshotter("flows");

const skip = !findAdb()
  ? "Android SDK/adb not found"
  : connectedDevices().length === 0
    ? "no device — start an emulator or plug in a phone"
    : !env.TEST_USER_EMAIL
      ? "no .env.test — copy .env.test.example (sign-in is required for the app)"
      : false;

let app;
let created = [];

describe("APK node lifecycle (free)", { skip }, () => {
  before(async () => {
    app = await connect({ relaunch: true });
    await app.signIn(env.TEST_USER_EMAIL, env.TEST_USER_PASSWORD);
    await app.closeSettings();
    await app.newDebate();
    shot("fresh-debate");
  });

  after(async () => {
    // Delete only what this run created, by id. Deleting "the top row" is how a
    // real debate got destroyed before — see tests/README.md.
    if (!app) return;
    for (const id of created) {
      try {
        await app.deleteNode(id);
      } catch {
        /* already gone */
      }
    }
    await app.closePopup();
    await app.closeSettings();
    app.close();
  });

  test("starts from an empty map", async () => {
    assert.equal(await app.nodeCount(), 0, "newDebate() left nodes behind");
  });

  test("Add Node places a node with no AI call", async () => {
    const id = await app.addNode("Automated tests catch regressions earlier than manual QA.");
    created.push(id);
    assert.ok(id, "no node id returned");
    assert.equal(await app.nodeCount(), 1);
    shot("node-added");

    const data = await app.nodeData(id);
    assert.match(data.label, /Automated tests catch regressions/);
    assert.ok(data.speaker, "node has no speaker attribution");
  });

  test("detail popup shows the node's content and controls", async () => {
    await app.tapNode(created[0]);
    shot("detail-popup");
    assert.ok(await app.exists("node-view-close-btn"), "no close button");
    assert.ok(await app.exists("node-concede-btn"), "no concede button");
    assert.ok(await app.exists("node-delete-btn"), "no delete button");
    assert.ok(await app.exists("node-view-edit-btn"), "own node should be editable");
    await app.closePopup();
  });

  test("edit window exposes statement, type and parent", async () => {
    await app.tapNode(created[0]);
    await app.click("node-view-edit-btn");
    await sleep(1500);
    shot("edit-window");
    for (const id of ["node-edit-content", "node-edit-type", "node-edit-parent", "node-edit-save", "node-edit-cancel"]) {
      assert.ok(await app.exists(id), `missing ${id}`);
    }
    await app.click("node-edit-cancel");
    await sleep(1000);
    await app.closePopup();
  });

  test("editing a statement persists the new text", async () => {
    const id = created[0];
    await app.tapNode(id);
    await app.click("node-view-edit-btn");
    await sleep(1200);
    await app.setValue("node-edit-content", "Edited by the automated suite.");
    await app.click("node-edit-save");
    await sleep(2500);
    await app.closePopup();
    shot("after-edit");

    const data = await app.nodeData(id);
    assert.match(data.label, /Edited by the automated suite/, `label did not update: ${data.label}`);
  });

  test("changing node type persists", async () => {
    const id = created[0];
    await app.tapNode(id);
    await app.click("node-view-edit-btn");
    await sleep(1200);
    const set = await app.selectValue("node-edit-type", "premise");
    await app.click("node-edit-save");
    await sleep(2500);
    await app.closePopup();

    const data = await app.nodeData(id);
    assert.equal(data.type, set, `type did not persist (wanted ${set}, got ${data.type})`);
  });

  test("undo reverts an add, redo restores it", async () => {
    const startCount = await app.nodeCount();
    const id = await app.addNode("Temporary node for undo.");
    created.push(id);
    assert.equal(await app.nodeCount(), startCount + 1);

    await app.click("ctrl-undo");
    await sleep(2000);
    assert.equal(await app.nodeCount(), startCount, "undo did not remove the node");
    shot("after-undo");

    await app.click("ctrl-redo");
    await sleep(2000);
    assert.equal(await app.nodeCount(), startCount + 1, "redo did not restore the node");
    shot("after-redo");
  });

  // Retracting your own node and conceding the opponent's are different acts and
  // must not converge: retraction is rating "down" and stays editable, agreement
  // is rating "up" and locks the node. The opponent case lives in apk-turns,
  // which has two speakers.
  test("retracting your own node fades it and marks it down", async () => {
    const id = created[0];
    const before = await app.nodeData(id);
    assert.equal(before.faded, false, "node was already faded");

    const label = await app.concede(id);
    assert.match(String(label), /this statement of theirs is incorrect/i, `label: ${label}`);
    shot("after-retract");

    const after = await app.nodeData(id);
    assert.equal(after.faded, true, "retracted node is not faded");
    assert.equal(after.rating, "down", `expected rating "down", got ${after.rating}`);

    await app.tapNode(id);
    const editable = await app.exists("node-view-edit-btn");
    await app.closePopup();
    assert.equal(editable, true, "your own retracted node should stay editable");
  });

  test("delete asks for confirmation and cancel is non-destructive", async () => {
    const id = await app.addNode("Node that survives a cancelled delete.");
    created.push(id);
    const before = await app.nodeCount();

    await app.tapNode(id);
    await app.click("node-delete-btn");
    await sleep(1200);
    shot("delete-confirm");
    assert.ok(await app.exists("node-delete-confirm-btn"), "no confirm button");
    assert.ok(await app.exists("node-delete-cancel-btn"), "no cancel button");

    await app.click("node-delete-cancel-btn");
    await sleep(1500);
    await app.closePopup();
    assert.equal(await app.nodeCount(), before, "cancel deleted the node anyway");
  });

  test("delete confirm removes the node", async () => {
    const id = created.at(-1);
    const before = await app.nodeCount();
    await app.tapNode(id);
    await app.click("node-delete-btn");
    await sleep(1000);
    await app.click("node-delete-confirm-btn");
    await sleep(2500);
    await app.closePopup();
    shot("after-delete");

    assert.equal(await app.nodeCount(), before - 1, "confirm did not delete");
    created = created.filter((c) => c !== id);
  });

  // Both oval incidents shipped in an APK that this suite called green, because
  // every check here asked whether nodes EXIST, never what they look like. The
  // web suite has the same two cases in tests/map-styling.spec.js; these are the
  // on-device half, and they matter more, because the WebView is where Alex saw
  // it and where the R8-minified build actually runs.
  describe("map styling — nodes must never fall back to cytoscape defaults", () => {
    let baseline;

    test("a placed node is styled by the app, not by cytoscape", async () => {
      const id = await app.addNode("Manual testing is obsolete");
      assert.ok(id, "no node was added");
      created.push(id);

      baseline = await app.nodeStyle(id);
      shot("styling-baseline");
      assert.ok(baseline, "could not read a node style");
      assert.equal(baseline.shape, "roundrectangle", `node rendered as ${baseline.shape}`);
      assert.notEqual(baseline.width, "30px", "node fell back to the default 30px width");
    });

    test("renaming the speaker leaves the map alone", async () => {
      // The stylesheet never reads a speaker name. It used to be rebuilt anyway,
      // because App's resolvedTheme changes identity on every keystroke here.
      const name = await app.shuffleName();
      const after = await app.nodeStyle();
      shot("styling-after-rename");
      assert.deepEqual(after, baseline, `shuffling to "${name}" restyled the map`);
    });

    test("switching theme restyles the nodes instead of unstyling them", async () => {
      await app.openSettings();
      if ((await app.themeCards()).length === 0) {
        await app.click("settings-themes-toggle");
        await sleep(1000);
      }
      const cards = await app.themeCards();
      assert.ok(cards.length > 1, `need at least two themes, found ${cards.length}`);

      // Any preset other than the one already applied — the colour has to move
      // for "it restyled" to mean anything.
      let changed = null;
      for (const name of cards) {
        await app.pickTheme(name);
        await app.closeSettings();
        const now = await app.nodeStyle();
        if (now && now.bg !== baseline.bg) { changed = { name, style: now }; break; }
        await app.openSettings();
        if ((await app.themeCards()).length === 0) {
          await app.click("settings-themes-toggle");
          await sleep(1000);
        }
      }
      shot("styling-after-theme");
      assert.ok(changed, "no theme changed the node colour — the stylesheet never reached the map");
      assert.equal(changed.style.shape, "roundrectangle",
        `theme ${changed.name} left nodes as ${changed.style.shape}`);
      assert.equal(changed.style.width, baseline.width,
        `theme ${changed.name} changed node geometry, not just colour`);
    });
  });

  test("all four tabs render", async () => {
    for (const tab of ["tab-map", "tab-moderator", "tab-history", "tab-about"]) {
      assert.ok(await app.exists(tab), `${tab} missing`);
      await app.click(tab);
      await sleep(1500);
      shot(tab);
      const text = await app.bodyText();
      assert.ok(text.length > 0, `${tab} rendered no text`);
    }
    await app.click("tab-map");
    await sleep(800);
  });
});
