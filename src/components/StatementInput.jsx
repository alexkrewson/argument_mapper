/**
 * StatementInput.jsx — Text input for the current speaker to type their statement.
 *
 * Has two modes:
 * - Debate mode (default): statement is added as an argument in the debate flow
 * - AI Moderator mode (Chat tab): chat with the AI about the map
 */

import { useState, useRef, useEffect } from "react";
import { spk } from "../utils/speakers.js";

export default function StatementInput({ currentSpeaker, speakerSummary, onSubmit, onChatMessage, loading, loadingSpeaker, directMode, onSkipTurn, onUndo, onRedo, canUndo, canRedo }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  // Refocus textarea when Claude finishes thinking
  useEffect(() => {
    if (!loading) {
      textareaRef.current?.focus();
    }
  }, [loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || loading) return;
    try {
      if (directMode) {
        await onChatMessage(text.trim());
      } else {
        await onSubmit(text.trim());
      }
      setText(""); // Only clear on success
      textareaRef.current?.focus();
    } catch {
      // Text stays in the textarea so the user doesn't have to retype
    }
  };

  const speakerColor = currentSpeaker === "User A" ? "#3b82f6" : "#22c55e";
  const speakerGlow = currentSpeaker === "User A" ? "rgba(59,130,246,0.15)" : "rgba(34,197,94,0.15)";
  const activeColor = loading ? "#8b5cf6" : speakerColor;
  const activeGlow  = loading ? "rgba(139,92,246,0.15)" : speakerGlow;

  return (
    <form
      className="statement-input"
      style={{ "--speaker-color": activeColor, "--speaker-glow": activeGlow }}
      onSubmit={handleSubmit}
    >
      <div className="input-header">
        <div className="speaker-label" style={{ color: loading && loadingSpeaker ? "#8b5cf6" : speakerColor }}>
          {loading && loadingSpeaker ? (
            <>Considering {spk(loadingSpeaker)}'s {directMode ? "submission" : "statement"}<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
          ) : `${spk(currentSpeaker)}'s turn`}
        </div>
        {!loading && (
          <div className="turn-controls">
            <button className="skip-turn-btn" onClick={onSkipTurn} type="button">Skip Turn</button>
            <button className="history-btn" onClick={onUndo} disabled={!canUndo} type="button" title="Undo">↩</button>
            <button className="history-btn" onClick={onRedo} disabled={!canRedo} type="button" title="Redo">↪</button>
          </div>
        )}
        {!loading && speakerSummary && (
          <span className="speaker-summary">— {speakerSummary}</span>
        )}
      </div>

      <div className="input-row">
        <textarea
          ref={textareaRef}
          autoFocus
          placeholder={
            directMode
              ? "Ask the AI moderator anything..."
              : `${spk(currentSpeaker)}, say whatever you want...`
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
