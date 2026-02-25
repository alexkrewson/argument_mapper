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

const nodeChipLabel = (id) => id.toUpperCase().replace("NODE_", "NODE #");

function TreeNode({ item, depth, collapsed, onToggle, currentSpeaker, onRate, onNodeClick, loading, fadedNodeIds, contradictionFadedIds, walkbackFadedIds, newNodeIds, theme, contradictedByMap, walkedBackByMap }) {
  const { node, crossLinkCount, children } = item;
  const style = node.speaker === "Blue"  ? { bg: theme.a.bg, border: theme.a.bg }
              : node.speaker === "Green" ? { bg: theme.b.bg, border: theme.b.bg }
              : MODERATOR_STYLE;
  const isFaded = fadedNodeIds?.has(node.id);
  const isNew = newNodeIds?.has(node.id);
  const isContradictionDownstream = contradictionFadedIds?.has(node.id);
  const isWalkbackDownstream = walkbackFadedIds?.has(node.id);

  const bgColor = style.bg;
  const isLightBg = node.speaker === "Moderator";
  const textColor = isLightBg ? "#1e293b" : "#fff";
  const shouldFadeOpacity = isFaded;

  const contradictsId      = node.metadata?.contradicts || null;
  const contradictedById   = contradictedByMap?.get(node.id) || null;
  const movesGoalpostsFrom = node.metadata?.moves_goalposts_from || null;
  const walkedBackById     = walkedBackByMap?.get(node.id) || null;

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
          "--glow-color": style.border,
          color: textColor,
          // Neutral-active CSS custom properties cascade to all child elements.
          // Moderator cards are light-bg; speaker cards are always color-bg.
          "--na-text":   textColor,
          "--na-bg":     isLightBg ? "rgba(0,0,0,0.12)"    : "rgba(0,0,0,0.50)",
          "--na-border": isLightBg ? "rgba(0,0,0,0.20)"    : "rgba(255,255,255,0.35)",
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

        {/* Contradiction / goalpost chips — primary and downstream nodes */}
        {contradictsId && (
          <div className="node-flag-chip node-flag-chip--contradiction">⚠ CONTRADICTS {nodeChipLabel(contradictsId)}</div>
        )}
        {contradictedById && (
          <div className="node-flag-chip node-flag-chip--contradiction">⚠ CONTRADICTED BY {nodeChipLabel(contradictedById)}</div>
        )}
        {movesGoalpostsFrom && (
          <div className="node-flag-chip node-flag-chip--contradiction">⤳ MOVES GOALPOST OF {nodeChipLabel(movesGoalpostsFrom)}</div>
        )}
        {walkedBackById && (
          <div className="node-flag-chip node-flag-chip--contradiction">⤳ GOALPOST MOVED BY {nodeChipLabel(walkedBackById)}</div>
        )}
        {isContradictionDownstream && (
          <div className="node-flag-chip node-flag-chip--contradiction">⚠ DOWNSTREAM OF CONTRADICTION</div>
        )}
        {isWalkbackDownstream && (
          <div className="node-flag-chip node-flag-chip--contradiction">⤳ DOWNSTREAM OF GOALPOST MOVE</div>
        )}

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
              ? `${speakerName(node.metadata.agreed_by.speaker, theme)} conceded ${speakerName(node.speaker, theme)}'s point`
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
                  newNodeIds={newNodeIds}
                  theme={theme}
                  contradictedByMap={contradictedByMap}
                  walkedBackByMap={walkedBackByMap}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

export default function MapTreeView({ nodes, edges, currentSpeaker, onRate, onNodeClick, loading, fadedNodeIds, contradictionFadedIds, walkbackFadedIds, newNodeIds, theme }) {
  const trees = useMemo(() => buildTree(nodes, edges), [nodes, edges]);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const contradictedByMap = useMemo(() => {
    const map = new Map();
    for (const node of nodes) {
      if (node.metadata?.contradicts) map.set(node.metadata.contradicts, node.id);
    }
    return map;
  }, [nodes]);

  const walkedBackByMap = useMemo(() => {
    const map = new Map();
    for (const node of nodes) {
      if (node.metadata?.moves_goalposts_from) map.set(node.metadata.moves_goalposts_from, node.id);
    }
    return map;
  }, [nodes]);

  const onToggle = (nodeId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  if (nodes.length === 0) {
    return (
      <p className="empty-message" style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        color: theme?.dark ? "#f1f5f9" : "#0f172a",
      }}>
        No statements yet.
      </p>
    );
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
            newNodeIds={newNodeIds}
            theme={theme}
            contradictedByMap={contradictedByMap}
            walkedBackByMap={walkedBackByMap}
          />
        ))}
      </ul>
    </div>
  );
}
