# Manual test plan — iDisagree on a real Android phone

Written 2026-08-07, for the pass before the first closed-testing upload.

This list is deliberately weighted towards **what the automated suites cannot
prove**. The 55 APK checks and 23 web tests already cover the logic; an emulator
driven over CDP cannot cover touch gestures, a real keyboard, a real network, a
real inbox, or a real device's idea of memory pressure. Those are what most of
this document is.

Keep it in step with `maintenance_todo.txt` — when a case here finds something,
the finding belongs there, not in this file.

## Build the right artifact

Test the **release** build, not the debug one. Debug is unminified, and R8 is
exactly the class of thing that only breaks in the artifact that ships.

```
npm run build:apk:release
→ android/app/build/outputs/apk/release/app-release.apk
```

It is signed with `android/upload-keystore.jks` (alias `upload`). Play re-signs
with the app-signing key on delivery, so a tester's copy differs in signature
but not in behaviour.

**Uninstall before installing, every time.** Every local build is `versionCode 2`
/ `versionName 1.0`, so Android's App Info cannot tell two of them apart, and the
Drive filenames differ only in the timestamp — `…-0915-…` and `…-0938-…` sitting
next to each other. On 2026-08-07 a whole cycle was spent debugging the *app*
when the finding was that the old APK was still installed: the email template is
server-side, so a new-style email arrived into an old-style app and the symptom
pointed at the code. If a build behaves like the one before it, rule this out
first.

**But uninstalling does NOT give you a clean slate, and this file used to imply
it did.** `android:allowBackup` is unset in the manifest, so it defaults to
`true` and Android Auto Backup restores the app's data the moment it is
reinstalled — **including the Supabase session**. Found on 2026-08-11: an
uninstall/reinstall cycle came back still signed in as `+test7`, and the Backup
Manager confirmed our package registered with a backup timestamp.

So the rule above buys you the right *code*. It does not buy you first-run state,
an empty History, or a signed-out app. When a case actually needs those, clear
the data explicitly:

```
adb shell pm clear com.alexkrewson.argumentmapper     # data, no restore
adb shell bmgr enabled                                # is backup even on?
```

Worth knowing beyond testing: that backup carries an auth token off the device to
Google Drive, restorable onto another phone on the same Google account. Left as
the platform default for the first submission, deliberately — turning it off is a
one-line manifest change but it is user-visible, since people would stop staying
signed in across a reinstall or a new phone. Revisit with the system-bar work.

## Three things to know before you start

- **Sentry fires from a real phone.** The emulator is dropped in `beforeSend` by
  UA match (`sdk_gphone64_x86_64`); a physical device is not. Anything you crash
  lands in the production `idisagree` project looking like a real user's crash,
  with a **minified** stack trace. That is the one way to prove the pipeline
  end to end from a device — just don't mistake your own test crash for a
  tester's a week later.
- **AI turns spend real credits, and Buy Credits is hidden on Android.** Run the
  balance down mid-session and there is no way to top up from the phone; you top
  up on the web.
- **Use a throwaway account for the auth cases**, not the `.env.test` one. If you
  clean up afterwards, delete by id or by title — never by position.

## Confirmed so far

Ticks are deliberately not used below, because a tick doesn't say *which build*
it passed on and every build so far has looked identical from the phone.

| | build | result |
|---|---|---|
| B1, B2 | release `0938`, 2026-08-07 | sign-up shows the code screen; the email carries a code and no link; the code confirms the account in-app |
| D6 | release `1136`, 2026-08-07 | back closes settings, returns to the map from a tab, and takes two presses to exit — asserted on the focused window |
| I1, I2 | release `1316`, 2026-08-07 | a concession implied in Combined mode badges the node and applies nothing |
| A1–A5 | release `1000`, 2026-08-11, Pixel 6 / Android 16 | installs clean; cold start 263 ms to activity and under 3 s to a mounted map, *faster* than the emulator's 5–7 s; icon and name right in both launcher and recents; force-stop and reboot both relaunch clean; rotates both ways without loss |
| A3 (icon) | same | **the adaptive-icon fix confirmed on real launcher art.** Photographed the 08-08 build first: claim node sliced flat at the top, both children cut off at the sides. Same shot after: whole tree inside the mask with margin |
| C1–C5 | same | name/shuffle drive both the turn label and the placeholder; manual add attributes to the active speaker with no AI call; a Turns submit lands typed `Objection` with a tactic badge and an edge to its parent rather than floating; submit hands A→B, Skip hands B→A, colours follow |
| C6 | same | 5-line A/B conversation → 7 correctly-typed, correctly-attributed nodes. It caught a planted appeal-to-popularity and typed it `Objection`, summarised as a bandwagon fallacy. Timing: see the note below — the first figure recorded here was wrong |
| C7 | same | Moderator reports on **both** speakers with node citations — User A "engaging at the argumentative level rather than attacking the person… but remain defensive", flagged `Contradicted own position: Node 1 ⚠ Node 2`; User B "shift from specific evidence to sweeping universal claims", tagged `Evidence Based (Node 4)`. Plus a moderator chat box |
| C9 | same | concede-your-own = retract. Banner `↩ Retracted — User B retracted this argument via concession`, the button locks to a green tick, and the node **plus every descendant** fades while untouched branches stay at full opacity |
| C10 | same | Undo restored a deleted subtree *with its edits intact* and lit Redo; Redo re-applied the delete and went dim again; Undo restored it once more |
| C12, C13 | same | statement edit persists and leaves ORIGINAL STATEMENT untouched; type Evidence → Clarification persists on the node header |
| C14 | same | the other speaker's node offers **only close** — no pencil, no delete. Your own offers both |
| C15 | same | inline `Delete Node 4?` with Cancel/Delete; Cancel is non-destructive; confirming a node with children raises a **second** guard — "This node has 1 direct child. Their descendants will also be deleted" — before Delete all |
| C8, C11 | same | detail popup carries the verbatim original *and* the AI summary — `(manually added)` for a hand-added node — plus tactics with rationale and a contradiction banner. Concession wording differs as intended: an opponent's node offers "Suggest X conceded this" with "a suggestion only — nothing is scored", your own says "X concedes that this statement of theirs is incorrect" |

### Timing a Combined run, and how not to

**Correction.** The first version of this table said a 5-line Combined run took
"~4–4.5 min, at or above the desktop range". That was an **upper bound reported
as a measurement** — the submit was at 11:00:38 and nobody looked until 11:05.
Four attempts later, here is what is actually known:

- **3 lines, mid-sized map: ~45 s**, confirmed by watching the screen rather
  than a detector.
- **5 lines, ~15-node map: still on "Processing turn 3 of 5" at ~220 s.** So the
  full run is minutes, not seconds, and the earlier magnitude was about right by
  luck rather than method.
- Which suggests the variance is **not only per-call latency**, as this file
  assumed: a bigger map means a bigger context on every call, so the same number
  of lines costs more on a long argument than a fresh one.

**Combined mode answers the "does it look hung" question well.** The footer reads
`Processing turn 3 of 5...` and the button says `Processing...`, so you can see
both that it is alive and how far through it is. A single Turns submit shows
`Considering User A's statement···` / `Thinking...`.

Three ways of detecting completion that all lied, so nobody repeats them:

1. **Button-colour or footer-brightness sampling** — `adb exec-out screencap`
   returns a **stale frame** on a display that has dozed, and it keeps returning
   it. Forty samples of byte-identical brightness is the signature. `input
   keyevent KEYCODE_WAKEUP` before each grab did *not* reliably fix it.
2. **Hashing the `Last turn:` cost line** — it updates after **every sub-turn**,
   not at the end, so it changes within seconds of submitting.
3. **The footer growing** when processing starts also moves that line, which
   fires any naive region hash immediately.

What does work: watch for the chrome to disappear — `setUiVisible(false)` runs
when a turn lands — and confirm by eye before believing a number.

**Still unrun on any build: all of D–I.** Section C is complete as of 2026-08-11.

**Current build: `app-release-v2-20260811-1000-44b3c47-dirty.apk`** — the tree
that became `a53487e`, so the `-dirty` suffix is the commit lagging the build,
not untracked work. Supersedes everything below.

**Previous build: `app-release-v2-20260807-1336-aafbe97.apk`.** Seven fixes went
in during the 08-07 pass — sign-up by code, the ovals, control labels, the back
button, sign-out clearing the map, concessions as suggestions, and the
non-sequitur edge. Anything ticked against an earlier build was ticked against
a different app.

Accounts left behind on the way: `alex.krewson+test2@gmail.com` and
`+test3@gmail.com` are real but **unconfirmed** — `+test3` was created against
the old build and can't reach a code screen. Worth deleting before the tester
round, by id.

---

## A. Install and first launch

- [ ] A1. Sideloads onto a phone that has never had it — no signature conflict.
- [ ] A2. Cold start from the launcher: no white screen, no flash of unstyled
      content, map renders within a few seconds. (The emulator measured 5–7s to
      mount. Slower than that on real hardware is the interesting result.)
- [ ] A3. Icon and app name are right in the launcher and in the recents switcher.
- [ ] A4. Force-stop and relaunch. Then reboot the phone and launch.
- [ ] A5. Rotate to landscape on the empty map and back — nothing clipped, nothing
      lost.

## B. Auth — the least-covered area, do it first

- [ ] B1. Sign up with a fresh real email address. The app goes straight to a
      "Confirm your email" code screen — it should never tell you to go and click
      a link.
- [ ] B2. **The confirmation email contains a code and no link.** Type the code
      into the app; you end up signed in, in the app, without ever having left it.
      *Changed 2026-08-07.* It used to send a confirmation link, which opened the
      **web** app — pixel-identical to this one, so you leave the Android app
      without noticing and end up with a session in the browser and none in the
      app you thought you were using. If any link is still in that email, the
      Supabase template didn't take.
- [ ] B2a. Tap "Resend code" on that screen — a second code arrives and works.
- [ ] B3. Check the confirmation email's sender and where it lands — Resend-signed
      from `send.trolleysolution.com`, in the inbox, not Promotions or Junk.
- [ ] B4. Sign in with the wrong password — clear rejection, fast, no hang.
- [ ] B5. Forgot password → code by email → type it in the app → set a new
      password → signed in. Entirely in-app, no link.
      **Count the digits and check they match the dashboard.** The screen accepts
      6–8 rather than pinning a literal, precisely so Email OTP Length can be
      changed without stranding anyone on a Verify button that never enables. It
      sent 8 on 2026-08-07 and was moved to 6 on 08-08. Anything outside 6–8 and
      that setting is the thing to look at.
- [ ] B6. Sign in with the new password after a force-stop.
- [ ] B7. Change password from settings → ACCOUNT: wrong current password must be
      refused, then the right one works.
- [ ] B8. Sign out, then kill the app and relaunch — still signed out.
- [ ] B9. Session survives a phone reboot while signed in.

## C. Core argument flow

- [ ] C1. Set your speaker name, shuffle it, confirm the input placeholder follows.
- [ ] C2. Add a node manually — no AI call, no credit spent, attributed to the
      active speaker.
- [ ] C3. Submit a statement in Turns mode — node appears, correctly typed, with a
      tactic badge.
- [ ] C4. Submit a rebuttal — it attaches to the existing argument rather than
      floating.
- [ ] C5. Skip Turn hands over; the next node is attributed to the other speaker.
- [ ] C6. Combined mode with a 4–6 line A/B conversation. **Watch the wall-clock.**
      The same input took between 1.7 and 4.0 minutes on desktop, and per-call AI
      latency is the variance, not conversation length. On a phone over mobile
      data this is the case most likely to *feel* broken — does the UI show it is
      still working, or does it look hung?
- [ ] C7. Moderator tab reports on both speakers.
- [ ] C8. Concede an opponent's point — wording differs from conceding your own,
      and it locks.
- [ ] C9. Retract your own node — fades, marked down.
- [ ] C10. Undo an add, then redo it.
- [ ] C11. Node detail popup shows the original statement and the summary.
- [ ] C12. Edit a statement — the new text persists.
- [ ] C13. Change a node's type — it persists.
- [ ] C14. You cannot edit or delete the other speaker's node.
- [ ] C15. Delete a node: cancel is non-destructive, confirm removes it.

## D. Touch — what no emulator run has covered

- [ ] D1. **Pinch-zoom and pan** with a real two-finger gesture. Smooth, and still
      usable at both extremes of zoom.
- [ ] D2. Tap a node accurately on a phone-sized screen. Are the hit targets big
      enough, or do you keep missing?
- [ ] D3. Drag a node / re-parent by touch, then leave the tab and come back —
      the oval-node repro. Nodes must still be rounded rectangles in the speaker
      colour, not grey ellipses.
- [ ] D4. With a long argument, does the map settle somewhere readable, or do
      nodes end up off-screen with no way back?
- [ ] D5. Open the keyboard in the statement input. Does it cover the input or the
      submit button? Does the layout recover when it closes?
- [ ] D6. **Android back button** closes the topmost layer, in this order:
      concession confirm → node popup → add-node → changelog → buy-credits →
      auth → settings → and from any other tab, back to the Map tab.
      On the Map with nothing open it takes **two presses within 2 seconds**,
      with a "Press back again to exit" toast between them. One press, then a
      pause, then another must NOT exit.
      *Until 2026-08-07 a single press exited the app from anywhere, including
      from inside a modal.*

## E. Settings, themes, clipboard

- [ ] E1. Settings dropdown opens and closes, and fits the screen both with the
      keyboard down and in landscape. (This overflowed short viewports once — 59px
      unreachable at 600px, 159px at 500px.)
- [ ] E2. ACCOUNT shows the signed-in email and a credit balance.
- [ ] E3. **Top up / Buy Credits is absent.** The balance still shows; there is no
      purchase path and no link out to a website. This is the Play payments
      compliance surface — look at it the way a reviewer would.
- [ ] E4. Run the balance to zero if you can: a plain "You're out of AI credits.",
      no modal, and no suggestion to buy elsewhere.
- [ ] E5. HELP → Contact Developer copies `support@trolleysolution.com`. **Paste it
      somewhere to confirm** — the WebView clipboard has failed before while the
      UI still claimed success.
- [ ] E6. ADVANCED → Copy map JSON, then paste into a notes app and check it is
      real JSON.
- [ ] E7. Game mode and sounds toggle, make a sound, and persist across a restart.
- [ ] E8. Cycle **every theme** and judge readability on the phone's actual screen,
      in daylight if you can. Moderator nodes on dark were unreadable once.
- [ ] E9. The chosen theme survives a restart.

## F. Persistence and network

- [ ] F1. Save a productive disagreement, clear the canvas, load it back from
      History, confirm it returns complete. Delete it afterwards **by title, not
      by position**.
- [ ] F2. History while signed in with nothing saved — the empty state must not
      tell you to sign in.
- [ ] F3. Airplane mode, then submit a statement. A real error, not a silent hang
      or a spinner forever. Turn it back on and retry — does it recover?
- [ ] F4. Switch Wi-Fi → mobile data mid-AI-call.
- [ ] F5. Background the app during an AI call (home, wait 30s, return). Does the
      result land, or is it lost?
- [ ] F6. Leave it backgrounded 10+ minutes and return. Android may have killed
      the WebView — does it restore, or come back blank?

## G. Compliance surfaces a reviewer will open

- [ ] G1. Privacy policy opens from within the app and reads well on mobile.
- [ ] G2. `https://idisagree.trolleysolution.com/privacy#delete` scrolls to the
      deletion section in a phone browser.
- [ ] G3. Delete-my-data: the first confirmation cancels safely, and deletion
      needs a **second, separate** confirmation.
- [ ] G4. Only complete a deletion on a throwaway account — then prove it worked
      by trying to sign in.
- [ ] G5. The delete dialog says nothing else is affected. That has been true
      since the Supabase split.

## I. Concessions — suggestions, never verdicts

Changed wholesale on 2026-08-07. Nothing may be conceded without the user
saying so; the rest is a badge and an explanation.

- [ ] I1. **Turns mode**, where a statement implies you accept the other
      speaker's point ("fair enough", "granted, but…"): a confirmation appears.
      **Confirm** it — the node is rated and the badge does not appear.
- [ ] I2. Do it again and **decline**. The node must get a teal `🤝? possible
      concession` badge, and **nothing else may change** — no rating, no fade,
      no score movement. Declining used to leave no trace at all.
- [ ] I3. Open that node. The info box explains who may have conceded what, says
      nobody has confirmed it, and **quotes the phrase** it was inferred from.
      The quote is the point: it's what lets you judge the suggestion.
- [ ] I4. **Combined mode** with a conversation containing a concession
      ("You're right, I'll grant that…"). **No confirmation popups at all** —
      the map builds, and the conceded node carries the badge.
- [ ] I5. A **concessive rebuttal** — someone granting a point and arguing on
      anyway. The node they conceded gets the badge, and the rebutting node
      reads "Despite a possible concession of N". Neither may say "conceded"
      flatly. *This route had no rating to intercept and so was still asserting
      a concession until 2026-08-07.*
- [ ] I6. A node flagged **non-sequitur** must not also claim to support its
      parent. Its edge is `unrelated`; the flag and the edge can't contradict.
      And check the flag is deserved — if you can say what the statement was
      responding to, it isn't a non-sequitur. *A prompt change, so this one is
      a judgement call every run.*

## H. Crash reporting

- [ ] H1. Check the Sentry `idisagree` project during the pass. Anything you
      triggered should appear with `environment: android`.
      Nothing arriving all session is **not** proof it works — it is proof
      nothing crashed. For a positive signal, find a reproducible error and watch
      it land.
