/**
 * StatementInput.jsx — Text input for the current speaker to type their statement.
 *
 * Has two modes:
 * - Debate mode (default): statement is added as an argument in the debate flow
 * - AI Moderator mode: chat with the AI about the map, with optional map updates
 */

import { useState, useRef, useEffect } from "react";

export default function StatementInput({ currentSpeaker, speakerSummary, onSubmit, onChatMessage, loading, loadingSpeaker, directMode, onToggleMode, chatMessages }) {
  const [text, setText] = useState("");
  const chatLogRef = useRef(null);

  // Auto-scroll chat log to bottom when new messages arrive
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

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
    } catch {
      // Text stays in the textarea so the user doesn't have to retype
    }
  };

  const speakerColor = currentSpeaker === "User A" ? "#3b82f6" : "#22c55e";

  return (
    <form className="statement-input" onSubmit={handleSubmit}>
      <div className="input-header">
        {directMode ? (
          <div className="speaker-label" style={{ color: "#8b5cf6" }}>
            AI Moderator
          </div>
        ) : (
          <div className="speaker-label" style={{ color: speakerColor }}>
            {loading && loadingSpeaker ? `Thinking about ${loadingSpeaker}'s last submission` : `${currentSpeaker}'s turn`}
            {!loading && speakerSummary && (
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

      {/* Chat log — only visible in AI moderator mode */}
      {directMode && chatMessages.length > 0 && (
        <div className="chat-log" ref={chatLogRef}>
          {chatMessages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.role}`}>
              <div className="chat-bubble">{msg.content}</div>
              {msg.mapUpdated && (
                <div className="chat-map-updated">Map updated</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="input-row">
        <textarea
          placeholder={
            directMode
              ? "Ask the AI moderator anything..."
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
