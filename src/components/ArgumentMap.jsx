/**
 * ArgumentMap.jsx — Cytoscape.js graph visualization of the argument map.
 *
 * Takes nodes and edges from the spec v1.0 map and renders them as an interactive graph.
 * Color coding:
 *   - Blue (#3b82f6) for User A nodes
 *   - Green (#22c55e) for User B nodes
 *   - Red border for flagged/vetoed nodes
 * Node shapes by type:
 *   - claim → roundrectangle (bold border)
 *   - premise → roundrectangle
 *   - evidence → barrel
 *   - objection → octagon
 *   - rebuttal → hexagon
 *   - clarification → ellipse (dashed border)
 * Edge colors by relationship:
 *   - supports → green, strongly_supports → dark green (thick)
 *   - opposes → red, refutes → dark red (thick)
 *   - clarifies → blue (dashed)
 *   - rebuts → orange
 *
 * Each node has a small ID badge in its top-left corner via cytoscape-node-html-label.
 */

import { useCallback } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from "cytoscape";
import nodeHtmlLabel from "cytoscape-node-html-label";
import { TACTICS } from "../utils/tactics.js";

// Register the HTML label extension (idempotent check)
if (typeof cytoscape("core", "nodeHtmlLabel") === "undefined") {
  nodeHtmlLabel(cytoscape);
}

export default function ArgumentMap({ nodes, edges }) {
  // Convert our map format into Cytoscape's element format.
  const elements = [
    ...nodes.map((node) => ({
      data: {
        id: node.id,
        label: node.content,
        speaker: node.speaker,
        type: node.type,
        rating: node.rating,
        tactics: node.metadata?.tactics || [],
      },
    })),
    ...edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.relationship,
        relationship: edge.relationship,
      },
    })),
  ];

  // Configure HTML labels when cytoscape instance is ready
  const cyRef = useCallback((cy) => {
    if (!cy) return;
    cy.nodeHtmlLabel([
      {
        query: "node",
        halign: "left",
        valign: "top",
        halignBox: "left",
        valignBox: "top",
        tpl: (data) => {
          const tacticSymbols = (data.tactics || [])
            .filter((key) => TACTICS[key])
            .map((key) => `<span title="${TACTICS[key].name}" style="cursor:default;">${TACTICS[key].symbol}</span>`)
            .join("");
          return `<span style="
            font-size: 8px;
            font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
            background: rgba(255,255,255,0.85);
            border: 1px solid #94a3b8;
            border-radius: 3px;
            padding: 0px 3px;
            color: #475569;
            pointer-events: none;
            white-space: nowrap;
          ">${data.id}${data.rating === 'up' ? ' \u{1F44D}' : data.rating === 'down' ? ' \u{1F44E}' : ''}${tacticSymbols ? ' ' + tacticSymbols : ''}</span>`;
        },
      },
    ]);
  }, []);

  // Cytoscape stylesheet
  const stylesheet = [
    // --- Base node style ---
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-wrap": "wrap",
        "text-max-width": "120px",
        "font-size": "11px",
        "text-valign": "center",
        "text-halign": "center",
        width: 140,
        height: 60,
        shape: "roundrectangle",
        "background-color": "#e2e8f0",
        "border-width": 2,
        "border-color": "#94a3b8",
        padding: "8px",
      },
    },
    // --- Node type shapes ---
    {
      selector: 'node[type = "claim"]',
      style: {
        shape: "roundrectangle",
        "border-width": 3,
        "font-weight": "bold",
      },
    },
    {
      selector: 'node[type = "premise"]',
      style: {
        shape: "roundrectangle",
      },
    },
    {
      selector: 'node[type = "evidence"]',
      style: {
        shape: "barrel",
      },
    },
    {
      selector: 'node[type = "objection"]',
      style: {
        shape: "octagon",
      },
    },
    {
      selector: 'node[type = "rebuttal"]',
      style: {
        shape: "hexagon",
      },
    },
    {
      selector: 'node[type = "clarification"]',
      style: {
        shape: "ellipse",
        "border-style": "dashed",
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
    // --- Base edge style ---
    {
      selector: "edge",
      style: {
        label: "data(label)",
        "font-size": "10px",
        "text-rotation": "autorotate",
        "curve-style": "bezier",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.2,
        width: 2,
        "line-color": "#94a3b8",
        "target-arrow-color": "#94a3b8",
      },
    },
    // --- Relationship styles ---
    {
      selector: 'edge[relationship = "supports"]',
      style: {
        "line-color": "#22c55e",
        "target-arrow-color": "#22c55e",
      },
    },
    {
      selector: 'edge[relationship = "strongly_supports"]',
      style: {
        "line-color": "#15803d",
        "target-arrow-color": "#15803d",
        width: 3,
      },
    },
    {
      selector: 'edge[relationship = "opposes"]',
      style: {
        "line-color": "#ef4444",
        "target-arrow-color": "#ef4444",
      },
    },
    {
      selector: 'edge[relationship = "refutes"]',
      style: {
        "line-color": "#b91c1c",
        "target-arrow-color": "#b91c1c",
        width: 3,
      },
    },
    {
      selector: 'edge[relationship = "clarifies"]',
      style: {
        "line-color": "#3b82f6",
        "target-arrow-color": "#3b82f6",
        "line-style": "dashed",
      },
    },
    {
      selector: 'edge[relationship = "rebuts"]',
      style: {
        "line-color": "#f59e0b",
        "target-arrow-color": "#f59e0b",
      },
    },
  ];

  // Layout algorithm — "cose" gives a nice force-directed layout.
  const layout = {
    name: "cose",
    animate: true,
    animationDuration: 500,
    nodeRepulsion: () => 8000,
    idealEdgeLength: () => 150,
    padding: 30,
  };

  // Show a placeholder when there are no nodes yet
  if (nodes.length === 0) {
    return (
      <div className="argument-map empty">
        <p>Submit a statement to start building the argument map.</p>
      </div>
    );
  }

  return (
    <div className="argument-map">
      <CytoscapeComponent
        elements={elements}
        stylesheet={stylesheet}
        layout={layout}
        style={{ width: "100%", height: "100%" }}
        userZoomingEnabled={true}
        userPanningEnabled={true}
        boxSelectionEnabled={false}
        cy={cyRef}
      />
    </div>
  );
}
