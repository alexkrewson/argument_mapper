# Argument Mapper — Feature Guide

## What is it?

A browser-based debate tool for two users. You take turns submitting arguments, and an AI (Claude) analyzes each statement, builds a live visual map of the debate, detects rhetorical tactics, moderates the exchange, and tracks concessions.

Debates are saved to Supabase when you're signed in — sign in via the ⚙ settings menu.

---

## The Debate Flow

The app alternates turns between two speakers — each shown in their own color.

1. Before your first submission, you can **edit your name** in the input bar or hit the shuffle icon for a random one. The name locks in after you submit.
2. Type a statement and hit **Submit** (or `Enter`).
3. Claude analyzes the statement, assigns it a node type, detects tactics and flags, and adds it to the argument map.
4. The turn passes to the other speaker. Repeat.

---

## Tabs

### Map
The main area shows a live visual graph of the debate. Each node is a statement; edges show how arguments relate. Click any node to open its detail popup. Click the graph background to hide/show the header and footer for a cleaner view.

**Node colors** match the speaker who made the argument.

**Node visual states:**
- **Faded (opacity-reduced):** Agreed-upon or retracted — settled, move on.
- **Red background + border:** Involved in a self-contradiction.
- **Orange background + border:** Involved in goalpost-moving.
- **Pulsing glow (briefly):** Newly added this turn.

### List
A tree view of all nodes, indented by parent-child relationship. Includes tactic badges, fading, and concede buttons. Good for mobile or dense debates.

### Moderator
Two panels — one per speaker — showing:
- **Style analysis:** Claude's assessment of each speaker's rhetorical style.
- **Events list:** A running record of notable moves — tactics used, concessions made, contradictions, retractions, and points the opponent agreed with.

Below the panels is an **AI chat** where you can ask Claude anything about the debate (see [AI Moderator Chat](#ai-moderator-chat)).

### History *(signed-in users only)*
A list of all your saved debates, sorted by last modified. Click a title to load it (replaces the current debate). Delete with ✕.

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

- **Original Statement** — what the user actually typed
- **AI Summary** — the cleaned-up claim Claude extracted
- **Tactics Detected** — badges with per-tactic explanations
- **Concede button** — see [Concessions](#concessions)
- **Contradiction / goalpost chips** — clickable, navigate to the related node
- **Agreement / retraction / inactive banner** — explains why a node is faded
- **Tags** — topic tags Claude assigned

The **pencil icon** (✏) opens edit mode, where you can change the content, type, parent node, tags, and flags.

Close with `×`, clicking the backdrop, or `Escape`.

---

## Concessions

There are two ways to concede a point:

**Manual:** In the node detail popup, click the concede button:
- On the *other speaker's* node: "[You] concede that [their] point is correct" — you're agreeing their point stands.
- On *your own* node: "[You] concede that this statement of theirs is incorrect" — you're retracting your own argument.

**AI-detected:** When Claude notices that a submitted statement implicitly concedes a point, a confirmation modal appears. Confirm to apply the concession, or dismiss to ignore it.

When a node is conceded or retracted, it and all its supporting predecessors **fade out** across the map and list — they're settled, no longer contested.

---

## Tactic Detection

Claude automatically detects rhetorical tactics on every node. Badges appear in the list view and in the node detail popup.

**Fallacies** (red badges):
- Straw Man, Ad Hominem, No True Scotsman, False Dilemma, Slippery Slope, Appeal to Authority, Red Herring, Circular Reasoning, Appeal to Emotion, Hasty Generalization

**Good techniques** (green badges):
- Steel Man, Evidence Based, Logical Deduction, Addresses Counterargument, Cites Source

---

## Contradiction & Goalpost Detection

Claude also flags two specific bad-faith patterns:

- **⚠ Contradiction:** A speaker's new node directly contradicts one of their own earlier nodes. Both nodes get a red border and a red background. Clicking the chip in the popup navigates to the related node.
- **⤳ Goalpost Moving:** A speaker shifts the standard they're arguing against mid-debate. Both nodes get an orange border. Also navigable via the popup chip.

---

## AI Moderator Chat

Switch to the **Moderator** tab and use the chat at the bottom to talk to Claude directly.

- Ask Claude to explain the map, identify weak points, steelman a position, summarize the debate, or anything else.
- Claude can **update the argument map** directly from the chat — a "Map updated" indicator appears on the reply when it does.

---

## Undo / Redo

Every submission, rating, and manual edit is tracked in a history stack. Use the **←** and **→** buttons in the input bar to move through the history.

---

## Manual Node Management

- **+ Node** button (input bar) — opens a create modal to add a node manually, attributed to the current speaker. Set content, type, parent, and any flags.
- **Edit mode** (✏ in the node popup) — update any field on an existing node, including re-parenting it.

---

## AI Change Log

The **Review Changes** button (input bar, shows a count badge) opens a modal listing every change Claude has made to the map across all turns — nodes added, modified, removed, edges added, and concessions detected. Useful for auditing what the AI did.

---

## Accounts & Auto-Save

- Sign in or sign up via the **⚙ settings** menu (top right).
- When signed in, debates **auto-save** to Supabase 1.5 seconds after any change. A "Saving…" / "Saved ✓" indicator appears in the header.
- The debate title is auto-generated from the first claim node (or a date fallback).
- If you're not signed in and have started a debate, a **sign-in nudge** appears at the bottom. Closing the tab will trigger a browser warning about unsaved work.
- Load or delete saved debates from the **History** tab.

---

## Themes

Open the **⚙ settings** menu to choose a theme. Light and dark variants are available.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit statement |
| `Shift+Enter` | New line in the text box |
| `Escape` | Close any open popup |

---

## Tips

- **Be specific** — vague statements produce vague nodes. Claude works best with clear, focused claims.
- **Concede freely** — fading settled nodes keeps the map focused on what's still genuinely contested.
- **Use the Moderator tab mid-debate** for a neutral read on who's winning or where an argument is weak.
- **Click nodes in the graph** — the popup shows the original wording vs. the AI's interpretation, useful if you want to dispute a summary or edit it.
- **Undo aggressively** — if Claude misreads a statement and creates a bad node, undo and rephrase rather than trying to work around it.
