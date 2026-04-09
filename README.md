# Argument Mapper

A browser-based debate tool for two participants. Statements are analyzed by Claude (Anthropic), structured into a live argument graph, and tracked for rhetorical tactics, concessions, contradictions, and logical consistency. An optional Game Mode scores both participants in real time.

**[Live app →](https://alexkrewson.github.io/argument_mapper/)**  
**[Full feature guide →](QUICKSTART.md)**

---

## Features

- **Live argument graph** — every statement becomes a typed node (claim, premise, objection, rebuttal, evidence, clarification) connected to the tree it belongs to
- **Turn-by-turn or Combined mode** — submit one statement at a time, or paste a full back-and-forth conversation and have it processed all at once
- **Tactic detection** — 10 fallacies and 6 good techniques detected automatically on every node, re-evaluated each turn as context grows
- **Contradiction & goalpost detection** — flags when a speaker contradicts their own earlier position or quietly shifts their claim
- **Non-sequitur detection** — disconnected statements are placed beside the tree with a red border
- **Concessions** — manual or AI-detected; conceded nodes and their entire supporting subtree fade out and conflict flags are cleared
- **Game Mode** — points for concessions, good techniques, and penalties for fallacies; animated score toasts, sounds, and a live leaderboard in the Moderator tab
- **AI Moderator** — per-speaker style analysis, event log, and a chat interface that can read and edit the map
- **Undo/redo** — full history stack for every change
- **Accounts & auto-save** — Supabase auth + auto-save to cloud; load or delete past debates from the Arguments tab

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, vanilla CSS |
| Graph rendering | Cytoscape.js + cytoscape-dagre + cytoscape-node-html-label |
| AI | Claude Sonnet (map analysis) + Claude Haiku (conversation parsing) |
| Backend / Auth | Supabase (PostgreSQL, Auth, Edge Functions on Deno) |
| Hosting | GitHub Pages, deployed via GitHub Actions |

The browser never calls the Anthropic API directly. All AI requests are proxied through a Supabase Edge Function (`claude-proxy`) that holds the API key server-side.

---

## Project Structure

```
src/
  App.jsx                  Main component — all state, handlers, tab layout
  App.css                  All styles (no component library)
  components/
    ArgumentMap.jsx         Cytoscape graph, layout, badge overlays
    NodeDetailPopup.jsx     Node info / edit / create modal
    StatementInput.jsx      Input bar — turns/combined mode, name editing
    ModeratorGauge.jsx      Floating draggable leaning gauge
    ModeratorGaugePopup.jsx Full moderator analysis popup
    MapTreeView.jsx         List-tab tree view
    NodeList.jsx            Node list item
    SettingsPanel.jsx       Settings dropdown (theme, game mode, auth)
    DebateHistory.jsx       Arguments tab — saved debate list
    AboutTab.jsx            About tab — feature guide with scrollable nav
    ConcessionConfirmModal.jsx  Concession confirmation dialog
    AIChangeLogModal.jsx    Change log modal
    AuthModal.jsx           Sign in / sign up modal
    AuthButton.jsx          Auth trigger button
    SaveDebateModal.jsx     Manual save modal
  utils/
    claude.js               All Claude API calls (updateArgumentMap, parseConversation, chatWithModerator)
    scoring.js              Game Mode point values and score computation
    sounds.js               Web Audio API synth sounds for Game Mode
    tactics.js              Tactic definitions (symbol, name, type)
    themes.js               Theme definitions (colors, dark/light)
    speakers.js             Speaker color/name helpers
    format.js               Node ID formatting
    names.js                Random name generator
    supabase.js             Supabase client
  hooks/
    useAuth.js              Supabase auth state hook
```

---

## Game Mode — Point System

Scores are cumulative over the full map. The biggest rewards go to the hardest acts of intellectual honesty.

### Concessions
| Action | Points |
|--------|--------|
| Retract your own argument | +20 |
| Concede the opponent's point | +20 |
| Opponent concedes your point | +8 |

### Good techniques
| Tactic | Points |
|--------|--------|
| Steel Man | +10 |
| Evidence Based | +6 |
| Logical Deduction | +5 |
| Addresses Counterargument | +5 |
| Cites Source | +4 |
| Analogy | +2 |

### Fallacies & flags
| Event | Points |
|-------|--------|
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

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
```

Requires environment variables (`.env.local`):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_PROXY_SECRET=...
```

The Supabase Edge Function (`supabase/functions/claude-proxy/`) must be deployed separately and holds `ANTHROPIC_API_KEY`.

---

## Deployment

Push to `master` — GitHub Actions builds with Vite and deploys to GitHub Pages automatically.
