/**
 * MapTreeView.jsx — Indented tree view of the argument map for the List tab.
 *
 * Converts the DAG into a spanning tree via DFS from root nodes (claims that
 * don't argue FOR anything — they sit at the top of the hierarchy). Nodes with
 * multiple parents get a ⇄ badge. Nodes with children can be collapsed/expanded.
 */

import { useMemo, useState } from "react";
import { TACTICS } from "../utils/tactics.js";
import { speakerName, speakerBorder } from "../utils/speakers.js";

const MODERATOR_STYLE = { bg: "#ede9fe", border: "#94a3b8" };

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

function TreeNode({ item, depth, collapsed, onToggle, currentSpeaker, onRate, onNodeClick, loading, fadedNodeIds, contradictionFadedIds, walkbackFadedIds, contradictionBorderIds, walkbackBorderIds, newNodeIds, theme }) {
  const { node, crossLinkCount, children } = item;
  const style = node.speaker === "Blue"  ? { bg: theme.a.bg, border: theme.a.bg }
              : node.speaker === "Green" ? { bg: theme.b.bg, border: theme.b.bg }
              : MODERATOR_STYLE;
  const isFaded = fadedNodeIds?.has(node.id);
  const isNew = newNodeIds?.has(node.id);
  const isContradictionBorder = contradictionBorderIds?.has(node.id);
  const isWalkbackBorder = walkbackBorderIds?.has(node.id);
  const isContradictionFaded = !isContradictionBorder && contradictionFadedIds?.has(node.id);
  const isWalkbackFaded = !isWalkbackBorder && walkbackFadedIds?.has(node.id);

  // Determine background and outline based on contradiction/walkback state
  let bgColor = style.bg;
  let outlineStyle;
  let lightBg = false;
  if (isContradictionBorder) {
    bgColor = "#fee2e2";
    outlineStyle = "2px solid #dc2626";
    lightBg = true;
  } else if (isWalkbackBorder) {
    bgColor = "#ffedd5";
    outlineStyle = "2px solid #f97316";
    lightBg = true;
  } else if (isContradictionFaded) {
    bgColor = "#fee2e2";
    lightBg = true;
  } else if (isWalkbackFaded) {
    bgColor = "#ffedd5";
    lightBg = true;
  }
  const textColor = lightBg ? "#1e293b" : "#fff";

  // Only apply opacity fading if NOT already getting colored background
  const hasColoredBg = isContradictionBorder || isWalkbackBorder || isContradictionFaded || isWalkbackFaded;
  const shouldFadeOpacity = isFaded && !hasColoredBg;

  const tactics = (node.metadata?.tactics || []).filter((k) => TACTICS[k]);
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(node.id);

  return (
    <li className={`map-tree-item${shouldFadeOpacity ? " map-tree-item--faded" : ""}`}>
      {/* Card */}
      <div
        className={`map-tree-cell${isNew ? " map-tree-cell--new" : ""}`}
        style={{
          marginLeft: `${depth * INDENT_PX}px`,
          background: bgColor,
          outline: outlineStyle,
          "--glow-color": style.border,
          color: textColor,
          // Neutral-active CSS custom properties cascade to all child elements.
          // Colored speaker cards use white-based values; light contradiction/
          // walkback cards use dark-based values.
          "--na-text":   textColor,
          "--na-bg":     lightBg ? "rgba(0,0,0,0.07)"    : "rgba(0,0,0,0.18)",
          "--na-border": lightBg ? "rgba(0,0,0,0.15)"    : "rgba(255,255,255,0.25)",
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
            style={{ backgroundColor: speakerBorder(node.speaker, theme) }}
          >
            {speakerName(node.speaker, theme)}
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

        {/* Topic tags */}
        {node.metadata?.tags?.length > 0 && (
          <div className="popup-tags">
            {node.metadata.tags.map((tag) => (
              <span key={tag} className="popup-tag">{tag}</span>
            ))}
          </div>
        )}

        {/* Fading reason */}
        {isFaded && node.rating === "up" && (
          <div className="agreement-indicator">
            <span className="agreement-indicator-icon">&#x2714;</span>
            {node.metadata?.agreed_by?.speaker
              ? `${spk(node.metadata.agreed_by.speaker)} conceded ${spk(node.speaker)}'s point`
              : "Conceded"}
          </div>
        )}
        {isFaded && node.rating === "down" && (
          <div className="retracted-indicator">↩ Retracted by {node.speaker}</div>
        )}
        {isFaded && !node.rating && (
          <div className="inactive-indicator">⬡ Supporting a resolved statement</div>
        )}

        {/* Collapsed child summary */}
        {isCollapsed && hasChildren && (
          <div className="tree-collapsed-summary">
            +{countDescendants(children)}
          </div>
        )}

        {/* Concede button */}
        <span className="rating-buttons" onClick={(e) => e.stopPropagation()}>
          {(() => {
            const isOtherNode = node.speaker !== currentSpeaker;
            const isActive = isOtherNode ? node.rating === "up" : node.rating === "down";
            const ratingType = isOtherNode ? "up" : "down";
            const btnText = isOtherNode ? "I concede, this is correct" : "I concede, this is incorrect";
            return (
              <button
                className={`concede-btn${isActive ? " concede-btn--active" : ""}`}
                onClick={() => onRate(node.id, ratingType)}
                disabled={loading}
              >
                {isActive ? `✓ ${btnText}` : btnText}
              </button>
            );
          })()}
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
                  contradictionFadedIds={contradictionFadedIds}
                  walkbackFadedIds={walkbackFadedIds}
                  contradictionBorderIds={contradictionBorderIds}
                  walkbackBorderIds={walkbackBorderIds}
                  newNodeIds={newNodeIds}
                  theme={theme}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

export default function MapTreeView({ nodes, edges, currentSpeaker, onRate, onNodeClick, loading, fadedNodeIds, contradictionFadedIds, walkbackFadedIds, contradictionBorderIds, walkbackBorderIds, newNodeIds, theme }) {
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
    return <p className="empty-message" style={{ padding: "1rem 1.25rem" }}>No statements yet.</p>;
  }

  return (
    <div className="node-list">
      <h3>Statements ({nodes.length})</h3>
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
            contradictionFadedIds={contradictionFadedIds}
            walkbackFadedIds={walkbackFadedIds}
            contradictionBorderIds={contradictionBorderIds}
            walkbackBorderIds={walkbackBorderIds}
            newNodeIds={newNodeIds}
            theme={theme}
          />
        ))}
      </ul>
    </div>
  );
}
