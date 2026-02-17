/**
 * ModeratorGaugePopup.jsx — Detail popup for the moderator's analysis.
 *
 * Shows the leaning gauge (larger), reasoning, and per-speaker style assessments.
 * Closes on X, backdrop click, or Escape.
 */

import { useEffect } from "react";

export default function ModeratorGaugePopup({ analysis, onClose }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!analysis) return null;

  const pct = ((analysis.leaning + 1) / 2) * 100;
  let markerColor = "#94a3b8";
  if (analysis.leaning < -0.1) markerColor = "#3b82f6";
  if (analysis.leaning > 0.1) markerColor = "#22c55e";

  const leaningLabel =
    analysis.leaning < -0.1
      ? "Leaning User A"
      : analysis.leaning > 0.1
      ? "Leaning User B"
      : "Balanced";

  return (
    <div className="popup-backdrop" onClick={onClose}>
      <div className="popup-card" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Moderator Analysis</h3>
          <button className="popup-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Leaning gauge (larger) */}
        <div className="popup-section">
          <h4>Debate Leaning</h4>
          <div className="gauge-popup-track-wrapper">
            <div className="gauge-labels">
              <span className="gauge-label-a">User A</span>
              <span className="gauge-label-b">User B</span>
            </div>
            <div className="gauge-track gauge-track-large">
              <div
                className="gauge-marker gauge-marker-large"
                style={{ left: `${pct}%`, backgroundColor: markerColor }}
              />
            </div>
            <div className="gauge-leaning-label" style={{ color: markerColor }}>
              {leaningLabel} ({analysis.leaning > 0 ? "+" : ""}{analysis.leaning.toFixed(2)})
            </div>
          </div>
          <p className="popup-summary" style={{ marginTop: "0.75rem" }}>
            {analysis.leaning_reason}
          </p>
        </div>

        {/* User A style */}
        <div className="popup-section">
          <h4>User A's Argumentative Style</h4>
          <p className="popup-summary" style={{ borderLeft: "3px solid #3b82f6", paddingLeft: "0.75rem" }}>
            {analysis.user_a_style}
          </p>
        </div>

        {/* User B style */}
        <div className="popup-section">
          <h4>User B's Argumentative Style</h4>
          <p className="popup-summary" style={{ borderLeft: "3px solid #22c55e", paddingLeft: "0.75rem" }}>
            {analysis.user_b_style}
          </p>
        </div>

        {/* Agreements */}
        {analysis.agreements?.length > 0 && (
          <div className="popup-section">
            <h4>Points of Agreement</h4>
            <ul className="gauge-agreements-list">
              {analysis.agreements.map((a) => (
                <li key={a.nodeId} className="gauge-agreement-item">
                  <span
                    className="speaker-badge"
                    style={{
                      backgroundColor: a.nodeSpeaker === "User A" ? "#3b82f6" : "#22c55e",
                    }}
                  >
                    {a.nodeSpeaker}
                  </span>
                  <span className="gauge-agreement-content">{a.content}</span>
                  {a.agreedBy && (
                    <span className="gauge-agreed-by">
                      — agreed by {a.agreedBy}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="gauge-agreement-note">
              Each agreement shifts the gauge by 0.1 toward the agreed-upon speaker.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
