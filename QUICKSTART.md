# iDisagree — Feature Guide

> Building or running the Android app? See `ANDROID_SETUP_HANDOFF.md` (Linux)
> or `ANDROID_SETUP_WINDOWS.md` (Windows). This file covers app features only.

## What is it?

A browser-based tool for productive disagreement between two people. You take turns submitting arguments, and an AI (Claude) analyzes each statement, builds a live visual map of the disagreement, detects rhetorical tactics, moderates the exchange, tracks concessions, and — if you enable Game Mode — scores both participants in real time.

**You need an account.** Sign in via the ⚙ settings menu before submitting —
statements are analyzed by Claude and credits are metered per account, so a
signed-out submission is rejected and the statement is discarded. New accounts
start with a free credit allowance. Productive disagreements then save automatically.

---

## The Disagreement Flow

The app alternates turns between two speakers — each shown in their own color.

1. Before your first submission, **edit your name** in the input bar or hit the shuffle icon for a random one. The name locks in after you submit.
2. Type a statement and hit **Submit** (or `Enter`).
3. Claude analyzes the statement, assigns it a node type, detects tactics and flags, and adds it to the argument map.
4. The turn passes to the other speaker. Repeat.

---

## Combined Input Mode

Instead of submitting one turn at a time, you can paste an entire back-and-forth conversation at once.

1. Click **Combined** in the input bar (next to Skip Turn).
2. Paste the full conversation — speaker labels, timestamps, and all.
3. Hit **Process**. Claude Haiku parses the conversation into individual turns, then Claude Sonnet analyzes each turn sequentially, building the map progressively.
4. Progress is shown as "Processing turn N of M…"

The first distinct speaker maps to the Blue player, the second to Green. Speaker labels and metadata are stripped before analysis — only the statement content is sent to the map engine.

Switch back to **Turns** mode at any time to resume one-at-a-time submissions.

---

## Tabs

### Map
The main area shows a live visual graph of the disagreement. Each node is a statement; edges show how arguments relate. Click any node to open its detail popup. Click the graph background to hide/show the header and footer for a cleaner view.

**Node colors** match the speaker who made the argument.

**Node visual states:**
- **Faded (opacity-reduced):** Agreed-upon or retracted — settled, move on.
- **Red background + border:** Involved in a self-contradiction.
- **Orange background + border:** Involved in goalpost-moving.
- **Bright red border, no tree connection:** Non-sequitur — a statement with no logical link to the disagreement.
- **Pulsing glow (briefly):** Newly added this turn.

### Moderator
Two panels — one per speaker — showing:
- **Score** (Game Mode only): current point total in large text, with a 👑 crown on the leader.
- **Style analysis:** Claude's assessment of each speaker's rhetorical style.
- **Events list:** A running record of notable moves — tactics used, concessions made, contradictions, retractions, points the opponent agreed with. In Game Mode, each event shows its point value.

Below the panels is an **AI chat** where you can ask Claude anything about the disagreement (see [AI Moderator Chat](#ai-moderator-chat)).

### History *(signed-in users only)*
A list of all your saved productive disagreements, sorted by last modified. Click a title to load it. Delete with ✕. Use the **New Argument** button to clear the map and start fresh.

---

## Node Types

| Type | Meaning |
|------|---------|
| `claim` | The main position being argued |
| `premise` | A reason supporting a claim |
| `evidence` | A fact or citation backing a premise |
| `objection` | A counterargument |
| `rebuttal` | A response to an objection |
| `clarification` | A clarifying statement |

---

## Node Detail Popup

Click any node (in the graph or list) to open a popup showing:

- **Original Statement** — what the user actually typed (or the parsed turn text in Combined mode)
- **AI Summary** — the cleaned-up claim Claude extracted
- **Tactics Detected** — badges with per-tactic explanations
- **Points** (Game Mode only) — breakdown of every point event for this node, with totals per speaker
- **Concede button** — see [Concessions](#concessions)
- **Contradiction / goalpost chips** — clickable, navigate to the related node
- **Agreement / retraction / inactive banner** — explains why a node is faded

The **pencil icon** (✏) opens edit mode: change content, type, parent node, tags, and flags.

Close with `×`, clicking the backdrop, or `Escape`.

---

## Adding Nodes Manually

Not every argument needs to go through Claude. Use the **+ Node** button in the input bar to add a node directly — no AI analysis, no turn cost. You set the content, type, and parent yourself. The node is attributed to the current speaker. Useful for adding evidence, clarifications, or points you want to place precisely in the tree.

Existing nodes can also be edited at any time via the ✏ icon in the popup — change content, retype, re-parent, or manually set contradiction and goalpost flags.

---

## Concessions

There are two ways to concede a point:

**Manual:** In the node detail popup, click the concede button:
- On the *other speaker's* node: "[You] concede that [their] point is correct" — you're agreeing their point stands.
- On *your own* node: "[You] concede that this statement of theirs is incorrect" — you're retracting your own argument.

**AI-detected:** When Claude notices that a submitted statement implicitly concedes a point, a confirmation modal appears. Confirm to apply the concession, or dismiss to ignore it.

When a node is conceded or retracted, it and all its supporting predecessors **fade out** across the map and list. Conceding a node also automatically clears any contradiction or goalpost-moving flags it was the source of, since those arguments are no longer in play.

---

## Tactic Detection

Claude automatically detects rhetorical tactics on every node. Tactics are **re-evaluated on every turn** — new context can reveal fallacies in earlier statements.

**Fallacies** (red badges — lose points in Game Mode):

| Tactic | Points |
|--------|--------|
| Ad Hominem | −15 |
| Straw Man | −12 |
| No True Scotsman | −10 |
| False Dilemma | −8 |
| Circular Reasoning | −8 |
| Appeal to Emotion | −8 |
| Red Herring | −8 |
| Slippery Slope | −6 |
| Appeal to Authority | −6 |
| Hasty Generalization | −6 |

**Good techniques** (green badges — earn points in Game Mode):

| Tactic | Points |
|--------|--------|
| Steel Man | +10 |
| Evidence Based | +6 |
| Logical Deduction | +5 |
| Addresses Counterargument | +5 |
| Cites Source | +4 |
| Analogy | +2 |

---

## Contradiction, Goalpost & Non-sequitur Detection

Claude flags three specific patterns automatically:

- **⚠ Contradiction:** A speaker's new node directly contradicts one of *their own* earlier nodes. Both nodes get a red border and background. Supporting nodes by the same speaker are also flagged as undermined. *−12 pts in Game Mode.*
- **⤳ Goalpost Moving:** A speaker quietly shifts the scope of *their own* earlier claim to dodge a challenge. Both nodes get an orange border. *−10 pts in Game Mode.*
- **⚡ Non-sequitur:** A statement with no logical connection to any existing node. It appears *beside* the tree with a bright red border. *−5 pts in Game Mode.*

These flags **only apply within a single speaker's own nodes** — normal argumentation against the other person is never flagged.

Downstream nodes belonging to the same speaker as the flagged node are also highlighted as potentially undermined.

---

## Game Mode

Enable **🎮 Points & sounds** in the ⚙ settings menu to turn on Game Mode. The setting persists across sessions.

### What it does

- **Scores** are displayed in the Moderator tab under each speaker's name. The leading player gets a 👑 crown.
- **Each event shows its point value** in the Moderator tab event list.
- **Node info popups** show a per-node point breakdown with totals per speaker.
- **After each submission**, an animated score change floats up (green, bouncy) or shakes down (red), colored by the submitting speaker's color.
- **Sounds** play on each turn — an ascending arpeggio for gains, a descending minor chord for losses, and a full 5-note fanfare for big wins (≥ +18 pts).

### Point table

Scores are **cumulative** — every node on the map contributes to the running total.

**Concessions (highest rewards — these are the hardest to do):**

| Action | Points |
|--------|--------|
| Retract your own argument | +20 |
| Concede the opponent's point | +20 |
| Opponent concedes your point | +8 |

**Good techniques:**

| Tactic | Points |
|--------|--------|
| Steel Man | +10 |
| Evidence Based | +6 |
| Logical Deduction | +5 |
| Addresses Counterargument | +5 |
| Cites Source | +4 |
| Analogy | +2 |

**Fallacies:**

| Tactic | Points |
|--------|--------|
| Ad Hominem | −15 |
| Straw Man | −12 |
| Contradiction (self) | −12 |
| No True Scotsman | −10 |
| Goalpost Moving | −10 |
| False Dilemma | −8 |
| Circular Reasoning | −8 |
| Appeal to Emotion | −8 |
| Red Herring | −8 |
| Slippery Slope | −6 |
| Appeal to Authority | −6 |
| Hasty Generalization | −6 |
| Non-sequitur | −5 |

---

## AI Moderator Chat

Switch to the **Moderator** tab and use the chat at the bottom to talk to Claude directly.

- Ask Claude to explain the map, identify weak points, steelman a position, summarize the disagreement, or anything else.
- Claude can **update the argument map** directly from the chat — a "Map updated" indicator appears on the reply when it does.

---

## Undo / Redo

Every submission, rating, and manual edit is tracked in a history stack. Use the **←** and **→** buttons in the input bar to move through the history.

---

## AI Change Log

The **Review Changes** button (input bar, shows a count badge) opens a modal listing every change Claude has made across all turns — nodes added, modified, removed, edges added, and concessions detected.

---

## Accounts & Auto-Save

- Sign in or sign up via the **⚙ settings** menu (top right). This is required —
  submitting while signed out opens the sign-in modal and discards the statement.
- Credits are metered per account. New accounts start with a free allowance;
  the balance is under ⚙ → ACCOUNT, and **Buy Credits** tops it up.
- Productive disagreements **auto-save** 1.5 seconds after any change. A "Saving…" / "Saved ✓"
  indicator appears in the header.
- Load, delete, or start a new argument from the **History** tab, which is
  hidden while signed out.
- **Add Node** is the exception: it places a node directly with no AI call, so
  it works without credits.

---

## Settings

Open the **⚙ settings** menu (top right) to:

- **Toggle Game Mode** — enables points, sounds, and score animations.
- **Switch themes** — light and dark variants available.
- **Sign in / Sign out.**

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit statement |
| `Shift+Enter` | New line in the text box |
| `Escape` | Close any open popup |

*(The List tab was removed; `src/components/MapTreeView.jsx` is now unreferenced.)*

---

## Tips

- **Be specific** — vague statements produce vague nodes. Claude works best with clear, focused claims.
- **Concede freely** — fading settled nodes keeps the map focused on what's still genuinely contested. In Game Mode, conceding also earns the most points.
- **Use Combined mode** to import a conversation that already happened — paste a chat export and get the full map instantly.
- **Use the Moderator tab mid-disagreement** for a neutral read on who's winning or where an argument is weak.
- **Click nodes in the graph** — the popup shows the original wording vs. the AI's interpretation, useful if you want to dispute a summary or edit it.
- **Undo aggressively** — if Claude misreads a statement and creates a bad node, undo and rephrase rather than trying to work around it.
