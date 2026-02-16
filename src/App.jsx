/**
 * App.jsx — Main application component.
 *
 * Manages all state and ties the components together:
 * - API key (entered by user at runtime)
 * - Argument map (nodes + edges, updated by Claude)
 * - Turn tracking (alternates between User A and User B)
 * - Loading state (while waiting for Claude's response)
 */

import { useState } from "react";
import ApiKeyInput from "./components/ApiKeyInput";
import StatementInput from "./components/StatementInput";
import ArgumentMap from "./components/ArgumentMap";
import NodeList from "./components/NodeList";
import { updateArgumentMap, vetoNode } from "./utils/claude";
import "./App.css";

// Initial empty map — no nodes, no edges
const EMPTY_MAP = { nodes: [], edges: [] };

export default function App() {
  // --- State ---
  const [apiKey, setApiKey] = useState("");          // User's Anthropic API key
  const [argumentMap, setArgumentMap] = useState(EMPTY_MAP); // The argument map data
  const [currentSpeaker, setCurrentSpeaker] = useState("User A"); // Whose turn
  const [loading, setLoading] = useState(false);     // Waiting for Claude?
  const [error, setError] = useState(null);          // Last error message

  /**
   * Called when a user submits a new statement.
   * Sends it to Claude along with the current map, gets back an updated map.
   */
  const handleSubmit = async (statement) => {
    // Guard: need an API key to call Claude
    if (!apiKey) {
      setError("Please enter your API key first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call Claude to process the statement and update the map
      const updatedMap = await updateArgumentMap(
        apiKey,
        argumentMap,
        currentSpeaker,
        statement
      );

      // Update the map state with Claude's response
      setArgumentMap(updatedMap);

      // Switch turns: User A → User B → User A → ...
      setCurrentSpeaker((prev) =>
        prev === "User A" ? "User B" : "User A"
      );
    } catch (err) {
      console.error("Error calling Claude:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Called when a user vetos (flags) a node.
   * Flags the node and removes its edges.
   */
  const handleVeto = async (nodeId) => {
    setLoading(true);
    setError(null);

    try {
      const updatedMap = await vetoNode(apiKey, argumentMap, nodeId);
      setArgumentMap(updatedMap);
    } catch (err) {
      console.error("Error vetoing node:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      {/* Header with API key input */}
      <header className="app-header">
        <h1>Argument Mapper</h1>
        <ApiKeyInput apiKey={apiKey} onApiKeyChange={setApiKey} />
      </header>

      {/* Main content: graph + sidebar */}
      <main className="app-main">
        {/* The argument map graph takes up most of the screen */}
        <div className="graph-area">
          <ArgumentMap
            nodes={argumentMap.nodes}
            edges={argumentMap.edges}
          />
        </div>

        {/* Sidebar with node list */}
        <aside className="sidebar">
          <NodeList
            nodes={argumentMap.nodes}
            onVeto={handleVeto}
            loading={loading}
          />
        </aside>
      </main>

      {/* Error display */}
      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Statement input at the bottom */}
      <footer className="app-footer">
        <StatementInput
          currentSpeaker={currentSpeaker}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </footer>
    </div>
  );
}
