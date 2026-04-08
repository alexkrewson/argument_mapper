import { useEffect, useRef } from "react";

export default function AboutTab({ isActive }) {
  const divRef = useRef(null);
  const savedScroll = useRef(0);

  // Restore scroll when becoming active
  useEffect(() => {
    if (isActive && divRef.current) {
      divRef.current.scrollTop = savedScroll.current;
    }
  }, [isActive]);

  return (
    <div className="about-tab" ref={divRef} onScroll={() => { savedScroll.current = divRef.current.scrollTop; }}>
      <div className="about-content">
        <h2>Argument Mapper</h2>
        <p className="about-lead">
          A browser-based debate tool for two users. You take turns submitting arguments, and an AI (Claude)
          analyzes each statement, builds a live visual map of the debate, detects rhetorical tactics,
          moderates the exchange, and tracks concessions.
        </p>

        <h3>The Debate Flow</h3>
        <p>The app alternates turns between two speakers — each shown in their own color.</p>
        <ol>
          <li>Before your first submission, <strong>edit your name</strong> in the input bar or hit the shuffle icon for a random one. The name locks in after you submit.</li>
          <li>Type a statement and hit <strong>Submit</strong> (or <kbd>Enter</kbd>).</li>
          <li>Claude analyzes the statement, assigns it a node type, detects tactics and flags, and adds it to the argument map.</li>
          <li>The turn passes to the other speaker. Repeat.</li>
        </ol>

        <h3>Tabs</h3>
        <dl>
          <dt>Map</dt>
          <dd>Live visual graph of the debate. Click any node to see its details. Click the background to hide/show the header and footer for a cleaner view.</dd>
          <dt>List</dt>
          <dd>Tree view of all nodes, indented by parent-child relationship. Good for mobile or dense debates.</dd>
          <dt>Moderator</dt>
          <dd>Side-by-side speaker breakdowns (style analysis + event log) plus an AI chat where you can ask Claude anything about the debate.</dd>
          <dt>History</dt>
          <dd>Your saved debates (requires sign-in). Load or delete from here.</dd>
        </dl>

        <h3>Node Types</h3>
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

        <h3>Node Detail Popup</h3>
        <p>Click any node to open a popup showing:</p>
        <ul>
          <li><strong>Original Statement</strong> — what the user actually typed</li>
          <li><strong>AI Summary</strong> — the cleaned-up claim Claude extracted</li>
          <li><strong>Tactics Detected</strong> — badges with per-tactic explanations</li>
          <li><strong>Concede button</strong> — concede the point manually</li>
          <li><strong>Contradiction / goalpost chips</strong> — clickable, navigate to the related node</li>
          <li><strong>Edit mode</strong> (✏) — change content, type, parent, tags, and flags</li>
        </ul>

        <h3>Adding Nodes Manually</h3>
        <p>
          Not every argument needs to go through Claude. Use the <strong>+ Node</strong> button in the input bar
          to add a node directly — no AI analysis, no turn cost. You set the content, type, and parent yourself.
          The node is attributed to the current speaker. Useful for adding evidence, clarifications, or points
          you want to place precisely in the tree.
        </p>

        <h3>Concessions</h3>
        <p>There are two ways to concede a point:</p>
        <ul>
          <li><strong>Manual:</strong> In the node detail popup, click the concede button — on the opponent's node to agree their point stands, or on your own node to retract it.</li>
          <li><strong>AI-detected:</strong> When Claude notices a submitted statement implicitly concedes a point, a confirmation modal appears. Confirm to apply it, or dismiss to ignore.</li>
        </ul>
        <p>Conceded and retracted nodes — along with all their supporting predecessors — <strong>fade out</strong> across the map and list. They're settled.</p>

        <h3>Tactic Detection</h3>
        <p>Claude automatically detects rhetorical tactics on every node.</p>
        <p><strong>Fallacies</strong> (red badges): Straw Man, Ad Hominem, No True Scotsman, False Dilemma, Slippery Slope, Appeal to Authority, Red Herring, Circular Reasoning, Appeal to Emotion, Hasty Generalization</p>
        <p><strong>Good techniques</strong> (green badges): Steel Man, Evidence Based, Logical Deduction, Addresses Counterargument, Cites Source</p>

        <h3>Contradiction &amp; Goalpost Detection</h3>
        <ul>
          <li><strong>⚠ Contradiction:</strong> A speaker's new node directly contradicts one of their own earlier nodes. Both get a red border and background.</li>
          <li><strong>⤳ Goalpost Moving:</strong> A speaker shifts the standard they're arguing against mid-debate. Both affected nodes get an orange border.</li>
        </ul>

        <h3>Moderator Tab</h3>
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

        <h3>Accounts &amp; Auto-Save</h3>
        <ul>
          <li>Sign in or sign up via the <strong>⚙ settings</strong> menu (top right).</li>
          <li>When signed in, debates <strong>auto-save</strong> to the cloud a moment after any change.</li>
          <li>Load or delete saved debates from the <strong>History</strong> tab.</li>
          <li>If you're not signed in, a nudge appears after a few nodes. Closing the tab will warn you about unsaved work.</li>
        </ul>

        <h3>Other Controls</h3>
        <dl>
          <dt>← / → (input bar)</dt>
          <dd>Undo and redo — every submission, rating, and edit is tracked in a history stack.</dd>
          <dt>Review Changes (input bar)</dt>
          <dd>Opens a log of every change Claude has made to the map across all turns.</dd>
          <dt>Skip Turn</dt>
          <dd>Pass to the other speaker without submitting a statement.</dd>
          <dt>⚙ Settings</dt>
          <dd>Switch themes (light and dark). Sign in or out.</dd>
        </dl>

        <h3>Keyboard Shortcuts</h3>
        <table className="about-table">
          <tbody>
            <tr><td><kbd>Enter</kbd></td><td>Submit statement</td></tr>
            <tr><td><kbd>Shift+Enter</kbd></td><td>New line in the text box</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Close any open popup</td></tr>
          </tbody>
        </table>

        <h3>Tips</h3>
        <ul>
          <li><strong>Be specific</strong> — vague statements produce vague nodes. Claude works best with clear, focused claims.</li>
          <li><strong>Concede freely</strong> — fading settled nodes keeps the map focused on what's still genuinely contested.</li>
          <li><strong>Use the Moderator tab mid-debate</strong> for a neutral read on who's winning or where an argument is weak.</li>
          <li><strong>Click nodes in the graph</strong> — the popup shows the original wording vs. the AI's interpretation, useful if you want to dispute or edit a summary.</li>
          <li><strong>Undo aggressively</strong> — if Claude misreads a statement and creates a bad node, undo and rephrase rather than working around it.</li>
        </ul>
      </div>
    </div>
  );
}
