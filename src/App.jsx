/**
 * App.jsx — Main application component.
 *
 * Manages all state and ties the components together:
 * - API key (entered by user at runtime)
 * - Argument map (nodes + edges, updated by Claude)
 * - Turn tracking (alternates between User A and User B)
 * - Loading state (while waiting for Claude's response)
 */

import { useState, useCallback, useRef, useMemo } from "react";
import StatementInput from "./components/StatementInput";
import ArgumentMap from "./components/ArgumentMap";
import NodeList from "./components/NodeList";
import NodeDetailPopup from "./components/NodeDetailPopup";
import ModeratorGauge from "./components/ModeratorGauge";
import ModeratorGaugePopup from "./components/ModeratorGaugePopup";
import { updateArgumentMap, rateNode, chatWithModerator } from "./utils/claude";
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
  const [loadingSpeaker, setLoadingSpeaker] = useState(null); // Who submitted the loading request
  const [error, setError] = useState(null);          // Last error message
  const [directMode, setDirectMode] = useState(false); // Talk-to-AI mode?
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [originalTexts, setOriginalTexts] = useState({}); // { [nodeId]: original statement }
  const [selectedNode, setSelectedNode] = useState(null); // Node shown in detail popup
  const [chatMessages, setChatMessages] = useState([]); // AI moderator chat history
  const [moderatorAnalysis, setModeratorAnalysis] = useState(null);
  const [showGaugePopup, setShowGaugePopup] = useState(false);
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
    setLoadingSpeaker(currentSpeaker);
    setError(null);

    try {
      // Call Claude to process the statement and update the map
      const updatedMap = await updateArgumentMap(
        apiKey,
        argumentMap,
        currentSpeaker,
        statement
      );

      // Track original text for newly created nodes
      const oldIds = new Set(argumentMap.argument_map.nodes.map((n) => n.id));
      const newNodes = updatedMap.argument_map.nodes.filter((n) => !oldIds.has(n.id));
      if (newNodes.length > 0) {
        setOriginalTexts((prev) => {
          const next = { ...prev };
          for (const n of newNodes) {
            next[n.id] = statement;
          }
          return next;
        });
      }

      // Update the map state with Claude's response
      setArgumentMap(updatedMap);
      setModeratorAnalysis(updatedMap.moderator_analysis || null);

      // Switch turns: User A → User B → User A → ...
      setCurrentSpeaker((prev) =>
        prev === "User A" ? "User B" : "User A"
      );
    } catch (err) {
      console.error("Error calling Claude:", err);
      setError(err.message);
      throw err; // Re-throw so StatementInput knows submission failed
    } finally {
      setLoading(false);
      setLoadingSpeaker(null);
    }
  };

  /**
   * Called when a user rates (thumbs up/down) the other user's node.
   */
  const handleRate = (nodeId, rating) => {
    const updatedMap = rateNode(argumentMap, nodeId, rating);
    // Add/remove agreed_by metadata for manual thumbs-up
    const inner = updatedMap.argument_map;
    const updatedNodes = inner.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      if (node.rating === "up") {
        // Setting thumbs-up: add agreed_by with current speaker (no text for manual)
        return {
          ...node,
          metadata: {
            ...node.metadata,
            agreed_by: { speaker: currentSpeaker },
          },
        };
      } else {
        // Toggling off: remove agreed_by
        const { agreed_by, ...restMetadata } = node.metadata || {};
        return { ...node, metadata: restMetadata };
      }
    });
    setArgumentMap({
      argument_map: { ...inner, nodes: updatedNodes },
    });
  };

  /**
   * Called when a user sends a chat message to the AI moderator.
   * Maintains conversation history and optionally updates the map.
   */
  const handleChatMessage = async (message) => {
    if (!apiKey) {
      setError("Please enter your API key first.");
      return;
    }

    const userMsg = { role: "user", content: message };
    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);

    setLoading(true);
    setError(null);

    try {
      const { reply, updatedMap } = await chatWithModerator(apiKey, argumentMap, updatedHistory);
      const assistantMsg = { role: "assistant", content: reply, mapUpdated: !!updatedMap };
      setChatMessages((prev) => [...prev, assistantMsg]);
      if (updatedMap) {
        setArgumentMap(updatedMap);
      }
    } catch (err) {
      console.error("Error chatting with moderator:", err);
      setError(err.message);
      // Remove the optimistically-added user message on failure
      setChatMessages(chatMessages);
      throw err; // Re-throw so StatementInput knows submission failed
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  // Unwrap the inner argument_map for components
  const inner = argumentMap.argument_map;

  // Compute faded node IDs: agreed nodes + all their supporting predecessors
  const fadedNodeIds = useMemo(() => {
    const faded = new Set();
    const agreedIds = new Set(
      inner.nodes.filter((n) => n.rating === "up").map((n) => n.id)
    );
    if (agreedIds.size === 0) return faded;

    // Build adjacency: for each edge from→to, "from" supports "to",
    // so "from" is a predecessor of "to"
    const predecessorMap = new Map(); // targetId → Set of sourceIds
    for (const edge of inner.edges) {
      if (!predecessorMap.has(edge.to)) predecessorMap.set(edge.to, new Set());
      predecessorMap.get(edge.to).add(edge.from);
    }

    // BFS from agreed nodes, collecting predecessors
    const queue = [...agreedIds];
    for (const id of agreedIds) faded.add(id);
    while (queue.length > 0) {
      const current = queue.shift();
      const preds = predecessorMap.get(current);
      if (preds) {
        for (const predId of preds) {
          if (!faded.has(predId)) {
            faded.add(predId);
            queue.push(predId);
          }
        }
      }
    }
    return faded;
  }, [inner.nodes, inner.edges]);

  // Compute agreement-adjusted moderator analysis
  const effectiveAnalysis = useMemo(() => {
    if (!moderatorAnalysis) return null;

    // Collect agreed-upon nodes and compute leaning adjustment
    const agreements = [];
    let adjustment = 0;
    for (const node of inner.nodes) {
      if (node.rating !== "up") continue;
      agreements.push({
        nodeId: node.id,
        nodeSpeaker: node.speaker,
        content: node.content,
        agreedBy: node.metadata?.agreed_by?.speaker || null,
      });
      // Agreement with User A's node strengthens A → shift negative
      // Agreement with User B's node strengthens B → shift positive
      if (node.speaker === "User A") adjustment -= 0.1;
      if (node.speaker === "User B") adjustment += 0.1;
    }

    const adjustedLeaning = Math.max(-1, Math.min(1, moderatorAnalysis.leaning + adjustment));

    return {
      ...moderatorAnalysis,
      leaning: adjustedLeaning,
      agreements,
    };
  }, [moderatorAnalysis, inner.nodes]);

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
            onNodeClick={handleNodeClick}
          />
          <ModeratorGauge
            analysis={effectiveAnalysis}
            onShowDetail={() => setShowGaugePopup(true)}
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
            onNodeClick={handleNodeClick}
            loading={loading}
            fadedNodeIds={fadedNodeIds}
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

      {/* Node detail popup */}
      {selectedNode && (
        <NodeDetailPopup
          node={selectedNode}
          originalText={originalTexts[selectedNode.id]}
          onClose={() => setSelectedNode(null)}
          fadedNodeIds={fadedNodeIds}
        />
      )}

      {/* Moderator gauge popup */}
      {showGaugePopup && effectiveAnalysis && (
        <ModeratorGaugePopup
          analysis={effectiveAnalysis}
          onClose={() => setShowGaugePopup(false)}
        />
      )}

      {/* Statement input at the bottom */}
      <footer className="app-footer">
        <StatementInput
          currentSpeaker={currentSpeaker}
          speakerSummary={speakerSummary}
          onSubmit={handleSubmit}
          onChatMessage={handleChatMessage}
          loading={loading}
          loadingSpeaker={loadingSpeaker}
          directMode={directMode}
          onToggleMode={() => setDirectMode((prev) => !prev)}
          chatMessages={chatMessages}
        />
      </footer>
    </div>
  );
}
