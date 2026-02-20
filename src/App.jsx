/**
 * App.jsx — Main application component.
 *
 * Manages all state and ties the components together:
 * - API key (entered by user at runtime)
 * - Argument map (nodes + edges, updated by Claude)
 * - Turn tracking (alternates between User A and User B)
 * - Loading state (while waiting for Claude's response)
 */

import { useState, useCallback, useMemo, useReducer, useRef, useEffect } from "react";
import StatementInput from "./components/StatementInput";
import ArgumentMap from "./components/ArgumentMap";
import NodeList from "./components/NodeList";
import MapTreeView from "./components/MapTreeView";
import NodeDetailPopup from "./components/NodeDetailPopup";
import SettingsPanel from "./components/SettingsPanel";
import { updateArgumentMap, rateNode, chatWithModerator } from "./utils/claude";
import { speakerName, speakerBorder } from "./utils/speakers.js";
import { THEMES, DEFAULT_THEME_KEY } from "./utils/themes.js";
import "./App.css";

// Initial empty map — spec v1.0 wrapper format
const EMPTY_MAP = {
  argument_map: { title: "", description: "", nodes: [], edges: [] },
};

// Normalise AI-generated analysis: negate leaning (AI: negative=Blue, UI: negative=Blue on left)
// and replace any legacy "User A"/"User B" the AI may still emit.
function sanitizeAnalysis(analysis) {
  if (!analysis) return null;
  const fix = (s) => typeof s === "string"
    ? s.replace(/User A/g, "Blue").replace(/User B/g, "Green")
    : s;
  return { ...analysis, leaning: -(analysis.leaning ?? 0), leaning_reason: fix(analysis.leaning_reason), user_a_style: fix(analysis.user_a_style), user_b_style: fix(analysis.user_b_style) };
}

// History reducer — tracks map+analysis snapshots for undo/redo
function historyReducer(state, action) {
  switch (action.type) {
    case "push": {
      const trimmed = state.entries.slice(0, state.index + 1);
      return { entries: [...trimmed, action.entry], index: state.index + 1 };
    }
    case "undo": return state.index > 0 ? { ...state, index: state.index - 1 } : state;
    case "redo": return state.index < state.entries.length - 1 ? { ...state, index: state.index + 1 } : state;
    default: return state;
  }
}

export default function App() {
  // --- State ---
  // API key from .env (VITE_ prefix required by Vite)
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
  const [{ entries: histEntries, index: histIndex }, dispatchHistory] = useReducer(
    historyReducer,
    { entries: [{ map: EMPTY_MAP, analysis: null }], index: 0 }
  );
  const argumentMap = histEntries[histIndex].map;
  const moderatorAnalysis = histEntries[histIndex].analysis;
  const canUndo = histIndex > 0;
  const canRedo = histIndex < histEntries.length - 1;
  const pushHistory = (newMap, newAnalysis) =>
    dispatchHistory({ type: "push", entry: { map: newMap, analysis: newAnalysis } });
  const handleUndo = () => dispatchHistory({ type: "undo" });
  const handleRedo = () => dispatchHistory({ type: "redo" });

  const [currentSpeaker, setCurrentSpeaker] = useState("Blue"); // Whose turn
  const [loading, setLoading] = useState(false);     // Waiting for Claude?
  const [loadingSpeaker, setLoadingSpeaker] = useState(null); // Who submitted the loading request
  const [error, setError] = useState(null);          // Last error message
  const [originalTexts, setOriginalTexts] = useState({}); // { [nodeId]: original statement }
  const [selectedNode, setSelectedNode] = useState(null); // Node shown in detail popup
  const [chatMessages, setChatMessages] = useState([]); // AI moderator chat history
  const [activeTab, setActiveTab] = useState(
    () => window.innerWidth < 640 ? "list" : "map"
  );
  const directMode = activeTab === "chat";

  const [uiVisible, setUiVisible] = useState(true);
  const toggleUI = useCallback(() => setUiVisible((v) => !v), []);

  const [themeKey, setThemeKey] = useState(() => localStorage.getItem("theme") ?? DEFAULT_THEME_KEY);
  const theme = useMemo(() => THEMES[themeKey] ?? THEMES[DEFAULT_THEME_KEY], [themeKey]);
  const handleThemeChange = useCallback((key) => {
    setThemeKey(key);
    localStorage.setItem("theme", key);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-dark", theme.dark ? "true" : "false");
  }, [theme]);

  const [newNodeIds, setNewNodeIds] = useState(() => new Set());
  const newNodeTimerRef = useRef(null);

  const chatLogRef = useRef(null);
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

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
        const ids = new Set(newNodes.map((n) => n.id));
        setNewNodeIds(ids);
        clearTimeout(newNodeTimerRef.current);
        newNodeTimerRef.current = setTimeout(() => setNewNodeIds(new Set()), 3500);
      }

      // Push to history (enables undo/redo)
      pushHistory(updatedMap, sanitizeAnalysis(updatedMap.moderator_analysis || null));

      // Switch turns: User A → User B → User A → ...
      setCurrentSpeaker((prev) =>
        prev === "Blue" ? "Green" : "Blue"
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
    pushHistory({ argument_map: { ...inner, nodes: updatedNodes } }, moderatorAnalysis);
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

    const userMsg = { role: "user", content: message, speaker: currentSpeaker };
    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);

    setLoading(true);
    setError(null);

    try {
      const { reply, updatedMap } = await chatWithModerator(apiKey, argumentMap, updatedHistory);
      const assistantMsg = { role: "assistant", content: reply, mapUpdated: !!updatedMap };
      setChatMessages((prev) => [...prev, assistantMsg]);
      if (updatedMap) {
        const oldIds = new Set(argumentMap.argument_map.nodes.map((n) => n.id));
        const chatNewNodes = updatedMap.argument_map.nodes.filter((n) => !oldIds.has(n.id));
        if (chatNewNodes.length > 0) {
          const ids = new Set(chatNewNodes.map((n) => n.id));
          setNewNodeIds(ids);
          clearTimeout(newNodeTimerRef.current);
          newNodeTimerRef.current = setTimeout(() => setNewNodeIds(new Set()), 3500);
        }
        pushHistory(updatedMap, moderatorAnalysis);
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

  // Compute faded/colored node sets for visual invalidation:
  // - fadedNodeIds: opacity-faded due to thumbs-up (agreement) or thumbs-down (retraction)
  // - contradictionFadedIds: light-red background (contradiction-affected)
  // - walkbackFadedIds: light-orange background (goalpost-moving-affected)
  // - contradictionBorderIds: thick red border (the two contradicting nodes)
  // - walkbackBorderIds: thick orange border (the two walkback nodes)
  const fadedInfo = useMemo(() => {
    // Build predecessor map: targetId → Set of sourceIds
    const predecessorMap = new Map();
    for (const edge of inner.edges) {
      if (!predecessorMap.has(edge.to)) predecessorMap.set(edge.to, new Set());
      predecessorMap.get(edge.to).add(edge.from);
    }

    function bfsBack(startIds) {
      const visited = new Set(startIds);
      const queue = [...startIds];
      while (queue.length > 0) {
        const current = queue.shift();
        for (const predId of predecessorMap.get(current) || []) {
          if (!visited.has(predId)) {
            visited.add(predId);
            queue.push(predId);
          }
        }
      }
      return visited;
    }

    // Thumbs-up/down opacity fading (agreement + retraction)
    const agreedIds = inner.nodes.filter((n) => n.rating === "up").map((n) => n.id);
    const downIds = inner.nodes.filter((n) => n.rating === "down").map((n) => n.id);
    const fadedNodeIds = new Set([...bfsBack(agreedIds), ...bfsBack(downIds)]);

    // Contradiction borders: both the flagging node AND the node being contradicted
    const contradictionBorderIds = new Set();
    const walkbackBorderIds = new Set();
    for (const node of inner.nodes) {
      if (node.metadata?.contradicts) {
        contradictionBorderIds.add(node.id);
        contradictionBorderIds.add(node.metadata.contradicts);
      }
      if (node.metadata?.moves_goalposts_from) {
        walkbackBorderIds.add(node.id);
        walkbackBorderIds.add(node.metadata.moves_goalposts_from);
      }
    }

    // Contradiction colored backgrounds: contradicted node + predecessors + all border nodes
    const contradictionTargetIds = inner.nodes
      .filter((n) => n.metadata?.contradicts)
      .map((n) => n.metadata.contradicts);
    const contradictionFadedIds = bfsBack(contradictionTargetIds);
    for (const id of contradictionBorderIds) contradictionFadedIds.add(id);

    // Walkback colored backgrounds: walked-back node + predecessors + all border nodes
    const walkbackTargetIds = inner.nodes
      .filter((n) => n.metadata?.moves_goalposts_from)
      .map((n) => n.metadata.moves_goalposts_from);
    const walkbackFadedIds = bfsBack(walkbackTargetIds);
    for (const id of walkbackBorderIds) walkbackFadedIds.add(id);

    return { fadedNodeIds, contradictionFadedIds, walkbackFadedIds, contradictionBorderIds, walkbackBorderIds };
  }, [inner.nodes, inner.edges]);

  // Compute invalidation-adjusted moderator analysis.
  // Accounts for all forms of argument invalidation: thumbs-up/down, contradictions,
  // and goalpost-moving.
  const effectiveAnalysis = useMemo(() => {
    if (!moderatorAnalysis) return null;

    const { fadedNodeIds, contradictionFadedIds, walkbackFadedIds } = fadedInfo;
    const allInactiveIds = new Set([...fadedNodeIds, ...contradictionFadedIds, ...walkbackFadedIds]);

    // Collect agreed-upon nodes for display
    const agreements = [];
    for (const node of inner.nodes) {
      if (node.rating !== "up") continue;
      agreements.push({
        nodeId: node.id,
        nodeSpeaker: node.speaker,
        content: node.content,
        agreedBy: node.metadata?.agreed_by?.speaker || null,
      });
    }

    // For each speaker, compute what fraction of their nodes are still active (not invalidated).
    const totalA = inner.nodes.filter((n) => n.speaker === "Blue").length;
    const totalB = inner.nodes.filter((n) => n.speaker === "Green").length;
    const activeA = inner.nodes.filter((n) => n.speaker === "Blue" && !allInactiveIds.has(n.id)).length;
    const activeB = inner.nodes.filter((n) => n.speaker === "Green" && !allInactiveIds.has(n.id)).length;

    const effectivenessA = totalA > 0 ? activeA / totalA : 1;
    const effectivenessB = totalB > 0 ? activeB / totalB : 1;

    // Positive adjustment favours B; negative favours A.
    const adjustment = (effectivenessB - effectivenessA) * 0.7;
    const adjustedLeaning = Math.max(-1, Math.min(1, moderatorAnalysis.leaning + adjustment));

    return {
      ...moderatorAnalysis,
      leaning: adjustedLeaning,
      agreements,
    };
  }, [moderatorAnalysis, inner.nodes, fadedInfo]);

  // Derive a concise position summary for each speaker from their first claim node
  const getSpeakerSummary = (speaker) => {
    const node = inner.nodes.find((n) => n.speaker === speaker && n.type === "claim")
      ?? inner.nodes.find((n) => n.speaker === speaker);
    if (!node) return null;
    const text = node.content;
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  };
  const speakerSummary = getSpeakerSummary(currentSpeaker);

  return (
    <div className="app">
      {/* Fixed top bar: title + tabs slide together */}
      <div className={`app-top${uiVisible ? "" : " app-top--hidden"}`}>
        <header className="app-header">
          <h1>Argument Mapper</h1>
          <SettingsPanel currentThemeKey={themeKey} onThemeChange={handleThemeChange} />
        </header>
        <nav className="tab-bar">
        <button
          className={`tab-btn${activeTab === "map" ? " tab-btn--active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          Map
        </button>
        <button
          className={`tab-btn${activeTab === "list" ? " tab-btn--active" : ""}`}
          onClick={() => setActiveTab("list")}
        >
          List
        </button>
        <button
          className={`tab-btn${activeTab === "chat" ? " tab-btn--active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        {effectiveAnalysis && (() => {
          const gaugePct = ((effectiveAnalysis.leaning + 1) / 2) * 100;
          const gaugeColor = effectiveAnalysis.leaning < -0.1 ? theme.a.bg : effectiveAnalysis.leaning > 0.1 ? theme.b.bg : "#1e293b";
          return (
            <button
              className={`tab-btn tab-gauge-btn${activeTab === "moderator" ? " tab-btn--active" : ""}`}
              onClick={() => setActiveTab("moderator")}
              title="AI Moderator Analysis"
            >
              <span className="tab-gauge-label-a" style={{ color: theme.a.bg }}>{theme.a.name}</span>
              <span className="tab-gauge-inline-track">
                <span className="tab-gauge-inline-marker" style={{ left: `${gaugePct}%`, backgroundColor: gaugeColor }} />
              </span>
              <span className="tab-gauge-label-b" style={{ color: theme.b.bg }}>{theme.b.name}</span>
            </button>
          );
        })()}
        </nav>
      </div>
      {/* In-flow spacer keeps content below the fixed top bar */}
      <div className="app-top-spacer" aria-hidden="true" />

      {/* Main content: one tab at a time */}
      <main className="app-main">
        {/* Always mounted so Cytoscape preserves zoom/pan across tab switches.
            Hidden via inline style when another tab is active. */}
        <div className="graph-area" style={activeTab !== "map" ? { display: "none" } : undefined}>
          <ArgumentMap
            key={themeKey}
            nodes={inner.nodes}
            edges={inner.edges}
            onNodeClick={handleNodeClick}
            fadedNodeIds={fadedInfo.fadedNodeIds}
            contradictionFadedIds={fadedInfo.contradictionFadedIds}
            walkbackFadedIds={fadedInfo.walkbackFadedIds}
            contradictionBorderIds={fadedInfo.contradictionBorderIds}
            walkbackBorderIds={fadedInfo.walkbackBorderIds}
            newNodeIds={newNodeIds}
            onToggleUI={toggleUI}
            theme={theme}
          />
        </div>

        {activeTab === "list" && (
          <div className="list-area" onClick={(e) => { if (e.target === e.currentTarget) toggleUI(); }}>
            <MapTreeView
              nodes={inner.nodes}
              edges={inner.edges}
              currentSpeaker={currentSpeaker}
              onRate={handleRate}
              onNodeClick={handleNodeClick}
              loading={loading}
              fadedNodeIds={fadedInfo.fadedNodeIds}
              contradictionFadedIds={fadedInfo.contradictionFadedIds}
              walkbackFadedIds={fadedInfo.walkbackFadedIds}
              contradictionBorderIds={fadedInfo.contradictionBorderIds}
              walkbackBorderIds={fadedInfo.walkbackBorderIds}
              newNodeIds={newNodeIds}
              theme={theme}
            />
          </div>
        )}

        {activeTab === "chat" && (
          <div className="chat-area">
            {chatMessages.length === 0 ? (
              <p className="empty-message">Ask the AI moderator anything about the argument map.</p>
            ) : (
              <div className="chat-log" ref={chatLogRef}>
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`chat-message ${msg.role}`}>
                    <div
                      className="chat-bubble"
                      style={msg.role === "user"
                        ? { backgroundColor: speakerBorder(msg.speaker, theme) }
                        : undefined}
                    >{msg.content}</div>
                    {msg.mapUpdated && <div className="chat-map-updated">Map updated</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "moderator" && (() => {
          if (!effectiveAnalysis) {
            return <p className="empty-message">No moderator analysis yet. Submit some arguments first.</p>;
          }
          const pct = ((effectiveAnalysis.leaning + 1) / 2) * 100;
          const markerColor = effectiveAnalysis.leaning < -0.1 ? theme.a.bg : effectiveAnalysis.leaning > 0.1 ? theme.b.bg : "#1e293b";
          const leaningLabel = effectiveAnalysis.leaning < -0.1 ? `Leaning ${theme.a.name}` : effectiveAnalysis.leaning > 0.1 ? `Leaning ${theme.b.name}` : "Balanced";
          // Replace internal speaker IDs in AI-generated prose with theme display names
          const fixNames = (s) => typeof s === "string"
            ? s.replace(/\bBlue\b/g, theme.a.name).replace(/\bGreen\b/g, theme.b.name)
            : s;
          return (
            <div className="moderator-tab-content">
              <div className="popup-section">
                <h4>Debate Leaning</h4>
                <div className="gauge-popup-track-wrapper">
                  <div className="gauge-labels">
                    <span className="gauge-label-a" style={{ color: theme.a.bg }}>{theme.a.name}</span>
                    <span className="gauge-label-b" style={{ color: theme.b.bg }}>{theme.b.name}</span>
                  </div>
                  <div className="gauge-track gauge-track-large">
                    <div className="gauge-marker gauge-marker-large" style={{ left: `${pct}%`, backgroundColor: markerColor }} />
                  </div>
                  <div className="gauge-leaning-label" style={{ color: markerColor }}>
                    {leaningLabel} ({effectiveAnalysis.leaning > 0 ? "+" : ""}{effectiveAnalysis.leaning.toFixed(2)})
                  </div>
                </div>
                <p className="popup-summary" style={{ marginTop: "0.75rem" }}>{fixNames(effectiveAnalysis.leaning_reason)}</p>
              </div>
              <div className="popup-section">
                <h4>{theme.a.name}'s Argumentative Style</h4>
                <p className="popup-summary" style={{ borderLeft: `3px solid ${theme.a.bg}`, paddingLeft: "0.75rem" }}>{fixNames(effectiveAnalysis.user_a_style)}</p>
              </div>
              <div className="popup-section">
                <h4>{theme.b.name}'s Argumentative Style</h4>
                <p className="popup-summary" style={{ borderLeft: `3px solid ${theme.b.bg}`, paddingLeft: "0.75rem" }}>{fixNames(effectiveAnalysis.user_b_style)}</p>
              </div>
              {effectiveAnalysis.agreements?.length > 0 && (
                <div className="popup-section">
                  <h4>Points of Agreement</h4>
                  <ul className="gauge-agreements-list">
                    {effectiveAnalysis.agreements.map((a) => (
                      <li key={a.nodeId} className="gauge-agreement-item">
                        <span className="speaker-badge" style={{ backgroundColor: speakerBorder(a.nodeSpeaker, theme) }}>{speakerName(a.nodeSpeaker, theme)}</span>
                        <span className="gauge-agreement-content">{a.content}</span>
                        {a.agreedBy && <span className="gauge-agreed-by">— agreed by {speakerName(a.agreedBy, theme)}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="gauge-agreement-note">Each agreement shifts the gauge by 0.1 toward the agreed-upon speaker.</p>
                </div>
              )}
            </div>
          );
        })()}
      </main>

      {/* Error display */}
      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Node detail popup */}
      {selectedNode && (() => {
        const liveNode = inner.nodes.find((n) => n.id === selectedNode.id) || selectedNode;
        return (
          <NodeDetailPopup
            node={liveNode}
            originalText={originalTexts[liveNode.id]}
            onClose={() => setSelectedNode(null)}
            fadedNodeIds={fadedInfo.fadedNodeIds}
            nodes={inner.nodes}
            onNodeClick={handleNodeClick}
            onRate={handleRate}
            currentSpeaker={currentSpeaker}
            loading={loading}
            theme={theme}
          />
        );
      })()}

      {/* Statement input at the bottom — hidden on moderator tab */}
      {activeTab !== "moderator" && (
        <footer className={`app-footer${uiVisible ? "" : " app-footer--hidden"}`}>
          <StatementInput
            currentSpeaker={currentSpeaker}
            speakerSummary={speakerSummary}
            onSubmit={handleSubmit}
            onChatMessage={handleChatMessage}
            loading={loading}
            loadingSpeaker={loadingSpeaker}
            directMode={directMode}
            onSkipTurn={() => setCurrentSpeaker((prev) => prev === "Blue" ? "Green" : "Blue")}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            theme={theme}
          />
        </footer>
      )}
    </div>
  );
}
