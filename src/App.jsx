/**
 * App.jsx — Main application component.
 *
 * Manages all state and ties the components together:
 * - API key (entered by user at runtime)
 * - Argument map (nodes + edges, updated by Claude)
 * - Turn tracking (alternates between User A and User B)
 * - Loading state (while waiting for Claude's response)
 */

import { useState, useCallback, useRef } from "react";
import StatementInput from "./components/StatementInput";
import ArgumentMap from "./components/ArgumentMap";
import NodeList from "./components/NodeList";
import { updateArgumentMap, rateNode, sendDirectMessage } from "./utils/claude";
import "./App.css";

// Initial empty map — spec v1.0 wrapper format
const EMPTY_MAP = {
  argument_map: { title: "", description: "", nodes: [], edges: [] },
};

export default function App() {
  // --- State ---
  // API key from .env (VITE_ prefix required by Vite)
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
  const [argumentMap, setArgumentMap] = useState(EMPTY_MAP); // The argument map data
  const [currentSpeaker, setCurrentSpeaker] = useState("User A"); // Whose turn
  const [loading, setLoading] = useState(false);     // Waiting for Claude?
  const [error, setError] = useState(null);          // Last error message
  const [directMode, setDirectMode] = useState(false); // Talk-to-AI mode?
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setSidebarWidth(Math.max(200, Math.min(600, newWidth)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

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
   * Called when a user rates (thumbs up/down) the other user's node.
   */
  const handleRate = (nodeId, rating) => {
    const updatedMap = rateNode(argumentMap, nodeId, rating);
    setArgumentMap(updatedMap);
  };

  /**
   * Called when a user sends a direct message to the AI (correction/instruction).
   * Does not advance the debate turn.
   */
  const handleDirectMessage = async (instruction) => {
    if (!apiKey) {
      setError("Please enter your API key first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const updatedMap = await sendDirectMessage(apiKey, argumentMap, instruction);
      setArgumentMap(updatedMap);
    } catch (err) {
      console.error("Error sending direct message:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Unwrap the inner argument_map for components
  const inner = argumentMap.argument_map;

  // Derive a concise position summary for each speaker from their first claim node
  const getSpeakerSummary = (speaker) => {
    const claim = inner.nodes.find(
      (n) => n.speaker === speaker && n.type === "claim"
    );
    if (!claim) return null;
    const text = claim.content;
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  };
  const speakerSummary = getSpeakerSummary(currentSpeaker);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Argument Mapper</h1>
      </header>

      {/* Main content: graph + sidebar */}
      <main className="app-main">
        {/* The argument map graph takes up most of the screen */}
        <div className="graph-area">
          <ArgumentMap
            nodes={inner.nodes}
            edges={inner.edges}
          />
        </div>

        {/* Resize handle */}
        <div className="sidebar-resize-handle" onMouseDown={handleMouseDown} />

        {/* Sidebar with node list */}
        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <NodeList
            nodes={inner.nodes}
            currentSpeaker={currentSpeaker}
            onRate={handleRate}
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
          speakerSummary={speakerSummary}
          onSubmit={handleSubmit}
          onDirectMessage={handleDirectMessage}
          loading={loading}
          directMode={directMode}
          onToggleMode={() => setDirectMode((prev) => !prev)}
        />
      </footer>
    </div>
  );
}
