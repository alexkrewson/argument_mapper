import { useEffect, useRef, useState } from "react";

const NAV = [
  { id: "debate-flow",         label: "Debate Flow" },
  { id: "tabs",                label: "Tabs" },
  { id: "node-types",          label: "Node Types" },
  { id: "node-detail-popup",   label: "Node Detail Popup" },
  { id: "adding-nodes",        label: "Adding Nodes Manually" },
  { id: "concessions",         label: "Concessions" },
  { id: "tactic-detection",    label: "Tactic Detection" },
  { id: "flags",               label: "Contradiction & Goalpost" },
  { id: "moderator-tab",       label: "Moderator Tab" },
  { id: "accounts",            label: "Accounts & Auto-Save" },
  { id: "other-controls",      label: "Other Controls" },
  { id: "keyboard-shortcuts",  label: "Keyboard Shortcuts" },
  { id: "tips",                label: "Tips" },
  {
    id: "technical",
    label: "Technical Overview",
    sub: [
      { id: "tech-stack",    label: "Tech Stack" },
      { id: "tech-ai",       label: "AI Integration" },
      { id: "tech-turn",     label: "How a Turn Works" },
      { id: "tech-data",     label: "Data & Persistence" },
      { id: "tech-hosting",  label: "Hosting & Deployment" },
    ],
  },
  {
    id: "philosophy",
    label: "Philosophy",
    sub: [
      { id: "phil-problem",    label: "The Problem" },
      { id: "phil-approach",   label: "The Approach" },
      { id: "phil-ai-role",    label: "The Role of AI" },
      { id: "phil-principles", label: "Design Principles" },
    ],
  },
];

const ALL_IDS = NAV.flatMap(s => [s.id, ...(s.sub?.map(ss => ss.id) ?? [])]);

export default function AboutTab({ isActive }) {
  const divRef     = useRef(null);
  const savedScroll = useRef(0);
  const [activeId,  setActiveId]  = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded,  setExpanded]  = useState({});  // section id → bool

  // Restore scroll when becoming active
  useEffect(() => {
    if (isActive && divRef.current) {
      divRef.current.scrollTop = savedScroll.current;
    }
  }, [isActive]);

  // Track active section via IntersectionObserver on the scroll container
  useEffect(() => {
    if (!isActive || !divRef.current) return;
    const container = divRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { root: container, rootMargin: "-10% 0px -80% 0px", threshold: 0 }
    );
    container.querySelectorAll("h3[id], h4[id]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [isActive]);

  // Auto-expand nav parent when a sub-item becomes active
  useEffect(() => {
    const parent = NAV.find(s => s.sub?.some(ss => ss.id === activeId));
    if (parent) setExpanded(prev => ({ ...prev, [parent.id]: true }));
  }, [activeId]);

  const scrollTo = (id) => {
    const el = divRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleSection = (id, e) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="about-tab">

      {/* Left nav */}
      <nav className={`about-nav${collapsed ? " about-nav--collapsed" : ""}`}>
        <button
          className="about-nav-toggle"
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >{collapsed ? "▶" : "◀"}</button>

        {!collapsed && (
          <ul className="about-nav-list">
            {NAV.map(section => {
              const isParentActive = section.sub
                ? (activeId === section.id || section.sub.some(s => s.id === activeId))
                : activeId === section.id;
              const isOpen = expanded[section.id];

              return (
                <li key={section.id} className="about-nav-item">
                  <div
                    className={`about-nav-link${isParentActive ? " about-nav-link--active" : ""}${section.sub ? " about-nav-link--parent" : ""}`}
                    onClick={() => { scrollTo(section.id); if (!section.sub) return; }}
                  >
                    <span className="about-nav-label" onClick={() => scrollTo(section.id)}>
                      {section.label}
                    </span>
                    {section.sub && (
                      <button
                        className="about-nav-expand"
                        onClick={(e) => toggleSection(section.id, e)}
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >{isOpen ? "▾" : "▸"}</button>
                    )}
                  </div>
                  {section.sub && isOpen && (
                    <ul className="about-nav-sub">
                      {section.sub.map(ss => (
                        <li key={ss.id}>
                          <span
                            className={`about-nav-sublink${activeId === ss.id ? " about-nav-sublink--active" : ""}`}
                            onClick={() => scrollTo(ss.id)}
                          >{ss.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Main content */}
      <div className="about-scroll" ref={divRef}
        onScroll={() => { savedScroll.current = divRef.current.scrollTop; }}>
      <div className="about-content">
        <h2>Argument Mapper</h2>
        <p className="about-lead">
          A browser-based debate tool for two users. You take turns submitting arguments, and an AI (Claude)
          analyzes each statement, builds a live visual map of the debate, detects rhetorical tactics,
          moderates the exchange, and tracks concessions.
        </p>

        <h3 id="debate-flow">The Debate Flow</h3>
        <p>The app alternates turns between two speakers — each shown in their own color.</p>
        <ol>
          <li>Before your first submission, <strong>edit your name</strong> in the input bar or hit the shuffle icon for a random one. The name locks in after you submit.</li>
          <li>Type a statement and hit <strong>Submit</strong> (or <kbd>Enter</kbd>).</li>
          <li>Claude analyzes the statement, assigns it a node type, detects tactics and flags, and adds it to the argument map.</li>
          <li>The turn passes to the other speaker. Repeat.</li>
        </ol>
        <p>Alternatively, use <strong>Combined mode</strong> (input bar) to paste an entire back-and-forth conversation at once — Claude parses and processes each turn sequentially.</p>

        <h3 id="tabs">Tabs</h3>
        <dl>
          <dt>Map</dt>
          <dd>Live visual graph of the debate. Click any node to see its details. Click the background to hide/show the header and footer for a cleaner view.</dd>
          <dt>List</dt>
          <dd>Tree view of all nodes, indented by parent-child relationship. Good for mobile or dense debates.</dd>
          <dt>Moderator</dt>
          <dd>Side-by-side speaker breakdowns (style analysis + event log) plus an AI chat where you can ask Claude anything about the debate.</dd>
          <dt>Arguments</dt>
          <dd>Your saved debates (requires sign-in). Start a new argument, load a previous one, or delete from here.</dd>
        </dl>

        <h3 id="node-types">Node Types</h3>
        <table className="about-table">
          <tbody>
            <tr><td><code>claim</code></td><td>The main position being argued</td></tr>
            <tr><td><code>premise</code></td><td>A reason supporting a claim</td></tr>
            <tr><td><code>evidence</code></td><td>A fact or citation backing a premise</td></tr>
            <tr><td><code>objection</code></td><td>A counterargument</td></tr>
            <tr><td><code>rebuttal</code></td><td>A response to an objection</td></tr>
            <tr><td><code>clarification</code></td><td>A clarifying statement</td></tr>
          </tbody>
        </table>

        <h3 id="node-detail-popup">Node Detail Popup</h3>
        <p>Click any node to open a popup showing:</p>
        <ul>
          <li><strong>Original Statement</strong> — what the user actually typed</li>
          <li><strong>AI Summary</strong> — the cleaned-up claim Claude extracted</li>
          <li><strong>Tactics Detected</strong> — badges with per-tactic explanations</li>
          <li><strong>Concede button</strong> — concede the point manually</li>
          <li><strong>Contradiction / goalpost chips</strong> — clickable, navigate to the related node</li>
          <li><strong>Edit mode</strong> (✏) — change content, type, parent, tags, and flags</li>
        </ul>

        <h3 id="adding-nodes">Adding Nodes Manually</h3>
        <p>
          Not every argument needs to go through Claude. Use the <strong>+ Node</strong> button in the input bar
          to add a node directly — no AI analysis, no turn cost. You set the content, type, and parent yourself.
          The node is attributed to the current speaker. Useful for adding evidence, clarifications, or points
          you want to place precisely in the tree.
        </p>

        <h3 id="concessions">Concessions</h3>
        <p>There are two ways to concede a point:</p>
        <ul>
          <li><strong>Manual:</strong> In the node detail popup, click the concede button — on the opponent's node to agree their point stands, or on your own node to retract it.</li>
          <li><strong>AI-detected:</strong> When Claude notices a submitted statement implicitly concedes a point, a confirmation modal appears. Confirm to apply it, or dismiss to ignore.</li>
        </ul>
        <p>Conceded and retracted nodes — along with all their supporting predecessors — <strong>fade out</strong> across the map and list. Conceding a node also automatically clears any contradiction or goalpost-moving flags it was the source of, since those arguments are no longer in play.</p>

        <h3 id="tactic-detection">Tactic Detection</h3>
        <p>Claude automatically detects rhetorical tactics on every node.</p>
        <p><strong>Fallacies</strong> (red badges): Straw Man, Ad Hominem, No True Scotsman, False Dilemma, Slippery Slope, Appeal to Authority, Red Herring, Circular Reasoning, Appeal to Emotion, Hasty Generalization</p>
        <p><strong>Good techniques</strong> (green badges): Steel Man, Evidence Based, Logical Deduction, Addresses Counterargument, Cites Source</p>
        <p>Tactics are re-evaluated on every turn — new context can reveal fallacies in earlier statements.</p>

        <h3 id="flags">Contradiction, Goalpost &amp; Non-sequitur Detection</h3>
        <ul>
          <li><strong>⚠ Contradiction:</strong> A speaker's new node directly contradicts one of their own earlier nodes. Both get a red border. Supporting nodes by the same speaker are also flagged as undermined.</li>
          <li><strong>⤳ Goalpost Moving:</strong> A speaker quietly shifts the scope of their own earlier claim to dodge a challenge. Both affected nodes get an orange border.</li>
          <li><strong>⚡ Non-sequitur:</strong> A statement with no logical connection to any existing node. It appears beside the tree with a red border.</li>
        </ul>
        <p>These flags only apply within a single speaker's own nodes — they can never occur across speakers, since arguing against the other person is just normal debate.</p>

        <h3 id="moderator-tab">Moderator Tab</h3>
        <p>
          The Moderator tab shows a side-by-side breakdown of both speakers — Claude's assessment of each
          person's rhetorical style, plus a running event log of notable moves (tactics used, concessions made,
          contradictions, retractions, and points the opponent agreed with).
        </p>
        <p>
          Below the breakdowns is an <strong>AI chat</strong> where you can ask Claude anything about the debate —
          explain the map, identify weak points, steelman a position, summarize. Claude can update the argument
          map from the chat; a "Map updated" label appears on those replies.
        </p>

        <h3 id="accounts">Accounts &amp; Auto-Save</h3>
        <ul>
          <li>Sign in or sign up via the <strong>⚙ settings</strong> menu (top right).</li>
          <li>When signed in, debates <strong>auto-save</strong> to the cloud a moment after any change.</li>
          <li>Load, delete, or start a new argument from the <strong>Arguments</strong> tab.</li>
          <li>If you're not signed in, a nudge appears after a few nodes. Closing the tab will warn you about unsaved work.</li>
        </ul>

        <h3 id="other-controls">Other Controls</h3>
        <dl>
          <dt>← / → (input bar)</dt>
          <dd>Undo and redo — every submission, rating, and edit is tracked in a history stack.</dd>
          <dt>Review Changes (input bar)</dt>
          <dd>Opens a log of every change Claude has made to the map across all turns.</dd>
          <dt>Skip Turn</dt>
          <dd>Pass to the other speaker without submitting a statement.</dd>
          <dt>Combined / Turns (input bar)</dt>
          <dd>Switch between one-turn-at-a-time mode and bulk conversation paste mode.</dd>
          <dt>⚙ Settings</dt>
          <dd>Switch themes (light and dark). Sign in or out.</dd>
        </dl>

        <h3 id="keyboard-shortcuts">Keyboard Shortcuts</h3>
        <table className="about-table">
          <tbody>
            <tr><td><kbd>Enter</kbd></td><td>Submit statement</td></tr>
            <tr><td><kbd>Shift+Enter</kbd></td><td>New line in the text box</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Close any open popup</td></tr>
          </tbody>
        </table>

        <h3 id="tips">Tips</h3>
        <ul>
          <li><strong>Be specific</strong> — vague statements produce vague nodes. Claude works best with clear, focused claims.</li>
          <li><strong>Concede freely</strong> — fading settled nodes keeps the map focused on what's still genuinely contested.</li>
          <li><strong>Use the Moderator tab mid-debate</strong> for a neutral read on who's winning or where an argument is weak.</li>
          <li><strong>Click nodes in the graph</strong> — the popup shows the original wording vs. the AI's interpretation, useful if you want to dispute or edit a summary.</li>
          <li><strong>Undo aggressively</strong> — if Claude misreads a statement and creates a bad node, undo and rephrase rather than working around it.</li>
        </ul>

        {/* ── Technical Overview ─────────────────────────────── */}
        <h3 id="technical">Technical Overview</h3>
        <p>
          Argument Mapper is a fully client-side React application backed by Supabase for auth and persistence,
          with all AI calls routed through a secure server-side proxy. There is no traditional application server —
          the app is a static build deployed to GitHub Pages.
        </p>

        <h4 id="tech-stack">Tech Stack</h4>
        <table className="about-table">
          <tbody>
            <tr><td><strong>React 19</strong></td><td>UI framework, built with Vite. Vanilla CSS — no component library.</td></tr>
            <tr><td><strong>Cytoscape.js</strong></td><td>Graph rendering engine. Uses the <code>dagre</code> layout plugin for tree arrangement and <code>cytoscape-node-html-label</code> for rich badge overlays on nodes.</td></tr>
            <tr><td><strong>Supabase</strong></td><td>PostgreSQL database for debate storage, Supabase Auth for user accounts, and Supabase Edge Functions (Deno runtime) as the AI proxy.</td></tr>
            <tr><td><strong>Claude (Anthropic)</strong></td><td>Claude Sonnet for full argument map analysis each turn; Claude Haiku for fast conversation parsing in Combined mode.</td></tr>
            <tr><td><strong>GitHub Pages</strong></td><td>Hosts the static build. Deployed from the <code>master</code> branch via GitHub Actions.</td></tr>
          </tbody>
        </table>

        <h4 id="tech-ai">AI Integration</h4>
        <p>
          The browser never touches the Anthropic API directly. Instead, every AI call goes to a
          Supabase Edge Function (<code>claude-proxy</code>) that authenticates the request with a shared
          secret, then forwards it to the Anthropic API using a server-side API key. This keeps credentials
          out of the client bundle entirely.
        </p>
        <p>
          Claude operates with a detailed system prompt that defines the full argument map schema (nodes,
          edges, metadata, tactic keys, flag types) and precise detection rules for contradictions, goalpost
          moves, concessions, non-sequiturs, and rhetorical tactics. The entire current map is sent with
          every request so Claude has full context — it returns a complete updated map, not a diff.
        </p>

        <h4 id="tech-turn">How a Turn Works</h4>
        <ol>
          <li>The current speaker submits a statement.</li>
          <li>The app sends the full current map JSON + the new statement to the proxy.</li>
          <li>Claude returns an updated map JSON — new nodes, updated edges, fresh tactic analysis on all nodes, and any detected flags.</li>
          <li>The app diffs the old and new maps to build a changelog entry.</li>
          <li>Any AI-detected concessions are stripped from the map and queued as confirmation modals before being applied.</li>
          <li>The sanitized map is pushed onto the undo/redo history stack and React re-renders.</li>
          <li>Cytoscape re-runs the dagre layout and animates all nodes to their new positions.</li>
        </ol>
        <p>
          In <strong>Combined mode</strong>, Claude Haiku first parses the pasted conversation into an ordered
          list of attributed turns, then the full Sonnet analysis loop runs for each turn sequentially.
        </p>

        <h4 id="tech-data">Data &amp; Persistence</h4>
        <p>
          Each debate is stored as a single JSON blob in a Supabase <code>debates</code> table, alongside
          the debate title, theme key, and speaker names. Auto-save fires 1.5 seconds after any map change
          when the user is signed in — it upserts to the same row until a new debate is started.
          Row-level security ensures users can only read and write their own debates.
        </p>
        <p>
          Locally, the app maintains an in-memory undo/redo stack (a plain array of map snapshots).
          The theme preference is persisted to <code>localStorage</code>. Nothing else touches the client
          file system.
        </p>

        <h4 id="tech-hosting">Hosting &amp; Deployment</h4>
        <p>
          The Vite build outputs a static <code>dist/</code> folder. GitHub Pages serves it from the
          repository root. Pushing to <code>master</code> triggers a GitHub Actions workflow that builds
          and deploys automatically. The Supabase Edge Function is deployed separately via the Supabase CLI.
        </p>

        {/* ── Philosophy ─────────────────────────────────────── */}
        <h3 id="philosophy">Philosophy</h3>
        <p>
          Argument Mapper exists because most online debate is structurally broken — not because people
          are dishonest, but because the medium works against them.
        </p>

        <h4 id="phil-problem">The Problem</h4>
        <p>
          Text-based conversation is linear. Arguments are not. When two people debate in a chat thread,
          the conversation sprawls — earlier points get buried, rebuttals get detached from what they're
          rebutting, and rhetorical sleight-of-hand is hard to call out in the moment. People talk past
          each other not out of bad faith but because the format makes it nearly impossible to track
          what has actually been established and what remains contested.
        </p>
        <p>
          The result is that most online arguments end without resolution — not because the disagreement
          is irresolvable, but because neither side can agree on what the disagreement even is anymore.
        </p>

        <h4 id="phil-approach">The Approach</h4>
        <p>
          Argument Mapper imposes structure. Every statement becomes a node. Every node has a type, a
          parent, and a speaker. The graph makes the logical shape of the debate visible and persistent:
          you can see at a glance what supports what, what challenges what, and where the conversation
          has genuinely moved.
        </p>
        <p>
          Nodes that have been agreed upon fade out. Statements that contradict the same speaker's earlier
          position are flagged. Rhetorical patterns — fallacies, steelmanning, goalpost-moving — are surfaced
          automatically. The map is a shared artifact that both participants are building together, even as
          they argue.
        </p>

        <h4 id="phil-ai-role">The Role of AI</h4>
        <p>
          Claude is not a participant. It doesn't take sides, doesn't try to win, and doesn't generate
          arguments. Its job is to be a neutral structural layer — converting raw statements into clean,
          objectively worded claims; detecting patterns the participants might not notice in the heat of
          debate; and acting as a moderator who can explain the state of the argument without an agenda.
        </p>
        <p>
          This distinction matters. The goal is to give both participants a shared, trustworthy
          representation of their own argument. If either side feels the AI is working against them,
          the tool fails. The prompt is designed carefully to keep Claude analytical and descriptive,
          never persuasive.
        </p>

        <h4 id="phil-principles">Design Principles</h4>
        <ul>
          <li><strong>Structure over rhetoric.</strong> A well-organized weak argument should be easier to refute than a rhetorically polished one. The map strips the polish.</li>
          <li><strong>Settled things should look settled.</strong> Fading out agreed nodes keeps the visual focus on what's actually still in dispute.</li>
          <li><strong>Transparency at every step.</strong> The popup shows the original wording alongside the AI's summary, so either participant can challenge a misrepresentation. The changelog shows exactly what Claude changed each turn.</li>
          <li><strong>Low friction, high structure.</strong> The app shouldn't feel like filling out a form. You just talk — the structure emerges from the conversation automatically.</li>
          <li><strong>Productive disagreement is a skill.</strong> The app is designed to make the mechanics of good-faith argument more visible: conceding points, addressing the actual claim, avoiding goalpost-moving. The hope is that using it makes you a slightly better arguer even when you're not using it.</li>
        </ul>
      </div>
      </div>
    </div>
  );
}
