/**
 * StatementInput.jsx — Text input for the current speaker to type their statement.
 *
 * Has two modes:
 * - Debate mode (default): statement is added as an argument in the debate flow
 * - Direct AI mode: message goes to Claude as a correction/instruction about the map
 */

import { useState } from "react";

export default function StatementInput({ currentSpeaker, speakerSummary, onSubmit, onDirectMessage, loading, directMode, onToggleMode }) {
  const [text, setText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || loading) return;
    if (directMode) {
      onDirectMessage(text.trim());
    } else {
      onSubmit(text.trim());
    }
    setText("");
  };

  const speakerColor = currentSpeaker === "User A" ? "#3b82f6" : "#22c55e";

  return (
    <form className="statement-input" onSubmit={handleSubmit}>
      <div className="input-header">
        {directMode ? (
          <div className="speaker-label" style={{ color: "#8b5cf6" }}>
            Direct to AI (corrections / instructions)
          </div>
        ) : (
          <div className="speaker-label" style={{ color: speakerColor }}>
            {currentSpeaker}'s turn
            {speakerSummary && (
              <span className="speaker-summary"> — {speakerSummary}</span>
            )}
          </div>
        )}
        <button
          type="button"
          className={`mode-toggle ${directMode ? "active" : ""}`}
          onClick={onToggleMode}
          title={directMode ? "Switch back to debate mode" : "Talk directly to AI about the map"}
        >
          {directMode ? "Back to Debate" : "Talk to AI"}
        </button>
      </div>
      <div className="input-row">
        <textarea
          placeholder={
            directMode
              ? 'e.g. "node_3 is misrepresented, it should say..."'
              : `${currentSpeaker}, type your statement...`
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          disabled={loading}
          rows={3}
        />
        <button type="submit" disabled={loading || !text.trim()}>
          {loading ? "Thinking..." : "Submit"}
        </button>
      </div>
    </form>
  );
}
