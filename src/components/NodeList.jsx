/**
 * NodeList.jsx — Sidebar list of all nodes in the argument map.
 *
 * Shows each node's content, type, speaker, confidence, tactics, and rating.
 * Users can rate (thumbs up/down) only the OTHER user's statements.
 */

import { TACTICS } from "../utils/tactics.js";

export default function NodeList({ nodes, currentSpeaker, onRate, onNodeClick, loading }) {
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
          <li key={node.id} onClick={() => onNodeClick?.(node)}>
            {/* Top row: badges */}
            <div className="node-badges">
              <span
                className="speaker-badge"
                style={{
                  backgroundColor:
                    node.speaker === "User A" ? "#3b82f6" : "#22c55e",
                }}
              >
                {node.speaker}
              </span>
              <span className="node-id-badge">{node.id}</span>
              <span className={`type-badge type-${node.type}`}>
                {node.type}
              </span>
              {node.metadata?.confidence && (
                <span className={`confidence-badge confidence-${node.metadata.confidence}`}>
                  {node.metadata.confidence}
                </span>
              )}
            </div>

            {/* Content text */}
            <span className="claim-text">{node.content}</span>

            {/* Tactic badges */}
            {node.metadata?.tactics?.length > 0 && (
              <div className="node-badges">
                {node.metadata.tactics
                  .filter((key) => TACTICS[key])
                  .map((key) => (
                    <span
                      key={key}
                      className={`tactic-badge tactic-${TACTICS[key].type}`}
                      title={TACTICS[key].name}
                    >
                      {TACTICS[key].symbol} {TACTICS[key].name}
                    </span>
                  ))}
              </div>
            )}

            {/* Thumbs up/down — only for the OTHER user's statements */}
            {node.speaker !== currentSpeaker && (
              <span className="rating-buttons" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`rate-btn ${node.rating === "up" ? "active-up" : ""}`}
                  onClick={() => onRate(node.id, "up")}
                  disabled={loading}
                  title="I agree with this representation"
                >
                  &#x1F44D;
                </button>
                <button
                  className={`rate-btn ${node.rating === "down" ? "active-down" : ""}`}
                  onClick={() => onRate(node.id, "down")}
                  disabled={loading}
                  title="I disagree with this representation"
                >
                  &#x1F44E;
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
