# Argument Mapper — Quick Start Guide

## What is it?

A browser-based debate tool for two users. You take turns submitting arguments, and an AI (Claude) analyzes each statement, builds a live visual map of the debate, detects rhetorical tactics, and moderates the exchange.

No backend. No accounts. Everything is session-only — refresh and it's gone.

---

## Setup

1. Add your Anthropic API key to a `.env` file at the project root:
   ```
   VITE_ANTHROPIC_API_KEY=sk-ant-...
   ```
2. Run the app (`npm run dev` or open the built `dist/`).

---

## The Debate Flow

The app alternates turns between **User A** (blue) and **User B** (green).

1. **User A types a statement** in the text box at the bottom and hits Submit (or `Enter`).
2. Claude analyzes the statement, assigns it a node type, detects any tactics, and adds it to the argument map.
3. The turn passes to **User B**, who does the same.
4. Repeat — the map grows as the debate continues.

---

## Features

### Argument Map (Graph)
The main area shows a live visual graph of the debate. Each node is a claim, premise, evidence, objection, or rebuttal. Edges show how arguments relate (supports, opposes, rebuts, etc.). Click any node to open its detail popup.

**Node types:**
| Type | Meaning |
|------|---------|
| `claim` | The main position being argued |
| `premise` | A reason supporting a claim |
| `evidence` | A fact or citation backing a premise |
| `objection` | A counterargument |
| `rebuttal` | A response to an objection |

### Sidebar — Claims List
The right sidebar lists all nodes. You can:
- **Click any node** to open its details.
- **Rate the other user's nodes** with thumbs up 👍 or down 👎.
  - Thumbs up = "I agree this is a fair representation of their point."
  - Agreed nodes (and all their supporting predecessors) **fade out** on both the graph and sidebar — they're settled, move on.

### Node Detail Popup
Click any node (graph or sidebar) to open a popup showing:
- The **original statement** as typed by the user
- The **AI summary** (the cleaned-up claim Claude extracted)
- Any **tactics detected** with an explanation of why
- Tags and confidence level

Close with `×`, clicking the backdrop, or `Escape`.

### Tactic Detection
Claude automatically detects rhetorical tactics on every node. Badges appear in the sidebar and popup.

**Fallacies** (red badges):
- Straw Man, Ad Hominem, No True Scotsman, False Dilemma, Slippery Slope, Appeal to Authority, Red Herring, Circular Reasoning, Appeal to Emotion, Hasty Generalization

**Good techniques** (green badges):
- Steel Man, Evidence Based, Logical Deduction, Addresses Counterargument, Cites Source

### Moderator Gauge
A floating widget in the graph area shows which side the AI thinks currently has the stronger argument. The marker slides between **User A** and **User B**.

- **Drag** the gauge anywhere on screen using the grip icon (☰).
- **Click** the gauge to open the full Moderator Analysis popup, which includes:
  - The leaning score with a reason
  - A style assessment for each user
  - A list of mutually agreed-upon points

Agreements shift the gauge: each thumbs-up on User A's node nudges it toward A, and vice versa.

### AI Moderator Mode
Click **"Talk to AI"** (bottom right of the input) to switch from debate mode to a direct chat with Claude.

- Ask Claude to explain the map, identify weak points, steelman a position, or anything else.
- Claude can update the argument map directly from the chat (you'll see a "Map updated" indicator on the reply).
- Click **"Back to Debate"** to return to turn-based mode.

### Resizable Sidebar
Drag the divider between the graph and the sidebar to resize them.

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
- **Use the thumbs-up** liberally for points of genuine agreement. Fading out settled nodes keeps the map focused on what's still contested.
- **Switch to AI Moderator mode** mid-debate if you want a neutral read on who's winning or why an argument is weak.
- **Click nodes in the graph** — the popup shows the original wording vs. the AI's interpretation, which is useful if you want to dispute a summary.
