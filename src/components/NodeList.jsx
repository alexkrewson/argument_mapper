/**
 * NodeList.jsx — Sidebar list of all nodes in the argument map.
 *
 * Shows each node's content, type, speaker, confidence, tactics, and rating.
 * Users can rate (thumbs up/down) only the OTHER user's statements.
 */

import { TACTICS } from "../utils/tactics.js";
import { spk } from "../utils/speakers.js";

export default function NodeList({ nodes, currentSpeaker, onRate, onNodeClick, loading, fadedNodeIds }) {
  if (nodes.length === 0) {
    return (
      <div className="node-list">
        <h3>Statements</h3>
        <p className="empty-message">No statements yet.</p>
      </div>
    );
  }

  return (
    <div className="node-list">
      <h3>Statements ({nodes.length})</h3>
      <ul>
        {nodes.map((node) => (
          <li key={node.id} onClick={() => onNodeClick?.(node)} style={fadedNodeIds?.has(node.id) ? { opacity: 0.5 } : undefined}>
            {/* Top row: badges */}
            <div className="node-badges">
              <span
                className="speaker-badge"
                style={{
                  backgroundColor:
                    node.speaker === "User A" ? "#3b82f6" : "#22c55e",
                }}
              >
                {spk(node.speaker)}
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

            {/* Fading reason indicator */}
            {fadedNodeIds?.has(node.id) && node.rating === "up" && (
              <div className="agreement-indicator">
                <span className="agreement-indicator-icon">&#x2714;</span>
                {node.metadata?.agreed_by?.text
                  ? `Implicit agreement — ${spk(node.metadata.agreed_by.speaker)}`
                  : node.metadata?.agreed_by?.speaker
                  ? `Thumbs up — ${spk(node.metadata.agreed_by.speaker)}`
                  : "Agreed"}
              </div>
            )}
            {fadedNodeIds?.has(node.id) && node.rating === "down" && (
              <div className="retracted-indicator">
                ↩ Retracted by {spk(node.speaker)}
              </div>
            )}
            {fadedNodeIds?.has(node.id) && !node.rating && (
              <div className="inactive-indicator">
                ⬡ Supporting a resolved statement
              </div>
            )}

            {/* Thumbs up — only for the OTHER user's statements */}
            {/* Thumbs down — only for YOUR OWN statements */}
            <span className="rating-buttons" onClick={(e) => e.stopPropagation()}>
              <button
                className={`rate-btn ${node.rating === "up" ? "active-up" : ""} ${node.speaker === currentSpeaker ? "rate-btn-unavailable" : ""}`}
                onClick={() => onRate(node.id, "up")}
                disabled={loading || node.speaker === currentSpeaker}
                title={node.speaker !== currentSpeaker ? "I agree with this representation" : "You can only agree with the other user's statements"}
              >
                &#x1F44D;
              </button>
              <button
                className={`rate-btn ${node.rating === "down" ? "active-down" : ""} ${node.speaker !== currentSpeaker ? "rate-btn-unavailable" : ""}`}
                onClick={() => onRate(node.id, "down")}
                disabled={loading || node.speaker !== currentSpeaker}
                title={node.speaker === currentSpeaker ? "Retract this argument" : "You can only retract your own statements"}
              >
                &#x1F44E;
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
