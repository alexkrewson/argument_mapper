/**
 * ApiKeyInput.jsx — A simple input field for the user's Anthropic API key.
 *
 * Shows at the top of the app. The key is stored in App state (never persisted).
 * Once entered, the field collapses but can be toggled open to change the key.
 */

import { useState } from "react";

export default function ApiKeyInput({ apiKey, onApiKeyChange }) {
  // Track whether the input is expanded or collapsed
  const [expanded, setExpanded] = useState(!apiKey);

  return (
    <div className="api-key-input">
      {expanded ? (
        // Show the input field when expanded
        <div className="api-key-form">
          <label htmlFor="api-key">Anthropic API Key:</label>
          <input
            id="api-key"
            type="password"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
          />
          {/* Only show the "Done" button if a key has been entered */}
          {apiKey && (
            <button onClick={() => setExpanded(false)}>Done</button>
          )}
        </div>
      ) : (
        // When collapsed, show a status indicator and a button to change the key
        <div className="api-key-collapsed">
          <span className="api-key-status">API Key set</span>
          <button onClick={() => setExpanded(true)}>Change Key</button>
        </div>
      )}
    </div>
  );
}
