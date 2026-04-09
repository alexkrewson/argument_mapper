/**
 * App.jsx — Main application component.
 *
 * Manages all state and ties the components together:
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
import ConcessionConfirmModal from "./components/ConcessionConfirmModal";
import AIChangeLogModal from "./components/AIChangeLogModal";
import AuthModal from "./components/AuthModal";
import DebateHistory from "./components/DebateHistory";
import AboutTab from "./components/AboutTab";
import { updateArgumentMap, rateNode, chatWithModerator, parseConversation } from "./utils/claude";
import { TACTICS } from "./utils/tactics.js";
import { computeScores, computeScoreDelta, POINTS } from "./utils/scoring.js";
import { playHappy, playSad, playBigWin } from "./utils/sounds.js";
import { speakerName, speakerBorder } from "./utils/speakers.js";
import { fmtNodeId } from "./utils/format.js";
import { THEMES, DEFAULT_THEME_KEY } from "./utils/themes.js";
import { randomName } from "./utils/names.js";
import { supabase } from "./utils/supabase";
import { useAuth } from "./hooks/useAuth";
import "./App.css";

// Initial empty map — spec v1.0 wrapper format
const EMPTY_MAP = {
  argument_map: { title: "", description: "", nodes: [], edges: [] },
};

// Compute a diff between two maps: what nodes/edges the AI added, modified, or removed.
function computeMapDiff(oldInner, newInner) {
  const changes = [];
  const oldNodeMap = new Map(oldInner.nodes.map((n) => [n.id, n]));
  const newNodeMap = new Map(newInner.nodes.map((n) => [n.id, n]));
  for (const n of newInner.nodes) {
    if (!oldNodeMap.has(n.id)) {
      changes.push({ type: "added", nodeId: n.id, nodeType: n.type, content: n.content, speaker: n.speaker });
    } else {
      const old = oldNodeMap.get(n.id);
      if (old.content !== n.content) {
        changes.push({ type: "modified", nodeId: n.id, nodeType: n.type, before: old.content, after: n.content });
      }
      // Contradiction flag changes
      const oldContradicts = old.metadata?.contradicts ?? null;
      const newContradicts = n.metadata?.contradicts ?? null;
      if (newContradicts && newContradicts !== oldContradicts) {
        changes.push({ type: "contradicts_set", nodeId: n.id, targetId: newContradicts });
      } else if (!newContradicts && oldContradicts) {
        changes.push({ type: "contradicts_cleared", nodeId: n.id, targetId: oldContradicts });
      }
      // Goalpost-moving flag changes
      const oldGoalposts = old.metadata?.moves_goalposts_from ?? null;
      const newGoalposts = n.metadata?.moves_goalposts_from ?? null;
      if (newGoalposts && newGoalposts !== oldGoalposts) {
        changes.push({ type: "goalposts_set", nodeId: n.id, targetId: newGoalposts });
      } else if (!newGoalposts && oldGoalposts) {
        changes.push({ type: "goalposts_cleared", nodeId: n.id, targetId: oldGoalposts });
      }
    }
  }
  for (const n of oldInner.nodes) {
    if (!newNodeMap.has(n.id)) {
      changes.push({ type: "removed", nodeId: n.id, nodeType: n.type, content: n.content });
    }
  }
  const oldEdgeIds = new Set(oldInner.edges.map((e) => e.id));
  for (const e of newInner.edges) {
    if (!oldEdgeIds.has(e.id)) {
      changes.push({ type: "edge_added", from: e.from, to: e.to, relationship: e.relationship });
    }
  }
  return changes;
}

// Returns all nodes that have no incoming edges (roots of the tree).
function findRootNodes(nodes, edges) {
  // Root = a node that never supports another node (never appears as edge.from).
  // These are the top-level claims sitting at the top of the hierarchy.
  const hasOutgoing = new Set(edges.map((e) => e.from));
  return nodes.filter((n) => !hasOutgoing.has(n.id));
}

// When a node is conceded/agreed, BFS its supporting subtree and clear any
// contradiction or goalpost-moving flags it or its predecessors are the *source* of.
// (Both nodes in a flag pair derive the badge from the source's metadata field,
// so clearing the source is enough to remove the badge from both.)
function clearConflictFlagsForFadedSubtree(nodes, edges, fadedRootId) {
  const predecessorMap = new Map();
  for (const edge of edges) {
    if (!predecessorMap.has(edge.to)) predecessorMap.set(edge.to, new Set());
    predecessorMap.get(edge.to).add(edge.from);
  }
  const faded = new Set([fadedRootId]);
  const queue = [fadedRootId];
  while (queue.length) {
    const id = queue.shift();
    for (const predId of predecessorMap.get(id) || []) {
      if (!faded.has(predId)) { faded.add(predId); queue.push(predId); }
    }
  }
  return nodes.map((node) => {
    if (!faded.has(node.id)) return node;
    if (!node.metadata?.contradicts && !node.metadata?.moves_goalposts_from) return node;
    const { contradicts, moves_goalposts_from, ...restMeta } = node.metadata;
    return { ...node, metadata: restMeta };
  });
}

// Replace internal "Blue"/"Green" speaker names in node content with theme display names.
function sanitizeNodeContent(map, theme) {
  const inner = map.argument_map;
  const a = theme.a.name, b = theme.b.name;
  const fix = (s) => typeof s === "string"
    ? s.replace(/\bBlue\b/g, a).replace(/\bGreen\b/g, b)
    : s;
  return {
    ...map,
    argument_map: {
      ...inner,
      nodes: inner.nodes.map((n) => ({ ...n, content: fix(n.content) })),
    },
  };
}

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
    case "load": return { entries: [action.entry], index: 0 };
    default: return state;
  }
}

export default function App() {
  // --- State ---
  const { user } = useAuth();
  const [{ entries: histEntries, index: histIndex }, dispatchHistory] = useReducer(
    historyReducer,
    { entries: [{ map: EMPTY_MAP, analysis: null }], index: 0 }
  );
  const argumentMap = histEntries[histIndex].map;
  const inner = argumentMap.argument_map;
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
  const [activeTab, setActiveTab] = useState("map");
  const directMode = activeTab === "moderator";

  const [uiVisible, setUiVisible] = useState(true);
  const toggleUI = useCallback(() => setUiVisible((v) => !v), []);

  const [themeKey, setThemeKey] = useState(() => localStorage.getItem("theme") ?? DEFAULT_THEME_KEY);
  const theme = useMemo(() => THEMES[themeKey] ?? THEMES[DEFAULT_THEME_KEY], [themeKey]);

  const [playerNames, setPlayerNames] = useState(() => {
    const a = randomName();
    return { a, b: randomName(a) };
  });
  const [hasSubmitted, setHasSubmitted] = useState({ a: false, b: false });

  // resolvedTheme: same as theme but with player-chosen names overriding the defaults
  const resolvedTheme = useMemo(() => ({
    ...theme,
    a: { ...theme.a, name: playerNames.a || theme.a.name },
    b: { ...theme.b, name: playerNames.b || theme.b.name },
  }), [theme, playerNames]);

  const handleThemeChange = useCallback((key) => {
    setThemeKey(key);
    localStorage.setItem("theme", key);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-dark",  theme.dark  ? "true" : "false");
    document.documentElement.setAttribute("data-lcars", theme.lcars ? "true" : "false");
  }, [theme]);

  const [newNodeIds, setNewNodeIds] = useState(() => new Set());
  const newNodeTimerRef = useRef(null);
  const [concessionQueue, setConcessionQueue] = useState([]); // Detected concessions awaiting user confirmation
  const [addNodeOpen, setAddNodeOpen] = useState(false); // Whether the "Add Node" create modal is open
  const [aiChangeLog, setAiChangeLog] = useState([]); // Log of all AI-made changes
  const [showChangeLog, setShowChangeLog] = useState(false); // Whether the changelog modal is open
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [saveNudgeDismissed, setSaveNudgeDismissed] = useState(false);
  const [inputMode, setInputMode] = useState("turns"); // "turns" | "combined"
  const [combiningProgress, setCombiningProgress] = useState(null); // { current, total } | null
  const [gameMode, setGameMode] = useState(() => localStorage.getItem("gameMode") === "true");
  const [gameToast, setGameToast] = useState(null); // { speaker, delta, key } | null
  const gameToastTimerRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState(null); // null | "saving" | "saved"
  const currentDebateIdRef = useRef(null); // Supabase row id of current debate (ref avoids stale closure)
  const skipNextSaveRef = useRef(false);   // Set true after loading a debate to skip the immediate re-save

  const chatLogRef = useRef(null);
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Warn before closing if user is not signed in and has unsaved nodes
  useEffect(() => {
    if (user || inner.nodes.length === 0) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [user, inner.nodes.length]);

  // Auto-save: fires 1.5s after any map change, if user is logged in and map has nodes
  useEffect(() => {
    if (!user || inner.nodes.length === 0) return;
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    const entry = histEntries[histIndex];
    const autoTitle = inner.title ||
      inner.nodes.find((n) => n.type === "claim")?.content?.slice(0, 60) ||
      `Debate — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const row = { title: autoTitle, map_data: entry, theme_key: themeKey, speaker_a: resolvedTheme.a.name, speaker_b: resolvedTheme.b.name, user_id: user.id };
        if (currentDebateIdRef.current) {
          const { error } = await supabase.from("debates").update(row).eq("id", currentDebateIdRef.current);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from("debates").insert(row).select().single();
          if (error) throw error;
          currentDebateIdRef.current = data.id;
        }
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSaveStatus(null);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [histEntries, histIndex, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadDebate = (debate) => {
    skipNextSaveRef.current = true;
    dispatchHistory({ type: "load", entry: debate.map_data });
    currentDebateIdRef.current = debate.id;
    if (debate.theme_key) handleThemeChange(debate.theme_key);
    if (debate.speaker_a || debate.speaker_b) {
      setPlayerNames((prev) => ({
        a: debate.speaker_a || prev.a,
        b: debate.speaker_b || prev.b,
      }));
      setHasSubmitted({ a: true, b: true });
    }
    setAiChangeLog([]);
    setChatMessages([]);
    setOriginalTexts({});
    setActiveTab("map");
  };

  const handleNewDebate = () => {
    dispatchHistory({ type: "load", entry: { map: EMPTY_MAP, analysis: null } });
    currentDebateIdRef.current = null;
    const a = randomName();
    setPlayerNames({ a, b: randomName(a) });
    setHasSubmitted({ a: false, b: false });
    setCurrentSpeaker("Blue");
    setChatMessages([]);
    setAiChangeLog([]);
    setOriginalTexts({});
    setSelectedNode(null);
    setActiveTab("map");
  };

  // Current scores derived from the live map
  const scores = useMemo(() => computeScores(inner.nodes), [inner.nodes]);

  const handleGameModeChange = useCallback((val) => {
    setGameMode(val);
    localStorage.setItem("gameMode", val ? "true" : "false");
  }, []);

  const triggerGameFeedback = useCallback((nodesBefore, nodesAfter, speaker) => {
    if (!gameMode) return;
    const delta = computeScoreDelta(nodesBefore, nodesAfter);
    const d = delta[speaker] ?? 0;
    if (d === 0) return;
    clearTimeout(gameToastTimerRef.current);
    setGameToast({ speaker, delta: d, key: Date.now() });
    if (d >= 18) playBigWin();       // self-retraction or huge gain
    else if (d > 0) playHappy();
    else playSad();
    gameToastTimerRef.current = setTimeout(() => setGameToast(null), 2400);
  }, [gameMode]);

  /**
   * Called when a user submits a new statement.
   * Sends it to Claude along with the current map, gets back an updated map.
   */
  const handleSubmit = async (statement) => {
    setLoading(true);
    setLoadingSpeaker(currentSpeaker);
    setError(null);
    const nodesBefore = inner.nodes;        // capture before async work
    const submittingSpeaker = currentSpeaker;

    try {
      // Call Claude to process the statement and update the map
      const updatedMap = await updateArgumentMap(
        argumentMap,
        currentSpeaker,
        statement,
        { a: resolvedTheme.a.name, b: resolvedTheme.b.name }
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

      // Intercept newly auto-set ratings from Claude — strip them from the
      // saved map and queue them as confirmation dialogs instead.
      // "up" on other speaker's node = agreement; "down" on own node = self-retraction.
      const oldNodeRatings = new Map(argumentMap.argument_map.nodes.map((n) => [n.id, n.rating]));
      const detected = [];
      const strippedNodes = updatedMap.argument_map.nodes.map((n) => {
        if (n.rating === "up" && oldNodeRatings.get(n.id) !== "up") {
          detected.push({
            type: "other",
            nodeId: n.id,
            content: n.content,
            nodeSpeaker: n.speaker,
            concedingBy: currentSpeaker,
            agreedByText: n.metadata?.agreed_by?.text || null,
          });
          const { agreed_by, ...restMeta } = n.metadata || {};
          return { ...n, rating: null, metadata: restMeta };
        }
        if (n.rating === "down" && oldNodeRatings.get(n.id) !== "down" && n.speaker === currentSpeaker) {
          detected.push({
            type: "self",
            nodeId: n.id,
            content: n.content,
            nodeSpeaker: n.speaker,
            concedingBy: currentSpeaker,
            agreedByText: n.metadata?.conceded_by?.text || null,
          });
          const { conceded_by, ...restMeta } = n.metadata || {};
          return { ...n, rating: null, metadata: restMeta };
        }
        return n;
      });

      const strippedMap = { ...updatedMap, argument_map: { ...updatedMap.argument_map, nodes: strippedNodes } };
      const cleanMap = sanitizeNodeContent(strippedMap, resolvedTheme);

      // Log what the AI changed in this turn (including any detected concessions)
      const aiChanges = computeMapDiff(argumentMap.argument_map, cleanMap.argument_map);
      for (const c of detected) {
        aiChanges.push({
          type: c.type === "self" ? "concession_self" : "concession_other",
          nodeId: c.nodeId,
          nodeSpeaker: c.nodeSpeaker,
          concedingBy: c.concedingBy,
        });
      }
      if (aiChanges.length > 0) {
        setAiChangeLog((prev) => [...prev, {
          id: Date.now(),
          speaker: currentSpeaker,
          statement,
          changes: aiChanges,
        }]);
      }

      // Guard: detect multiple root nodes (nodes with no incoming edges).
      // The map must always have exactly one root. If Claude accidentally created
      // a second disconnected root, warn the user — they can undo and rephrase.
      if (argumentMap.argument_map.nodes.length > 0) {
        const roots = findRootNodes(cleanMap.argument_map.nodes, cleanMap.argument_map.edges)
          .filter((n) => !n.metadata?.non_sequitur);
        if (roots.length > 1) {
          setError(
            `Warning: Claude created ${roots.length} disconnected root nodes (${roots.map((r) => fmtNodeId(r.id)).join(", ")}). ` +
            `The map should have exactly one root. Consider undoing this turn and rephrasing.`
          );
        }
      }

      pushHistory(cleanMap, sanitizeAnalysis(updatedMap.moderator_analysis || null));
      triggerGameFeedback(nodesBefore, cleanMap.argument_map.nodes, submittingSpeaker);

      if (detected.length > 0) setConcessionQueue(detected);

      // Lock in the speaker's name after first submission
      const speakerKey = currentSpeaker === "Blue" ? "a" : "b";
      setHasSubmitted((prev) => ({ ...prev, [speakerKey]: true }));

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
    const nodesBefore = argumentMap.argument_map.nodes;
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
    // Clear contradiction/goalpost flags from nodes that become faded
    const ratedNode = updatedNodes.find((n) => n.id === nodeId);
    const finalNodes = (ratedNode?.rating === "up" || ratedNode?.rating === "down")
      ? clearConflictFlagsForFadedSubtree(updatedNodes, inner.edges, nodeId)
      : updatedNodes;
    pushHistory({ argument_map: { ...inner, nodes: finalNodes } }, moderatorAnalysis);
    triggerGameFeedback(nodesBefore, finalNodes, currentSpeaker);
  };

  /** Concession queue handlers */
  const handleConfirmConcession = () => {
    const [item, ...rest] = concessionQueue;
    const nodesBefore = argumentMap.argument_map.nodes;
    const inner = argumentMap.argument_map;
    const nodes = inner.nodes.map((node) => {
      if (node.id !== item.nodeId) return node;
      if (item.type === "self") {
        // Speaker retracting their own node
        return {
          ...node,
          rating: "down",
          metadata: {
            ...node.metadata,
            conceded_by: { speaker: item.concedingBy, ...(item.agreedByText ? { text: item.agreedByText } : {}) },
          },
        };
      }
      // Speaker agreeing with other speaker's node
      return {
        ...node,
        rating: "up",
        metadata: {
          ...node.metadata,
          agreed_by: { speaker: item.concedingBy, ...(item.agreedByText ? { text: item.agreedByText } : {}) },
        },
      };
    });
    const cleanedNodes = clearConflictFlagsForFadedSubtree(nodes, inner.edges, item.nodeId);
    pushHistory({ argument_map: { ...inner, nodes: cleanedNodes } }, moderatorAnalysis);
    triggerGameFeedback(nodesBefore, cleanedNodes, item.concedingBy);
    setConcessionQueue(rest);
  };

  const handleDismissConcession = () => {
    setConcessionQueue((prev) => prev.slice(1));
  };

  /**
   * Manual node edit — updates an existing node's fields and optionally re-parents it.
   * No API call; pushes directly to history.
   */
  const handleNodeSave = (nodeId, data, newParentId) => {
    const inner = argumentMap.argument_map;

    const updatedNodes = inner.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const meta = { ...n.metadata, tactics: data.tactics, tags: data.tags };
      if (data.contradicts) meta.contradicts = data.contradicts;
      else delete meta.contradicts;
      if (data.moves_goalposts_from) meta.moves_goalposts_from = data.moves_goalposts_from;
      else delete meta.moves_goalposts_from;
      return { ...n, content: data.content, type: data.type, metadata: meta };
    });

    // Re-parent: replace existing outgoing edge if parent changed
    const oldEdge = inner.edges.find((e) => e.from === nodeId);
    const oldParentId = oldEdge?.to ?? null;
    let updatedEdges = inner.edges;
    if (newParentId !== oldParentId) {
      updatedEdges = inner.edges.filter((e) => e.from !== nodeId);
      if (newParentId) {
        const edgeNums = inner.edges.map((e) => parseInt(e.id.replace("edge_", ""), 10)).filter(Boolean);
        const nextEdgeNum = edgeNums.length > 0 ? Math.max(...edgeNums) + 1 : 1;
        updatedEdges = [...updatedEdges, {
          id: `edge_${nextEdgeNum}`,
          from: nodeId,
          to: newParentId,
          relationship: oldEdge?.relationship ?? "supports",
        }];
      }
    }

    pushHistory({ argument_map: { ...inner, nodes: updatedNodes, edges: updatedEdges } }, moderatorAnalysis);
    // Keep popup open on the updated node
    setSelectedNode(updatedNodes.find((n) => n.id === nodeId) ?? null);
  };

  /**
   * Manual node creation — adds a brand-new node (attributed to currentSpeaker).
   * No API call; pushes directly to history.
   */
  const handleAddNode = (_nodeId, data, parentId) => {
    const inner = argumentMap.argument_map;

    const nodeNums = inner.nodes.map((n) => parseInt(n.id.replace("node_", ""), 10)).filter(Boolean);
    const nextNodeNum = nodeNums.length > 0 ? Math.max(...nodeNums) + 1 : 1;
    const newNodeId = `node_${nextNodeNum}`;

    const newNode = {
      id: newNodeId,
      type: data.type || "claim",
      content: data.content,
      speaker: currentSpeaker,
      rating: null,
      metadata: {
        confidence: "medium",
        tags: data.tags ?? [],
        tactics: data.tactics ?? [],
        tactic_reasons: {},
        ...(data.contradicts ? { contradicts: data.contradicts } : {}),
        ...(data.moves_goalposts_from ? { moves_goalposts_from: data.moves_goalposts_from } : {}),
      },
    };

    let updatedEdges = inner.edges;
    if (parentId) {
      const edgeNums = inner.edges.map((e) => parseInt(e.id.replace("edge_", ""), 10)).filter(Boolean);
      const nextEdgeNum = edgeNums.length > 0 ? Math.max(...edgeNums) + 1 : 1;
      updatedEdges = [...updatedEdges, {
        id: `edge_${nextEdgeNum}`,
        from: newNodeId,
        to: parentId,
        relationship: "supports",
      }];
    }

    pushHistory(
      { argument_map: { ...inner, nodes: [...inner.nodes, newNode], edges: updatedEdges } },
      moderatorAnalysis
    );
    setOriginalTexts((prev) => ({ ...prev, [newNodeId]: "(manually added)" }));
    setAddNodeOpen(false);
  };

  /**
   * Called when a user sends a chat message to the AI moderator.
   * Maintains conversation history and optionally updates the map.
   */
  const handleChatMessage = async (message) => {
    const userMsg = { role: "user", content: message, speaker: currentSpeaker };
    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);

    setLoading(true);
    setError(null);

    try {
      const { reply, updatedMap } = await chatWithModerator(argumentMap, updatedHistory, { a: resolvedTheme.a.name, b: resolvedTheme.b.name });
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
        const sanitizedChatMap = sanitizeNodeContent(updatedMap, resolvedTheme);
        const chatChanges = computeMapDiff(argumentMap.argument_map, sanitizedChatMap.argument_map);
        if (chatChanges.length > 0) {
          setAiChangeLog((prev) => [...prev, {
            id: Date.now(),
            speaker: "Moderator",
            statement: message,
            changes: chatChanges,
          }]);
        }
        pushHistory(sanitizedChatMap, moderatorAnalysis);
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

  const handleCombinedSubmit = async (conversationText) => {
    setLoading(true);
    setError(null);

    try {
      const turns = await parseConversation(conversationText, { a: resolvedTheme.a.name, b: resolvedTheme.b.name });
      if (!turns.length) throw new Error("No turns found in conversation.");

      let workingMap = argumentMap;
      let workingSpeaker = currentSpeaker;

      for (let i = 0; i < turns.length; i++) {
        setCombiningProgress({ current: i + 1, total: turns.length });
        setLoadingSpeaker(workingSpeaker);

        const updatedMap = await updateArgumentMap(
          workingMap, workingSpeaker, turns[i].text,
          { a: resolvedTheme.a.name, b: resolvedTheme.b.name }
        );

        const oldIds = new Set(workingMap.argument_map.nodes.map((n) => n.id));
        const newNodes = updatedMap.argument_map.nodes.filter((n) => !oldIds.has(n.id));
        if (newNodes.length > 0) {
          const turnText = turns[i].text;
          setOriginalTexts((prev) => {
            const next = { ...prev };
            for (const n of newNodes) next[n.id] = turnText;
            return next;
          });
        }

        const cleanMap = sanitizeNodeContent(updatedMap, resolvedTheme);
        pushHistory(cleanMap, sanitizeAnalysis(updatedMap.moderator_analysis || null));
        workingMap = cleanMap;
        workingSpeaker = workingSpeaker === "Blue" ? "Green" : "Blue";
      }
      setCurrentSpeaker(workingSpeaker);
      setHasSubmitted({ a: true, b: true });
      setInputMode("turns");
      setActiveTab("map");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingSpeaker(null);
      setCombiningProgress(null);
    }
  };

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
  }, []);

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

  // Derive a concise position summary for each speaker from their most recent active claim.
  // Falls back to any claim, then any node, then a placeholder if no nodes yet.
  const getSpeakerSummary = (speaker) => {
    const nodes = [...inner.nodes].reverse();
    const node = nodes.find((n) => n.speaker === speaker && n.type === "claim" && !fadedInfo.fadedNodeIds.has(n.id))
      ?? nodes.find((n) => n.speaker === speaker && n.type === "claim")
      ?? nodes.find((n) => n.speaker === speaker);
    if (!node) return "Position Summary Pending";
    const text = node.content;
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  };
  const speakerSummary = getSpeakerSummary(currentSpeaker);

  return (
    <div className="app">
      {/* LCARS left-edge spine — fixed orange strip connecting header & footer elbows */}
      {theme.lcars && <div className="lcars-spine" />}

      {/* Invisible hit zones — restore UI when header/footer are hidden */}
      {!uiVisible && (
        <>
          <div onClick={toggleUI} style={{position:"fixed",top:0,left:0,right:0,height:90,zIndex:55,cursor:"pointer"}} />
          <div onClick={toggleUI} style={{position:"fixed",bottom:0,left:0,right:0,height:80,zIndex:55,cursor:"pointer"}} />
        </>
      )}

      {/* Fixed top bar: title + tabs slide together */}
      <div className={`app-top${uiVisible ? "" : " app-top--hidden"}`}>
        <div className="app-top-body">
          {theme.lcars && <div className="lcars-rail" />}
          <div className="app-top-content">
          <header className="app-header">
          <h1>Argument Mapper</h1>
          {saveStatus && (
            <span className={`save-status save-status--${saveStatus}`}>
              {saveStatus === "saving" ? "Saving…" : "Saved ✓"}
            </span>
          )}
          <SettingsPanel currentThemeKey={themeKey} onThemeChange={handleThemeChange} user={user} onOpenAuth={() => setShowAuthModal(true)} gameMode={gameMode} onGameModeChange={handleGameModeChange} />
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
          className={`tab-btn${activeTab === "moderator" ? " tab-btn--active" : ""}`}
          onClick={() => setActiveTab("moderator")}
        >
          Moderator
        </button>
        {user && (
          <button
            className={`tab-btn${activeTab === "arguments" ? " tab-btn--active" : ""}`}
            onClick={() => setActiveTab("arguments")}
          >
            Arguments
          </button>
        )}
        <button
          className={`tab-btn${activeTab === "about" ? " tab-btn--active" : ""}`}
          onClick={() => setActiveTab("about")}
        >
          About
        </button>
        </nav>
          </div>{/* app-top-content */}
        </div>{/* app-top-body */}
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
            theme={resolvedTheme}
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
              newNodeIds={newNodeIds}
              theme={resolvedTheme}
            />
          </div>
        )}

        {activeTab === "arguments" && (
          <DebateHistory user={user} onLoadDebate={handleLoadDebate} onNewDebate={handleNewDebate} />
        )}

        {/* Always mounted so scroll position is preserved across tab switches */}
        <div style={activeTab !== "about" ? { display: "none" } : { height: "100%", overflow: "hidden" }}>
          <AboutTab isActive={activeTab === "about"} />
        </div>

        {activeTab === "moderator" && (() => {
          const fixNames = (s) => typeof s === "string"
            ? s.replace(/\bBlue\b/g, resolvedTheme.a.name).replace(/\bGreen\b/g, resolvedTheme.b.name)
            : s;
          const buildEvents = (internalSpeaker) => {
            const events = [];
            for (const node of inner.nodes) {
              if (node.speaker === internalSpeaker) {
                if (node.metadata?.contradicts)
                  events.push({ cls: "bad", pts: POINTS.contradiction, text: `Contradicted own position: ${fmtNodeId(node.metadata.contradicts)} ⚠ ${fmtNodeId(node.id)}` });
                if (node.metadata?.moves_goalposts_from)
                  events.push({ cls: "bad", pts: POINTS.goalposts, text: `Moved goalposts: ${fmtNodeId(node.metadata.moves_goalposts_from)} ⤳ ${fmtNodeId(node.id)}` });
                if (node.rating === "down") {
                  const snip = node.content.length > 50 ? node.content.slice(0, 47) + "…" : node.content;
                  events.push({ cls: "good", pts: POINTS.self_retraction, text: `↩ Retracted own argument: "${snip}"` });
                }
                if (node.rating === "up" && node.metadata?.agreed_by?.speaker && node.metadata.agreed_by.speaker !== internalSpeaker) {
                  const snip = node.content.length > 50 ? node.content.slice(0, 47) + "…" : node.content;
                  events.push({ cls: "good", pts: POINTS.concession_received, text: `✓ Opponent agreed with your point: "${snip}"` });
                }
                for (const key of (node.metadata?.tactics || [])) {
                  const t = TACTICS[key];
                  const pts = POINTS[key];
                  if (t) events.push({ cls: t.type === "fallacy" ? "bad" : "good", pts: pts ?? 0, text: `${t.symbol} ${t.name} (${fmtNodeId(node.id)})` });
                }
              } else {
                if (node.metadata?.agreed_by?.speaker === internalSpeaker) {
                  const snip = node.content.length > 50 ? node.content.slice(0, 47) + "…" : node.content;
                  events.push({ cls: "good", pts: POINTS.concession_given, text: `✓ Conceded opposing point: "${snip}"` });
                }
              }
            }
            return events;
          };
          const eventsA = buildEvents("Blue");
          const eventsB = buildEvents("Green");
          const scoreA = scores.Blue ?? 0;
          const scoreB = scores.Green ?? 0;
          const scoreLeader = scoreA > scoreB ? "Blue" : scoreB > scoreA ? "Green" : null;
          return (
            <div className="moderator-combined">
              {/* Top half: side-by-side speaker breakdowns */}
              <div className="moderator-speakers">
                <div className="moderator-speaker" style={{ borderRight: `2px solid ${theme.a.bg}33` }}>
                  <div className="moderator-speaker-name" style={{ color: resolvedTheme.a.bg }}>
                    {resolvedTheme.a.name}
                    {scoreLeader === "Blue" && <span className="score-crown">👑</span>}
                  </div>
                  {gameMode && (
                    <div className={`score-display${scoreA >= 0 ? " score-display--pos" : " score-display--neg"}`}>
                      {scoreA >= 0 ? "+" : ""}{scoreA} pts
                    </div>
                  )}
                  {effectiveAnalysis
                    ? <p className="moderator-speaker-style">{fixNames(effectiveAnalysis.user_a_style)}</p>
                    : <p className="moderator-speaker-empty">No analysis yet.</p>}
                  {eventsA.length > 0 && (
                    <ul className="moderator-events">
                      {eventsA.map((ev, i) => (
                        <li key={i} className={`moderator-event moderator-event--${ev.cls}`}>
                          <span className="moderator-event-text">{ev.text}</span>
                          {gameMode && ev.pts != null && (
                            <span className={`moderator-event-pts${ev.pts >= 0 ? " pts-pos" : " pts-neg"}`}>
                              {ev.pts >= 0 ? "+" : ""}{ev.pts}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="moderator-speaker">
                  <div className="moderator-speaker-name" style={{ color: resolvedTheme.b.bg }}>
                    {resolvedTheme.b.name}
                    {scoreLeader === "Green" && <span className="score-crown">👑</span>}
                  </div>
                  {gameMode && (
                    <div className={`score-display${scoreB >= 0 ? " score-display--pos" : " score-display--neg"}`}>
                      {scoreB >= 0 ? "+" : ""}{scoreB} pts
                    </div>
                  )}
                  {effectiveAnalysis
                    ? <p className="moderator-speaker-style">{fixNames(effectiveAnalysis.user_b_style)}</p>
                    : <p className="moderator-speaker-empty">No analysis yet.</p>}
                  {eventsB.length > 0 && (
                    <ul className="moderator-events">
                      {eventsB.map((ev, i) => (
                        <li key={i} className={`moderator-event moderator-event--${ev.cls}`}>
                          <span className="moderator-event-text">{ev.text}</span>
                          {gameMode && ev.pts != null && (
                            <span className={`moderator-event-pts${ev.pts >= 0 ? " pts-pos" : " pts-neg"}`}>
                              {ev.pts >= 0 ? "+" : ""}{ev.pts}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {/* Bottom half: chat */}
              <div className="moderator-chat">
                {chatMessages.length === 0 ? (
                  <p className="empty-message">Ask the AI moderator anything about the argument map.</p>
                ) : (
                  <div className="chat-log" ref={chatLogRef}>
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`chat-message ${msg.role}`}>
                        <div
                          className="chat-bubble"
                          style={msg.role === "user"
                            ? { backgroundColor: speakerBorder(msg.speaker, resolvedTheme) }
                            : undefined}
                        >{msg.content}</div>
                        {msg.mapUpdated && <div className="chat-map-updated">Map updated</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </main>

      {/* Game mode toast */}
      {gameMode && gameToast && (
        <div
          key={gameToast.key}
          className={`game-toast game-toast--${gameToast.delta > 0 ? "good" : "bad"}`}
          style={{ color: gameToast.speaker === "Blue" ? resolvedTheme.a.bg : resolvedTheme.b.bg }}
        >
          {gameToast.delta > 0 ? "+" : ""}{gameToast.delta} pts
          {gameToast.delta >= 18 ? " 🌟" : gameToast.delta > 0 ? " ⭐" : " 💨"}
        </div>
      )}

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
            key={liveNode.id}
            node={liveNode}
            originalText={originalTexts[liveNode.id]}
            onClose={() => setSelectedNode(null)}
            fadedNodeIds={fadedInfo.fadedNodeIds}
            nodes={inner.nodes}
            edges={inner.edges}
            onNodeClick={handleNodeClick}
            onRate={handleRate}
            onSave={handleNodeSave}
            currentSpeaker={currentSpeaker}
            loading={loading}
            theme={resolvedTheme}
            gameMode={gameMode}
          />
        );
      })()}

      {/* Add Node modal — create mode */}
      {addNodeOpen && (
        <NodeDetailPopup
          isNew
          onClose={() => setAddNodeOpen(false)}
          nodes={inner.nodes}
          edges={inner.edges}
          onSave={handleAddNode}
          currentSpeaker={currentSpeaker}
          theme={resolvedTheme}
        />
      )}

      {/* Concession confirmation popup */}
      {concessionQueue.length > 0 && (
        <ConcessionConfirmModal
          concession={concessionQueue[0]}
          onConfirm={handleConfirmConcession}
          onDismiss={handleDismissConcession}
          theme={resolvedTheme}
        />
      )}

      {/* AI Change Log modal */}
      {showChangeLog && (
        <AIChangeLogModal
          log={aiChangeLog}
          onClose={() => setShowChangeLog(false)}
          theme={resolvedTheme}
        />
      )}

      {/* Sign-in nudge — shown when user has nodes but is not signed in */}
      {!user && !saveNudgeDismissed && inner.nodes.length >= 2 && (
        <div className="save-nudge">
          <span>Your conversation isn't being saved.</span>
          <button className="save-nudge-signin" onClick={() => setShowAuthModal(true)}>Sign in to keep it</button>
          <button className="save-nudge-dismiss" onClick={() => setSaveNudgeDismissed(true)} title="Dismiss">✕</button>
        </div>
      )}

      {/* Statement input at the bottom — hidden on arguments and about tabs */}
      {activeTab !== "arguments" && activeTab !== "about" && (
        <footer className={`app-footer${uiVisible ? "" : " app-footer--hidden"}`}>
          {theme.lcars && <div className="lcars-rail lcars-rail--footer" />}
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
            onAddNode={() => setAddNodeOpen(true)}
            onReviewChanges={() => setShowChangeLog(true)}
            changeLogCount={aiChangeLog.length}
            theme={resolvedTheme}
            nameEditable={!hasSubmitted[currentSpeaker === "Blue" ? "a" : "b"]}
            currentName={currentSpeaker === "Blue" ? playerNames.a : playerNames.b}
            onNameChange={(name) => {
              const key = currentSpeaker === "Blue" ? "a" : "b";
              setPlayerNames((prev) => ({ ...prev, [key]: name }));
            }}
            onRefreshName={() => {
              const key = currentSpeaker === "Blue" ? "a" : "b";
              setPlayerNames((prev) => ({ ...prev, [key]: randomName(prev[key]) }));
            }}
            inputMode={inputMode}
            onModeChange={setInputMode}
            onCombinedSubmit={handleCombinedSubmit}
            combiningProgress={combiningProgress}
          />
        </footer>
      )}

      {/* Auth modal */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
