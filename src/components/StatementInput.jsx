/**
 * StatementInput.jsx — Text input for the current speaker to type their statement.
 *
 * Shows whose turn it is (User A or User B) and a submit button.
 * On submit, it calls the parent's onSubmit handler with the statement text.
 */

import { useState } from "react";

export default function StatementInput({ currentSpeaker, onSubmit, loading }) {
  const [text, setText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Don't submit empty statements or while loading
    if (!text.trim() || loading) return;
    onSubmit(text.trim());
    setText(""); // Clear input after submit
  };

  // Color the speaker label to match the graph node colors
  const speakerColor = currentSpeaker === "User A" ? "#3b82f6" : "#22c55e";

  return (
    <form className="statement-input" onSubmit={handleSubmit}>
      <div className="speaker-label" style={{ color: speakerColor }}>
        {currentSpeaker}'s turn
      </div>
      <div className="input-row">
        <textarea
          placeholder={`${currentSpeaker}, type your statement...`}
          value={text}
          onChange={(e) => setText(e.target.value)}
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
