/**
 * ArgumentMap.jsx — Cytoscape.js graph visualization of the argument map.
 *
 * Uses dagre for hierarchical top-down layout (claims on top, supporting
 * arguments below) similar to standard argument map diagrams.
 *
 * Each node has a small ID badge in its top-left corner via cytoscape-node-html-label.
 */

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import nodeHtmlLabel from "cytoscape-node-html-label";
import dagre from "cytoscape-dagre";
import { TACTICS } from "../utils/tactics.js";

// Register extensions once
if (typeof cytoscape("core", "nodeHtmlLabel") === "undefined") {
  nodeHtmlLabel(cytoscape);
}
if (typeof cytoscape("layout", "dagre") === "undefined") {
  cytoscape.use(dagre);
}

const stylesheet = [
  // --- Base node style ---
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-wrap": "wrap",
      "text-max-width": "200px",
      "font-size": "12px",
      "text-valign": "center",
      "text-halign": "center",
      "text-margin-y": 13,
      width: "label",
      "min-width": "160px",
      height: "label",
      shape: "roundrectangle",
      "background-color": "#f8fafc",
      "border-width": 2,
      "border-color": "#94a3b8",
      padding: "26px",
    },
  },
  // --- Node types ---
  {
    selector: 'node[type = "claim"]',
    style: {
      "border-width": 3,
      "font-weight": "bold",
      "font-size": "13px",
    },
  },
  // --- Speaker colors ---
  {
    selector: 'node[speaker = "User A"]',
    style: {
      "background-color": "#dbeafe",
      "border-color": "#3b82f6",
    },
  },
  {
    selector: 'node[speaker = "User B"]',
    style: {
      "background-color": "#dcfce7",
      "border-color": "#22c55e",
    },
  },
  {
    selector: 'node[speaker = "Moderator"]',
    style: {
      "background-color": "#ede9fe",
      "border-color": "#8b5cf6",
    },
  },
  // --- Faded nodes (opacity — agreed-upon/retracted + their supporters) ---
  {
    selector: "node.faded",
    style: { opacity: 0.25 },
  },
  {
    selector: "edge.faded",
    style: { opacity: 0.25 },
  },
  // --- Contradiction/walkback colored backgrounds (after speaker colors to override) ---
  {
    selector: "node.contradiction-faded",
    style: { "background-color": "#fee2e2" },
  },
  {
    selector: "node.walkback-faded",
    style: { "background-color": "#ffedd5" },
  },
  // --- Contradiction borders: dashed red border + speaker-colored outline ring ---
  {
    selector: "node.contradiction-border",
    style: {
      "background-color": "#fee2e2",
      "border-color": "#dc2626",
      "border-style": "dashed",
      "border-dash-pattern": [6, 4],
      "border-width": 3,
      opacity: 1,
    },
  },
  {
    selector: 'node.contradiction-border[speaker = "User A"]',
    style: { "outline-color": "#3b82f6", "outline-width": 3, "outline-style": "solid", "outline-offset": 3 },
  },
  {
    selector: 'node.contradiction-border[speaker = "User B"]',
    style: { "outline-color": "#22c55e", "outline-width": 3, "outline-style": "solid", "outline-offset": 3 },
  },
  // --- Walkback borders: dashed orange border + speaker-colored outline ring ---
  {
    selector: "node.walkback-border",
    style: {
      "background-color": "#ffedd5",
      "border-color": "#f97316",
      "border-style": "dashed",
      "border-dash-pattern": [6, 4],
      "border-width": 3,
      opacity: 1,
    },
  },
  {
    selector: 'node.walkback-border[speaker = "User A"]',
    style: { "outline-color": "#3b82f6", "outline-width": 3, "outline-style": "solid", "outline-offset": 3 },
  },
  {
    selector: 'node.walkback-border[speaker = "User B"]',
    style: { "outline-color": "#22c55e", "outline-width": 3, "outline-style": "solid", "outline-offset": 3 },
  },
  // --- Base edge style --- uniform moderator purple, no arrows, no labels ---
  {
    selector: "edge",
    style: {
      "curve-style": "straight",
      "target-arrow-shape": "none",
      "source-arrow-shape": "none",
      width: 2,
      "line-color": "#8b5cf6",
    },
  },
];

/**
 * After layout, route edges as a clean tree-diagram (org-chart) style.
 *
 * Each edge gets two waypoints:
 *   W1 = (child_x, railY)   — child exits top vertically to the shared rail
 *   W2 = (parent_x, railY)  — horizontal along the rail to the parent's x position
 *   Then the path goes straight up from W2 into the parent bottom-center.
 *
 * All siblings sharing the same parent converge at (parent_x, railY),
 * producing the classic org-chart "T-branch" look with right-angle corners.
 * Single child → straight vertical line (no bends).
 */
function applyEdgeCurves(cy) {
  const byTarget = new Map();
  cy.edges().forEach((edge) => {
    const id = edge.target().id();
    if (!byTarget.has(id)) byTarget.set(id, []);
    byTarget.get(id).push(edge);
  });

  byTarget.forEach((siblings) => {
    if (siblings.length === 1) {
      siblings[0].style({ "curve-style": "straight" });
      return;
    }

    const tgt = siblings[0].target();
    const tx  = tgt.position("x");
    const ty  = tgt.position("y");
    const th  = tgt.height();

    // Rail Y: midpoint between the topmost child's top edge and the parent's bottom edge.
    let minChildTopY = Infinity;
    siblings.forEach((e) => {
      const y = e.source().position("y") - e.source().height() / 2;
      if (y < minChildTopY) minChildTopY = y;
    });
    const railY = (minChildTopY + ty + th / 2) / 2;

    siblings.forEach((edge) => {
      const src = edge.source();
      const sx  = src.position("x");
      const sy  = src.position("y");

      const dx = tx - sx, dy = ty - sy;
      const L  = Math.sqrt(dx * dx + dy * dy);
      if (L < 1) { edge.style({ "curve-style": "straight" }); return; }

      const ux = dx / L, uy = dy / L;
      const nx = -uy,    ny =  ux;

      // W1: exit child vertically to rail (same x as child)
      // W2: horizontal to parent's x at rail — all siblings converge here
      // The segment from W2 to parent is purely vertical (W2.x == parent.x),
      // so the edge enters the parent from its bottom center. No W3 inside node needed.
      const toSeg = (Wx, Wy) => {
        const rx = Wx - sx, ry = Wy - sy;
        return { w: (rx * ux + ry * uy) / L, d: rx * nx + ry * ny };
      };

      const s1 = toSeg(sx, railY);   // W1
      const s2 = toSeg(tx, railY);   // W2 — converge at parent x

      edge.style({
        "curve-style":       "segments",
        "edge-distances":    "node-position",
        "segment-weights":   `${s1.w.toFixed(4)} ${s2.w.toFixed(4)}`,
        "segment-distances": `${s1.d.toFixed(2)} ${s2.d.toFixed(2)}`,
      });
    });
  });
}

function runLayout(cy, onDone) {
  const layout = cy.layout({
    name: "dagre",
    rankDir: "BT",
    nodeSep: 80,
    rankSep: 150,
    padding: 40,
    animate: true,
    animationDuration: 300,
    fit: true,
    nodeDimensionsIncludeLabels: true,
  });
  layout.one("layoutstop", () => {
    applyEdgeCurves(cy);
    if (onDone) onDone();
  });
  layout.run();
}

export default function ArgumentMap({ nodes, edges, onNodeClick, fadedNodeIds, contradictionFadedIds, walkbackFadedIds, contradictionBorderIds, walkbackBorderIds }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Initialize cytoscape once
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: stylesheet,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: true,
      maxZoom: 2.5,
      minZoom: 0.2,
    });

    cy.nodeHtmlLabel([
      {
        query: "node",
        halign: "left",
        valign: "top",
        halignBox: "right",
        valignBox: "bottom",
        tpl: (data) => {
          const tacticSymbols = (data.tactics || [])
            .filter((key) => TACTICS[key])
            .map((key) => `<span title="${TACTICS[key].name}" style="cursor:default;">${TACTICS[key].symbol}</span>`)
            .join("");
          const typeBadge = data.type
            ? `<span class="type-badge type-${data.type}">${data.type}</span>`
            : "";
          return `<div style="display:flex;gap:3px;align-items:center;flex-wrap:nowrap;pointer-events:none;overflow:hidden;transform:translate(-26px,-26px);margin:6px 0 0 6px;opacity:${data.faded ? 0.25 : 1};">
            <span class="node-id-badge">${data.id}</span>
            ${tacticSymbols ? `<span style="font-size:9px;">${tacticSymbols}</span>` : ''}
            ${typeBadge}
          </div>`;
        },
      },
    ]);

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Wire up node tap → onNodeClick callback
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !onNodeClick) return;

    const handler = (evt) => {
      const data = evt.target.data();
      // Find the full node object from props to include metadata
      const node = nodes.find((n) => n.id === data.id);
      if (node) onNodeClick(node);
    };
    cy.on("tap", "node", handler);
    return () => cy.off("tap", "node", handler);
  }, [onNodeClick, nodes]);

  // Update elements and re-run layout whenever nodes/edges change.
  // Uses a diff-based approach so existing nodes keep their positions and
  // the dagre layout can animate them smoothly to new positions instead of
  // flashing (remove-all + re-add-all).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const nodeDataOf = (node) => ({
      id: node.id,
      label: node.content,
      speaker: node.speaker,
      type: node.type,
      rating: node.rating,
      tactics: node.metadata?.tactics || [],
      contradicts: node.metadata?.contradicts || "",
      movesGoalpostsFrom: node.metadata?.moves_goalposts_from || "",
    });
    const edgeDataOf = (edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.relationship,
      relationship: edge.relationship,
    });

    const newNodeIds = new Set(nodes.map((n) => n.id));
    const newEdgeIds = new Set(edges.map((e) => e.id));

    cy.batch(() => {
      // Remove stale elements
      cy.nodes().filter((n) => !newNodeIds.has(n.id())).remove();
      cy.edges().filter((e) => !newEdgeIds.has(e.id())).remove();

      // Add new nodes / update existing node data
      for (const node of nodes) {
        const existing = cy.getElementById(node.id);
        if (existing.length) {
          existing.data(nodeDataOf(node));
        } else {
          cy.add({ group: "nodes", data: nodeDataOf(node) });
          // Seed new node position near a connected existing node so it
          // animates in from a natural starting point rather than (0, 0).
          const connEdge = edges.find((e) => e.from === node.id || e.to === node.id);
          if (connEdge) {
            const neighborId = connEdge.from === node.id ? connEdge.to : connEdge.from;
            const neighbor = cy.getElementById(neighborId);
            if (neighbor.length) {
              const p = neighbor.position();
              cy.getElementById(node.id).position({ x: p.x, y: p.y + 80 });
            }
          }
        }
      }

      // Add new edges / update existing edge data
      for (const edge of edges) {
        const existing = cy.getElementById(edge.id);
        if (existing.length) {
          existing.data(edgeDataOf(edge));
        } else {
          cy.add({ group: "edges", data: edgeDataOf(edge) });
        }
      }
    });

    // Apply visual classes from props (computed in App.jsx fadedInfo)
    cy.nodes().removeClass("faded contradiction-faded walkback-faded contradiction-border walkback-border");
    cy.edges().removeClass("faded");

    // Opacity fading (thumbs-up agreed / thumbs-down retracted)
    cy.nodes().forEach((n) => n.data("faded", fadedNodeIds?.has(n.id()) || false));
    if (fadedNodeIds?.size) {
      cy.nodes().filter((n) => fadedNodeIds.has(n.id())).addClass("faded");
      cy.edges().filter((e) => fadedNodeIds.has(e.source().id()) && fadedNodeIds.has(e.target().id())).addClass("faded");
    }

    // Contradiction colored backgrounds and borders
    if (contradictionBorderIds?.size) {
      cy.nodes().filter((n) => contradictionBorderIds.has(n.id())).addClass("contradiction-border");
    }
    if (contradictionFadedIds?.size) {
      cy.nodes().filter((n) => contradictionFadedIds.has(n.id()) && !contradictionBorderIds?.has(n.id())).addClass("contradiction-faded");
    }

    // Walkback colored backgrounds and borders
    if (walkbackBorderIds?.size) {
      cy.nodes().filter((n) => walkbackBorderIds.has(n.id())).addClass("walkback-border");
    }
    if (walkbackFadedIds?.size) {
      cy.nodes().filter((n) => walkbackFadedIds.has(n.id()) && !walkbackBorderIds?.has(n.id())).addClass("walkback-faded");
    }

    // Always run a full fresh layout so dagre re-centers and symmetrically
    // repositions all nodes whenever the graph structure changes.
    if (cy.nodes().length > 0) {
      runLayout(cy);
    }
  }, [nodes, edges, fadedNodeIds, contradictionFadedIds, walkbackFadedIds, contradictionBorderIds, walkbackBorderIds]);

  return (
    <div className="argument-map">
      {nodes.length === 0 && (
        <p style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", color: "#94a3b8"
        }}>
          No statements yet.
        </p>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
