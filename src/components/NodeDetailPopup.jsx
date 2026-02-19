/**
 * NodeDetailPopup.jsx — Modal popup showing full details for a selected node.
 *
 * Displays: node ID, type, speaker, original text, AI summary,
 * tactic badges with explanations. Closes on X, backdrop click, or Escape.
 */

import { useEffect } from "react";
import { TACTICS } from "../utils/tactics.js";
import { spk } from "../utils/speakers.js";

export default function NodeDetailPopup({ node, originalText, onClose, fadedNodeIds, nodes, onNodeClick, onRate, currentSpeaker, loading }) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!node) return null;

  const speakerColor = node.speaker === "User A" ? "#3b82f6" : node.speaker === "User B" ? "#22c55e" : "#8b5cf6";
  const speakerBg = node.speaker === "User A" ? "#eff6ff" : node.speaker === "User B" ? "#f0fdf4" : "#f5f3ff";
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
              {spk(node.speaker)}
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

        {/* Fading reason banner — only shown when this node is greyed out */}
        {fadedNodeIds?.has(node.id) && node.rating === "up" && (
          <div className="agreement-banner">
            <span className="agreement-banner-icon">&#x2714;</span>
            <div>
              {node.metadata?.agreed_by?.text ? (
                <>
                  <strong>{spk(node.metadata.agreed_by.speaker)} conceded {spk(node.speaker)}'s point</strong>
                  <div className="agreement-by">implicit, from their submission</div>
                  <blockquote className="agreement-quote">
                    "{node.metadata.agreed_by.text}"
                  </blockquote>
                </>
              ) : node.metadata?.agreed_by?.speaker ? (
                <>
                  <strong>{spk(node.metadata.agreed_by.speaker)} conceded {spk(node.speaker)}'s point</strong>
                </>
              ) : (
                <strong>Conceded</strong>
              )}
            </div>
          </div>
        )}

        {fadedNodeIds?.has(node.id) && node.rating === "down" && (
          <div className="flag-banner flag-goalposts">
            <span className="flag-banner-icon">↩</span>
            <div className="flag-banner-body">
              <strong>Retracted</strong>
              <div>{spk(node.speaker)} retracted this argument via concession</div>
            </div>
          </div>
        )}

        {fadedNodeIds?.has(node.id) && !node.rating && (
          <div className="inactive-banner">
            <span className="inactive-banner-icon">⬡</span>
            <div>
              <strong>No longer active</strong>
              <div className="inactive-banner-reason">
                This argument supports a statement that has been agreed on, retracted, or walked back
              </div>
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
            <blockquote className="popup-quote" style={{ borderLeftColor: speakerColor, background: speakerBg }}>{originalText}</blockquote>
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

        {/* Concede button */}
        {onRate && (() => {
          const isOtherNode = node.speaker !== currentSpeaker;
          const isActive = isOtherNode ? node.rating === "up" : node.rating === "down";
          const ratingType = isOtherNode ? "up" : "down";
          const btnText = isOtherNode ? "I concede, this is correct" : "I concede, this is incorrect";
          return (
            <div className="popup-section popup-rating-row">
              <button
                className={`concede-btn${isActive ? " concede-btn--active" : ""}`}
                onClick={() => onRate(node.id, ratingType)}
                disabled={loading}
              >
                {isActive ? `✓ ${btnText}` : btnText}
              </button>
            </div>
          );
        })()}

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
