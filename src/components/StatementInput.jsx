/**
 * StatementInput.jsx — Text input for the current speaker to type their statement.
 *
 * Modes:
 * - "turns"    (default): one statement at a time, alternating speakers
 * - "combined": paste a full back-and-forth conversation for bulk processing
 * - directMode (Moderator tab): chat with the AI about the map
 */

import { useState, useRef, useEffect } from "react";
import { speakerName } from "../utils/speakers.js";

export default function StatementInput({
  currentSpeaker, speakerSummary, onSubmit, onChatMessage,
  loading, loadingSpeaker, directMode, onSkipTurn,
  onUndo, onRedo, canUndo, canRedo,
  onAddNode, onReviewChanges, changeLogCount,
  theme, nameEditable, currentName, onNameChange, onRefreshName,
  inputMode, onModeChange, onCombinedSubmit, combiningProgress,
}) {
  const [text, setText] = useState("");
  const [combinedText, setCombinedText] = useState("");
  const textareaRef = useRef(null);

  // Refocus textarea when Claude finishes thinking
  useEffect(() => {
    if (!loading) textareaRef.current?.focus();
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
      setText("");
      textareaRef.current?.focus();
    } catch {
      // keep text so user doesn't retype
    }
  };

  const handleCombinedProcess = async (e) => {
    e.preventDefault();
    if (!combinedText.trim() || loading) return;
    try {
      await onCombinedSubmit(combinedText.trim());
      setCombinedText("");
    } catch {
      // keep text
    }
  };

  const speakerColor = theme?.a && currentSpeaker === "Blue" ? theme.a.bg
                     : theme?.b && currentSpeaker === "Green" ? theme.b.bg
                     : currentSpeaker === "Blue" ? "#3b82f6" : "#22c55e";
  const speakerGlow  = `${speakerColor}26`;
  const activeColor  = loading ? "#475569" : speakerColor;
  const activeGlow   = loading ? "rgba(71,85,105,0.15)" : speakerGlow;
  const isCombined   = inputMode === "combined";

  return (
    <form
      className="statement-input"
      style={{ "--speaker-color": activeColor, "--speaker-glow": activeGlow }}
      onSubmit={isCombined ? handleCombinedProcess : handleSubmit}
    >
      <div className="input-header">
        <div className="speaker-label" style={{ color: loading && loadingSpeaker ? "#475569" : speakerColor }}>
          {loading && combiningProgress ? (
            <>Processing turn {combiningProgress.current} of {combiningProgress.total}<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
          ) : loading && loadingSpeaker ? (
            <>Considering {speakerName(loadingSpeaker, theme)}'s statement<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
          ) : nameEditable ? (
            <span className="name-edit-row">
              <button
                type="button"
                className="name-refresh-btn"
                onClick={onRefreshName}
                title="Generate a new name"
                style={{ color: speakerColor }}
              >⟳</button>
              <input
                className="name-edit-input"
                type="text"
                value={currentName}
                placeholder="Your name"
                size={Math.max(6, (currentName || "Your name").length + 1)}
                onChange={(e) => onNameChange(e.target.value)}
                style={{ color: speakerColor, borderColor: `${speakerColor}60` }}
              /><span>'s turn</span>
            </span>
          ) : (
            `${speakerName(currentSpeaker, theme)}'s turn`
          )}
        </div>
        {!loading && (
          <div className="turn-controls">
            <button
              className="skip-turn-btn"
              onClick={onSkipTurn}
              type="button"
              disabled={isCombined}
            >Skip Turn</button>
            <button className="history-btn" onClick={onUndo} disabled={!canUndo} type="button" title="Undo">↩</button>
            <button className="history-btn" onClick={onRedo} disabled={!canRedo} type="button" title="Redo">↪</button>
            <button
              type="button"
              className={`mode-btn${isCombined ? " mode-btn--active" : ""}`}
              onClick={() => onModeChange("combined")}
              disabled={isCombined}
            >Combined</button>
            <button
              type="button"
              className={`mode-btn${!isCombined ? " mode-btn--active" : ""}`}
              onClick={() => onModeChange("turns")}
              disabled={!isCombined}
            >Turns</button>
            {changeLogCount > 0 && (
              <button className="review-changes-btn" onClick={onReviewChanges} type="button">
                Review AI Changes ({changeLogCount})
              </button>
            )}
          </div>
        )}
        {!loading && (
          <span className="speaker-summary">— {speakerSummary}</span>
        )}
      </div>

      <div className="input-row">
        {isCombined ? (
          <textarea
            ref={textareaRef}
            autoFocus
            placeholder={"Paste your conversation here. The first speaker will be treated as the current user.\n\nExample:\nAlex: I think remote work is more productive.\nJordan: Studies show office workers collaborate better.\nAlex: But those studies predate modern tooling."}
            value={combinedText}
            onChange={(e) => setCombinedText(e.target.value)}
            disabled={loading}
            rows={5}
          />
        ) : (
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
        )}
        <div className="input-btn-col">
          {!directMode && !isCombined && (
            <button
              type="button"
              className="add-node-btn"
              onClick={onAddNode}
              disabled={loading}
              title="Manually add a node to the map"
            >
              + Node
            </button>
          )}
          <button
            type="submit"
            disabled={loading || (isCombined ? !combinedText.trim() : !text.trim())}
          >
            {loading
              ? (combiningProgress ? "Processing..." : "Thinking...")
              : (isCombined ? "Process" : "Submit")}
          </button>
        </div>
      </div>
    </form>
  );
}
