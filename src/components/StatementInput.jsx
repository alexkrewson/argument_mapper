/**
 * StatementInput.jsx — Text input for the current speaker to type their statement.
 *
 * Has two modes:
 * - Debate mode (default): statement is added as an argument in the debate flow
 * - AI Moderator mode (Chat tab): chat with the AI about the map
 */

import { useState, useRef, useEffect } from "react";
import { speakerName } from "../utils/speakers.js";

export default function StatementInput({ currentSpeaker, speakerSummary, onSubmit, onChatMessage, loading, loadingSpeaker, directMode, onSkipTurn, onUndo, onRedo, canUndo, canRedo, theme }) {
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

  const speakerColor = theme?.a && currentSpeaker === "Blue" ? theme.a.bg
                     : theme?.b && currentSpeaker === "Green" ? theme.b.bg
                     : currentSpeaker === "Blue" ? "#3b82f6" : "#22c55e";
  const speakerGlow = `${speakerColor}26`; // 15% alpha hex
  const activeColor = loading ? "#475569" : speakerColor;
  const activeGlow  = loading ? "rgba(71,85,105,0.15)" : speakerGlow;

  return (
    <form
      className="statement-input"
      style={{ "--speaker-color": activeColor, "--speaker-glow": activeGlow }}
      onSubmit={handleSubmit}
    >
      <div className="input-header">
        <div className="speaker-label" style={{ color: loading && loadingSpeaker ? "#475569" : speakerColor }}>
          {loading && loadingSpeaker ? (
            <>Considering {speakerName(loadingSpeaker, theme)}'s statement<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
          ) : `${speakerName(currentSpeaker, theme)}'s turn`}
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
              : `${speakerName(currentSpeaker, theme)}, say whatever you want...`
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
