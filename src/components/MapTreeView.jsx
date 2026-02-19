/**
 * MapTreeView.jsx — Indented tree view of the argument map for the List tab.
 *
 * Converts the DAG into a spanning tree via DFS from root nodes (claims that
 * don't argue FOR anything — they sit at the top of the hierarchy). Nodes with
 * multiple parents get a ⇄ badge. Nodes with children can be collapsed/expanded.
 */

import { useMemo, useState } from "react";
import { TACTICS } from "../utils/tactics.js";
import { spk } from "../utils/speakers.js";

const SPEAKER_STYLE = {
  "User A": { bg: "#dbeafe", border: "#3b82f6" },
  "User B": { bg: "#dcfce7", border: "#22c55e" },
  "Moderator": { bg: "#ede9fe", border: "#8b5cf6" },
};

const INDENT_PX = 20;

const TYPE_LABEL = {
  claim:         "claim",
  objection:     "objection",
  rebuttal:      "rebuttal",
  evidence:      "evidence",
  premise:       "premise",
  clarification: "clarification",
};

/**
 * Build a nested tree structure from flat nodes + edges.
 * Root nodes = nodes whose id never appears as edge.from.
 * Children of node X = all edge.from nodes where edge.to === X.id.
 */
function buildTree(nodes, edges) {
  const isSrc = new Set(edges.map((e) => e.from));
  const roots = nodes.filter((n) => !isSrc.has(n.id));

  const childMap = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    childMap.get(edge.to)?.push({ childId: edge.from, relationship: edge.relationship });
  }

  const parentEdges = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    parentEdges.get(edge.from)?.push({ parentId: edge.to });
  }

  function buildNode(nodeId, treeParentId, placed) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || placed.has(nodeId)) return null;
    placed.add(nodeId);

    const allParents = parentEdges.get(node.id) || [];
    const crossLinkCount = allParents.filter((p) => p.parentId !== treeParentId).length;

    const children = [];
    for (const { childId } of childMap.get(nodeId) || []) {
      const child = buildNode(childId, nodeId, placed);
      if (child) children.push(child);
    }

    return { node, crossLinkCount, children };
  }

  const placed = new Set();
  const trees = [];
  for (const root of roots) {
    const t = buildNode(root.id, null, placed);
    if (t) trees.push(t);
  }
  for (const node of nodes) {
    if (!placed.has(node.id)) {
      const t = buildNode(node.id, null, placed);
      if (t) trees.push(t);
    }
  }
  return trees;
}

/** Count all descendants recursively */
function countDescendants(children) {
  let count = 0;
  for (const child of children) {
    count += 1 + countDescendants(child.children);
  }
  return count;
}

function TreeNode({ item, depth, collapsed, onToggle, currentSpeaker, onRate, onNodeClick, loading, fadedNodeIds }) {
  const { node, crossLinkCount, children } = item;
  const style = SPEAKER_STYLE[node.speaker] || { bg: "#f8fafc", border: "#94a3b8" };
  const isFaded = fadedNodeIds?.has(node.id);
  const tactics = (node.metadata?.tactics || []).filter((k) => TACTICS[k]);
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(node.id);

  return (
    <li className={`map-tree-item${isFaded ? " map-tree-item--faded" : ""}`}>
      {/* Card */}
      <div
        className="map-tree-cell"
        style={{
          marginLeft: `${depth * INDENT_PX}px`,
          background: style.bg,
          borderLeft: `3px solid ${style.border}`,
        }}
        onClick={() => onNodeClick?.(node)}
      >
        {/* Badges row */}
        <div className="node-badges">
          {hasChildren && (
            <button
              className={`tree-toggle${isCollapsed ? " tree-toggle--collapsed" : ""}`}
              onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              ▾
            </button>
          )}
          <span
            className="speaker-badge"
            style={{ backgroundColor: node.speaker === "User A" ? "#3b82f6" : "#22c55e" }}
          >
            {spk(node.speaker)}
          </span>
          <span className="node-id-badge">{node.id}</span>
          <span className={`type-badge type-${node.type}`}>{node.type}</span>
          {node.metadata?.confidence && (
            <span className={`confidence-badge confidence-${node.metadata.confidence}`}>
              {node.metadata.confidence}
            </span>
          )}
          {crossLinkCount > 0 && (
            <span
              className="map-tree-crosslink"
              title={`${crossLinkCount} additional connection${crossLinkCount !== 1 ? "s" : ""} — click for details`}
            >
              ⇄ {crossLinkCount}
            </span>
          )}
        </div>

        {/* Claim text */}
        <span className="claim-text">{node.content}</span>

        {/* Tactic badges */}
        {tactics.length > 0 && (
          <div className="node-badges">
            {tactics.map((key) => (
              <span
                key={key}
                className={`tactic-badge tactic-${TACTICS[key].type}`}
                title={TACTICS[key].name}
              >
                {TACTICS[key].symbol} {TACTICS[key].name}
              </span>
            ))}
          </div>
        )}

        {/* Fading reason */}
        {isFaded && node.rating === "up" && (
          <div className="agreement-indicator">
            <span className="agreement-indicator-icon">&#x2714;</span>
            {node.metadata?.agreed_by?.text
              ? `Implicit agreement — ${node.metadata.agreed_by.speaker}`
              : node.metadata?.agreed_by?.speaker
              ? `Thumbs up — ${node.metadata.agreed_by.speaker}`
              : "Agreed"}
          </div>
        )}
        {isFaded && node.rating === "down" && (
          <div className="retracted-indicator">↩ Retracted by {node.speaker}</div>
        )}
        {isFaded && !node.rating && (
          <div className="inactive-indicator">⬡ Supporting a resolved claim</div>
        )}

        {/* Collapsed child summary */}
        {isCollapsed && hasChildren && (
          <div className="tree-collapsed-summary">
            +{countDescendants(children)}
          </div>
        )}

        {/* Rating buttons */}
        <span className="rating-buttons" onClick={(e) => e.stopPropagation()}>
          <button
            className={`rate-btn ${node.rating === "up" ? "active-up" : ""} ${node.speaker === currentSpeaker ? "rate-btn-unavailable" : ""}`}
            onClick={() => onRate(node.id, "up")}
            disabled={loading || node.speaker === currentSpeaker}
            title={node.speaker !== currentSpeaker ? "I agree with this representation" : "You can only agree with the other user's statements"}
          >
            &#x1F44D;
          </button>
          <button
            className={`rate-btn ${node.rating === "down" ? "active-down" : ""} ${node.speaker !== currentSpeaker ? "rate-btn-unavailable" : ""}`}
            onClick={() => onRate(node.id, "down")}
            disabled={loading || node.speaker !== currentSpeaker}
            title={node.speaker === currentSpeaker ? "Retract this argument" : "You can only retract your own statements"}
          >
            &#x1F44E;
          </button>
        </span>
      </div>

      {/* Children — animated collapse/expand */}
      {hasChildren && (
        <div className={`tree-children${isCollapsed ? " tree-children--collapsed" : ""}`}>
          <div className="tree-children-inner">
            <ul className="map-tree-list">
              {children.map((child) => (
                <TreeNode
                  key={child.node.id}
                  item={child}
                  depth={depth + 1}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  currentSpeaker={currentSpeaker}
                  onRate={onRate}
                  onNodeClick={onNodeClick}
                  loading={loading}
                  fadedNodeIds={fadedNodeIds}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

export default function MapTreeView({ nodes, edges, currentSpeaker, onRate, onNodeClick, loading, fadedNodeIds }) {
  const trees = useMemo(() => buildTree(nodes, edges), [nodes, edges]);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const onToggle = (nodeId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  if (nodes.length === 0) {
    return <p className="empty-message" style={{ padding: "1rem 1.25rem" }}>No claims yet.</p>;
  }

  return (
    <div className="node-list">
      <h3>Claims ({nodes.length})</h3>
      <ul className="map-tree-list">
        {trees.map((item) => (
          <TreeNode
            key={item.node.id}
            item={item}
            depth={0}
            collapsed={collapsed}
            onToggle={onToggle}
            currentSpeaker={currentSpeaker}
            onRate={onRate}
            onNodeClick={onNodeClick}
            loading={loading}
            fadedNodeIds={fadedNodeIds}
          />
        ))}
      </ul>
    </div>
  );
}
