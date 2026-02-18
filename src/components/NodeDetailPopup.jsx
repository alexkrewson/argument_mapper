/**
 * NodeDetailPopup.jsx — Modal popup showing full details for a selected node.
 *
 * Displays: node ID, type, speaker, original text, AI summary,
 * tactic badges with explanations. Closes on X, backdrop click, or Escape.
 */

import { useEffect } from "react";
import { TACTICS } from "../utils/tactics.js";

export default function NodeDetailPopup({ node, originalText, onClose, fadedNodeIds, nodes, onNodeClick }) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!node) return null;

  const tactics = node.metadata?.tactics?.filter((key) => TACTICS[key]) || [];
  const tacticReasons = node.metadata?.tactic_reasons || {};
  const contradictsId = node.metadata?.contradicts;
  const goalpostsId = node.metadata?.moves_goalposts_from;
  const contradictsNode = contradictsId ? nodes?.find((n) => n.id === contradictsId) : null;
  const goalpostsNode = goalpostsId ? nodes?.find((n) => n.id === goalpostsId) : null;

  return (
    <div className="popup-backdrop" onClick={onClose}>
      <div className="popup-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="popup-header">
          <div className="node-badges">
            <span className="node-id-badge">{node.id}</span>
            <span className={`type-badge type-${node.type}`}>{node.type}</span>
            <span
              className="speaker-badge"
              style={{
                backgroundColor:
                  node.speaker === "User A" ? "#3b82f6" : "#22c55e",
              }}
            >
              {node.speaker}
            </span>
            {node.metadata?.confidence && (
              <span className={`confidence-badge confidence-${node.metadata.confidence}`}>
                {node.metadata.confidence}
              </span>
            )}
          </div>
          <button className="popup-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Agreement banner */}
        {fadedNodeIds?.has(node.id) && (
          <div className="agreement-banner">
            <span className="agreement-banner-icon">&#x2714;</span>
            <div>
              <strong>Both users agree</strong>
              {node.metadata?.agreed_by?.speaker && (
                <div className="agreement-by">
                  Agreed by {node.metadata.agreed_by.speaker}
                </div>
              )}
              {node.metadata?.agreed_by?.text && (
                <blockquote className="agreement-quote">
                  {node.metadata.agreed_by.text}
                </blockquote>
              )}
            </div>
          </div>
        )}

        {/* Contradiction banner */}
        {contradictsNode && (
          <div className="flag-banner flag-contradiction">
            <span className="flag-banner-icon">⚠️</span>
            <div className="flag-banner-body">
              <strong>Contradicts an earlier statement</strong>
              <div className="flag-banner-linked" onClick={() => { onClose(); onNodeClick?.(contradictsNode); }}>
                <span className="node-id-badge">{contradictsNode.id}</span>
                <span className="flag-banner-linked-text">{contradictsNode.content}</span>
              </div>
            </div>
          </div>
        )}

        {/* Goalpost moving banner */}
        {goalpostsNode && (
          <div className="flag-banner flag-goalposts">
            <span className="flag-banner-icon">🥅</span>
            <div className="flag-banner-body">
              <strong>Moves the goalposts</strong>
              <div className="flag-banner-linked" onClick={() => { onClose(); onNodeClick?.(goalpostsNode); }}>
                <span className="node-id-badge">{goalpostsNode.id}</span>
                <span className="flag-banner-linked-text">{goalpostsNode.content}</span>
              </div>
            </div>
          </div>
        )}

        {/* Original text */}
        {originalText && (
          <div className="popup-section">
            <h4>Original Statement</h4>
            <blockquote className="popup-quote">{originalText}</blockquote>
          </div>
        )}

        {/* AI summary */}
        <div className="popup-section">
          <h4>AI Summary</h4>
          <p className="popup-summary">{node.content}</p>
        </div>

        {/* Tactic explanations */}
        {tactics.length > 0 && (
          <div className="popup-section">
            <h4>Tactics Detected</h4>
            <ul className="popup-tactics">
              {tactics.map((key) => (
                <li key={key}>
                  <span className={`tactic-badge tactic-${TACTICS[key].type}`}>
                    {TACTICS[key].symbol} {TACTICS[key].name}
                  </span>
                  {tacticReasons[key] && (
                    <span className="tactic-reason">{tacticReasons[key]}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {node.metadata?.tags?.length > 0 && (
          <div className="popup-section">
            <h4>Tags</h4>
            <div className="popup-tags">
              {node.metadata.tags.map((tag) => (
                <span key={tag} className="popup-tag">{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
