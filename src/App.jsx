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
import ConcessionConfirmModal from "./components/ConcessionConfirmModal";
import AIChangeLogModal from "./components/AIChangeLogModal";
import AuthModal from "./components/AuthModal";
import DebateHistory from "./components/DebateHistory";
import { updateArgumentMap, rateNode, chatWithModerator } from "./utils/claude";
import { speakerName, speakerBorder } from "./utils/speakers.js";
import { THEMES, DEFAULT_THEME_KEY } from "./utils/themes.js";
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
  const [saveStatus, setSaveStatus] = useState(null); // null | "saving" | "saved"
  const currentDebateIdRef = useRef(null); // Supabase row id of current debate (ref avoids stale closure)
  const skipNextSaveRef = useRef(false);   // Set true after loading a debate to skip the immediate re-save

  const chatLogRef = useRef(null);
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

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
        const row = { title: autoTitle, map_data: entry, theme_key: themeKey, speaker_a: theme.a.name, speaker_b: theme.b.name, user_id: user.id };
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
    setAiChangeLog([]);
    setChatMessages([]);
    setOriginalTexts({});
    setActiveTab("map");
  };

  /**
   * Called when a user submits a new statement.
   * Sends it to Claude along with the current map, gets back an updated map.
   */
  const handleSubmit = async (statement) => {
    setLoading(true);
    setLoadingSpeaker(currentSpeaker);
    setError(null);

    try {
      // Call Claude to process the statement and update the map
      const updatedMap = await updateArgumentMap(
        argumentMap,
        currentSpeaker,
        statement,
        { a: theme.a.name, b: theme.b.name }
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
      const cleanMap = sanitizeNodeContent(strippedMap, theme);

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
        const roots = findRootNodes(cleanMap.argument_map.nodes, cleanMap.argument_map.edges);
        if (roots.length > 1) {
          setError(
            `Warning: Claude created ${roots.length} disconnected root nodes (${roots.map((r) => r.id).join(", ")}). ` +
            `The map should have exactly one root. Consider undoing this turn and rephrasing.`
          );
        }
      }

      pushHistory(cleanMap, sanitizeAnalysis(updatedMap.moderator_analysis || null));

      if (detected.length > 0) setConcessionQueue(detected);

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

  /** Concession queue handlers */
  const handleConfirmConcession = () => {
    const [item, ...rest] = concessionQueue;
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
    pushHistory({ argument_map: { ...inner, nodes } }, moderatorAnalysis);
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
      const { reply, updatedMap } = await chatWithModerator(argumentMap, updatedHistory, { a: theme.a.name, b: theme.b.name });
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
        const sanitizedChatMap = sanitizeNodeContent(updatedMap, theme);
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
          <SettingsPanel currentThemeKey={themeKey} onThemeChange={handleThemeChange} user={user} onOpenAuth={() => setShowAuthModal(true)} />
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
        {user && (
          <button
            className={`tab-btn${activeTab === "history" ? " tab-btn--active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            History
          </button>
        )}
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

        {activeTab === "history" && (
          <DebateHistory user={user} onLoadDebate={handleLoadDebate} />
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
                  <div className="gauge-track gauge-track-large" style={{ background: `linear-gradient(to right, ${theme.a.bg}44, ${theme.dark ? '#1e293b' : '#f1f5f9'} 50%, ${theme.b.bg}44)` }}>
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
            theme={theme}
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
          theme={theme}
        />
      )}

      {/* Concession confirmation popup */}
      {concessionQueue.length > 0 && (
        <ConcessionConfirmModal
          concession={concessionQueue[0]}
          onConfirm={handleConfirmConcession}
          onDismiss={handleDismissConcession}
          theme={theme}
        />
      )}

      {/* AI Change Log modal */}
      {showChangeLog && (
        <AIChangeLogModal
          log={aiChangeLog}
          onClose={() => setShowChangeLog(false)}
          theme={theme}
        />
      )}

      {/* Statement input at the bottom — hidden on moderator and history tabs */}
      {activeTab !== "moderator" && activeTab !== "history" && (
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
            theme={theme}
          />
        </footer>
      )}

      {/* Auth modal */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
