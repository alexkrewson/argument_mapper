/**
 * NodeList.jsx — Sidebar list of all nodes in the argument map.
 *
 * Shows each node's claim, speaker, and status.
 * Each node has a "Veto" button to flag it (marks it as disputed/removed).
 */

export default function NodeList({ nodes, onVeto, loading }) {
  if (nodes.length === 0) {
    return (
      <div className="node-list">
        <h3>Claims</h3>
        <p className="empty-message">No claims yet.</p>
      </div>
    );
  }

  return (
    <div className="node-list">
      <h3>Claims ({nodes.length})</h3>
      <ul>
        {nodes.map((node) => (
          <li key={node.id} className={node.flagged ? "flagged" : ""}>
            {/* Speaker badge — colored to match the graph */}
            <span
              className="speaker-badge"
              style={{
                backgroundColor:
                  node.speaker === "User A" ? "#3b82f6" : "#22c55e",
              }}
            >
              {node.speaker}
            </span>

            {/* The summarized claim */}
            <span className="claim-text">{node.claim}</span>

            {/* Show the original text on hover via title attribute */}
            {node.original && (
              <span className="original-text" title={node.original}>
                (hover for original)
              </span>
            )}

            {/* Veto button — flags the node as disputed */}
            {!node.flagged ? (
              <button
                className="veto-btn"
                onClick={() => onVeto(node.id)}
                disabled={loading}
                title="Flag this claim as disputed"
              >
                Veto
              </button>
            ) : (
              <span className="flagged-label">Vetoed</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
