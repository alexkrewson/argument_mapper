/**
 * AIChangeLogModal.jsx — Shows a log of all AI-made changes to the argument map.
 *
 * Each entry records the turn, speaker, submitted statement, and a diff of
 * what the AI added / modified / removed in that turn.
 */

import { useEffect } from "react";
import { speakerBorder, speakerName } from "../utils/speakers.js";

export default function AIChangeLogModal({ log, onClose, theme }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="popup-backdrop" onClick={onClose}>
      <div className="popup-card popup-card--changelog" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <span className="popup-edit-title">AI Change Log</span>
          <button className="popup-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {log.length === 0 ? (
          <div className="popup-section">
            <p className="popup-summary">No AI changes recorded yet.</p>
          </div>
        ) : (
          <div className="changelog-list">
            {[...log].reverse().map((entry, idx) => (
              <div key={entry.id} className="changelog-entry">
                <div className="changelog-entry-header">
                  <span className="changelog-turn">Turn {log.length - idx}</span>
                  {entry.speaker === "Moderator" ? (
                    <span className="speaker-badge" style={{ backgroundColor: "#7c3aed" }}>Moderator</span>
                  ) : (
                    <span className="speaker-badge" style={{ backgroundColor: speakerBorder(entry.speaker, theme) }}>
                      {speakerName(entry.speaker, theme)}
                    </span>
                  )}
                </div>
                <blockquote className="changelog-statement">"{entry.statement}"</blockquote>
                <ul className="changelog-changes">
                  {entry.changes.map((c, i) => (
                    <li key={i} className="changelog-change">
                      {c.type === "added" && (
                        <>
                          <span className="changelog-icon changelog-icon--added">+</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className={`type-badge type-${c.nodeType}`}>{c.nodeType}</span>
                          <span className="changelog-content">
                            "{c.content.length > 70 ? c.content.slice(0, 67) + "…" : c.content}"
                          </span>
                        </>
                      )}
                      {c.type === "modified" && (
                        <>
                          <span className="changelog-icon changelog-icon--modified">~</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className="changelog-modified">
                            <span className="changelog-before">
                              "{c.before.length > 40 ? c.before.slice(0, 37) + "…" : c.before}"
                            </span>
                            <span className="changelog-arrow">→</span>
                            <span className="changelog-after">
                              "{c.after.length > 40 ? c.after.slice(0, 37) + "…" : c.after}"
                            </span>
                          </span>
                        </>
                      )}
                      {c.type === "removed" && (
                        <>
                          <span className="changelog-icon changelog-icon--removed">−</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className={`type-badge type-${c.nodeType}`}>{c.nodeType}</span>
                          <span className="changelog-content">removed</span>
                        </>
                      )}
                      {c.type === "edge_added" && (
                        <>
                          <span className="changelog-icon changelog-icon--edge">→</span>
                          <span className="changelog-content">
                            <span className="node-id-badge">{c.from}</span>
                            {" "}{c.relationship}{" "}
                            <span className="node-id-badge">{c.to}</span>
                          </span>
                        </>
                      )}
                      {c.type === "contradicts_set" && (
                        <>
                          <span className="changelog-icon changelog-icon--contradiction">⚠</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className="changelog-content">contradicts</span>
                          <span className="node-id-badge">{c.targetId}</span>
                        </>
                      )}
                      {c.type === "contradicts_cleared" && (
                        <>
                          <span className="changelog-icon changelog-icon--contradiction">⚠</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className="changelog-content">contradiction cleared (was {c.targetId})</span>
                        </>
                      )}
                      {c.type === "goalposts_set" && (
                        <>
                          <span className="changelog-icon changelog-icon--goalposts">⤳</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className="changelog-content">moves goalposts from</span>
                          <span className="node-id-badge">{c.targetId}</span>
                        </>
                      )}
                      {c.type === "goalposts_cleared" && (
                        <>
                          <span className="changelog-icon changelog-icon--goalposts">⤳</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className="changelog-content">goalpost flag cleared (was {c.targetId})</span>
                        </>
                      )}
                      {c.type === "concession_other" && (
                        <>
                          <span className="changelog-icon changelog-icon--concession-other">✓</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className="changelog-content">
                            {speakerName(c.concedingBy, theme)} conceded {speakerName(c.nodeSpeaker, theme)}'s point
                          </span>
                        </>
                      )}
                      {c.type === "concession_self" && (
                        <>
                          <span className="changelog-icon changelog-icon--concession-self">↩</span>
                          <span className="node-id-badge">{c.nodeId}</span>
                          <span className="changelog-content">
                            {speakerName(c.concedingBy, theme)} retracted their own argument
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
