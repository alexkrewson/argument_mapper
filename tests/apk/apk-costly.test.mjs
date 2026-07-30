// @costly — spends real Claude credits on the account in .env.test.
//
// Excluded from test:apk:all. Run deliberately:
//   npm run test:apk:costly
//
// Two turns, ~2-3¢ at the rates shown in the app's debug cost overlay. Everything
// that can be proven without an AI call lives in apk-flows / apk-turns instead.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { connectedDevices, findAdb, sleep } from "./support/android.mjs";
import { connect, loadTestEnv, screenshotter } from "./support/app.mjs";

const env = loadTestEnv();
const shot = screenshotter("costly");

const skip = !findAdb()
  ? "Android SDK/adb not found"
  : connectedDevices().length === 0
    ? "no device"
    : !env.TEST_USER_EMAIL
      ? "no .env.test"
      : process.env.RUN_COSTLY !== "1"
        ? "set RUN_COSTLY=1 to spend real credits"
        : false;

let app;
let firstNodeId = null;

describe("APK AI analysis (@costly)", { skip }, () => {
  before(async () => {
    app = await connect({ relaunch: true });
    await app.signIn(env.TEST_USER_EMAIL, env.TEST_USER_PASSWORD);
    await app.closeSettings();
    await app.newDebate();
  });

  after(async () => {
    if (app) {
      await app.closePopup();
      await app.closeSettings();
      app.close();
    }
  });

  test("signed-out submission is rejected without spending credits", async () => {
    // Guard on the deprecation of guest mode: the gate must hold, or turns get
    // charged to nobody.
    await app.ensureSection("settings-account-toggle", "settings-signout");
    await app.click("settings-signout");
    await sleep(4000);
    await app.closeSettings();

    await app.click("tab-map");
    await sleep(800);
    await app.setValue("statement-textarea", "This should never reach Claude.");
    await app.click("statement-submit");
    await sleep(4000);
    shot("signed-out-rejected");

    assert.ok(await app.exists("auth-submit"), "no sign-in prompt — submission may have gone through");
    assert.equal(await app.nodeCount(), 0, "a node was created while signed out");

    await app.signIn(env.TEST_USER_EMAIL, env.TEST_USER_PASSWORD);
    await app.closeSettings();
  });

  test("Claude analyses a statement into a node", async () => {
    const result = await app.submitStatement(
      "Remote work makes engineering teams more productive than working in an office.",
    );
    shot("first-node");
    assert.ok(result.after > result.before, "no node created");

    const nodes = await app.allNodeData();
    firstNodeId = nodes[0].id;
    assert.ok(nodes[0].label?.length > 0, "node has no label");
    assert.ok(nodes[0].type, "Claude did not assign a node type");
  });

  test("a rebuttal attaches to the existing argument", async () => {
    const before = await app.nodeCount();
    const result = await app.submitStatement(
      "That is false — remote workers are isolated and collaboration collapses without a shared office.",
    );
    shot("after-rebuttal");
    assert.ok(result.after > before, "rebuttal produced no nodes");

    const nodes = await app.allNodeData();
    const speakers = new Set(nodes.map((n) => n.speaker));
    assert.ok(speakers.size >= 2, `expected two speakers, saw ${[...speakers].join(", ")}`);
    assert.ok(
      nodes.some((n) => /objection|rebuttal/i.test(n.type ?? "")),
      `no objection/rebuttal node; types: ${nodes.map((n) => n.type).join(", ")}`,
    );
  });

  test("moderator tab reports on both speakers", async () => {
    await app.click("tab-moderator");
    await sleep(4000);
    shot("moderator");
    const text = await app.bodyText();
    assert.match(text, /USER A|Alice/i, "no analysis for the first speaker");
    assert.match(text, /USER B|Bob/i, "no analysis for the second speaker");
    assert.ok(text.length > 200, "moderator analysis suspiciously short");
    await app.click("tab-map");
    await sleep(800);
  });

  test("AI-created node exposes the original statement and summary", async () => {
    await app.tapNode(firstNodeId);
    shot("ai-node-popup");
    const text = await app.bodyText();
    assert.match(text, /ORIGINAL STATEMENT/i, "popup lacks the original statement");
    assert.match(text, /AI SUMMARY/i, "popup lacks the AI summary");
    await app.closePopup();
  });
});
