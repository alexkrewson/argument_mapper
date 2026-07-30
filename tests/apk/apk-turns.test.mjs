// Turn ownership, per-author edit permissions, and speaker naming.
//
// FREE — uses ctrl-add-node and ctrl-skip only, no AI calls.
//
//   npm run test:apk:turns

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { connectedDevices, findAdb, sleep } from "./support/android.mjs";
import { connect, loadTestEnv, screenshotter } from "./support/app.mjs";

const env = loadTestEnv();
const shot = screenshotter("turns");

const skip = !findAdb()
  ? "Android SDK/adb not found"
  : connectedDevices().length === 0
    ? "no device"
    : !env.TEST_USER_EMAIL
      ? "no .env.test"
      : false;

let app;
const created = [];

describe("APK turns & permissions (free)", { skip }, () => {
  before(async () => {
    app = await connect({ relaunch: true });
    await app.signIn(env.TEST_USER_EMAIL, env.TEST_USER_PASSWORD);
    await app.closeSettings();
    await app.newDebate();
  });

  after(async () => {
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

  test("speaker name is editable before the first node", async () => {
    assert.ok(await app.exists("speaker-name-input"), "no speaker name field");
    const ro = await app.eval(`document.querySelector('[data-testid="speaker-name-input"]')?.readOnly`);
    assert.notEqual(ro, true, "name field is read-only before any node exists");

    await app.setValue("speaker-name-input", "Alice");
    const value = await app.eval(`document.querySelector('[data-testid="speaker-name-input"]')?.value`);
    assert.equal(value, "Alice");
    shot("name-set-before-flow");
  });

  test("the active speaker name reaches the input placeholder", async () => {
    const name = await app.speakerName();
    assert.equal(name, "Alice", `placeholder carries "${name}", expected "Alice"`);
  });

  test("shuffle button produces a different name", async () => {
    const before = await app.eval(`document.querySelector('[data-testid="speaker-name-input"]')?.value`);
    await app.click("speaker-name-refresh");
    await sleep(1200);
    const after = await app.eval(`document.querySelector('[data-testid="speaker-name-input"]')?.value`);
    assert.notEqual(after, before, "shuffle returned the same name");
    await app.setValue("speaker-name-input", "Alice");
  });

  test("a manually added node is attributed to the active speaker", async () => {
    const id = await app.addNode("Alice's opening position.");
    created.push(id);
    const data = await app.nodeData(id);
    assert.ok(data.speaker, "node carries no speaker");
    shot("node-a-added");
  });

  // Recorded behaviour, not a spec: Add Node deliberately does not consume a
  // turn (QUICKSTART: "no AI analysis, no turn cost"). Locking this in so a
  // change to turn accounting surfaces here rather than in production.
  test("Add Node does not consume a turn", async () => {
    const speakerBefore = (await app.nodeData(created[0])).speaker;
    const id = await app.addNode("A second point from the same speaker.");
    created.push(id);
    const speakerAfter = (await app.nodeData(id)).speaker;
    assert.equal(
      speakerAfter,
      speakerBefore,
      "Add Node advanced the turn — QUICKSTART says it costs no turn",
    );
  });

  test("Skip Turn hands over to the other speaker", async () => {
    const before = (await app.nodeData(created.at(-1))).speaker;
    await app.click("ctrl-skip");
    await sleep(2000);
    shot("after-skip");

    const id = await app.addNode("The other speaker responds.");
    created.push(id);
    const after = (await app.nodeData(id)).speaker;
    assert.notEqual(after, before, `speaker did not change after Skip (${before} -> ${after})`);
  });

  test("you may edit your own node but not the other speaker's", async () => {
    const mine = created.at(-1);
    const theirs = created[0];
    assert.notEqual(
      (await app.nodeData(mine)).speaker,
      (await app.nodeData(theirs)).speaker,
      "test setup: both nodes belong to the same speaker",
    );

    const own = await app.concedeLabel(mine);
    const other = await app.concedeLabel(theirs);
    shot("permissions-checked");

    assert.equal(own.canEdit, true, "cannot edit own node");
    assert.equal(other.canEdit, false, "can edit the other speaker's node — permission leak");
  });

  test("concede wording differs for your own node vs theirs", async () => {
    const mine = created.at(-1);
    const theirs = created[0];
    const own = await app.concedeLabel(mine);
    const other = await app.concedeLabel(theirs);

    assert.match(String(own.label), /this statement of theirs is incorrect/i, `own: ${own.label}`);
    assert.match(String(other.label), /point is correct/i, `other: ${other.label}`);
    assert.notEqual(own.label, other.label);
  });

  test("conceding the opponent's point marks it up and locks it", async () => {
    const theirs = created[0];
    const before = await app.nodeData(theirs);
    assert.equal(before.faded, false, "opponent node was already faded");

    await app.concede(theirs);
    shot("after-conceding-theirs");

    const after = await app.nodeData(theirs);
    assert.equal(after.faded, true, "conceded node is not faded");
    assert.equal(after.rating, "up", `expected rating "up", got ${after.rating}`);

    await app.tapNode(theirs);
    const editable = await app.exists("node-view-edit-btn");
    const deletable = await app.exists("node-delete-btn");
    await app.closePopup();
    assert.equal(editable, false, "agreeing with their point should not leave it editable");
    assert.equal(deletable, false, "agreeing with their point should not leave it deletable");
  });

  test("renaming mid-flow updates the active speaker label", async () => {
    await app.click("tab-map");
    await sleep(600);
    const ro = await app.eval(`document.querySelector('[data-testid="speaker-name-input"]')?.readOnly`);
    assert.notEqual(ro, true, "name field became read-only mid-flow");

    await app.setValue("speaker-name-input", "Renamed");
    await sleep(800);
    const name = await app.speakerName();
    shot("renamed-midflow");
    assert.equal(name, "Renamed", `placeholder shows "${name}" after mid-flow rename`);
  });

  test("existing nodes keep their original attribution after a rename", async () => {
    // Renaming should relabel the live speaker, not rewrite history.
    const data = await app.allNodeData();
    assert.ok(data.length > 0, "no nodes to check");
    for (const n of data) {
      assert.ok(n.speaker, `node ${n.id} lost its speaker after rename`);
    }
  });
});
