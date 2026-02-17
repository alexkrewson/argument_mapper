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
      "text-max-width": "160px",
      "font-size": "12px",
      "text-valign": "center",
      "text-halign": "center",
      width: 180,
      height: 70,
      shape: "roundrectangle",
      "background-color": "#f8fafc",
      "border-width": 2,
      "border-color": "#94a3b8",
      padding: "10px",
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
  {
    selector: 'node[type = "objection"]',
    style: {
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
  // --- Agreed-upon nodes (thumbs up) get a gold glow ---
  {
    selector: 'node[rating = "up"]',
    style: {
      "border-color": "#f59e0b",
      "border-width": 3,
      "background-color": "#fffbeb",
      "shadow-blur": 12,
      "shadow-color": "#f59e0b",
      "shadow-opacity": 0.4,
      "shadow-offset-x": 0,
      "shadow-offset-y": 0,
    },
  },
  // --- Base edge style ---
  {
    selector: "edge",
    style: {
      label: "data(label)",
      "font-size": "9px",
      "text-rotation": "autorotate",
      "text-margin-y": -10,
      "curve-style": "taxi",
      "taxi-direction": "vertical",
      "target-arrow-shape": "triangle",
      "arrow-scale": 1.2,
      width: 2,
      "line-color": "#94a3b8",
      "target-arrow-color": "#94a3b8",
    },
  },
  // --- Relationship colors ---
  {
    selector: 'edge[relationship = "supports"]',
    style: { "line-color": "#22c55e", "target-arrow-color": "#22c55e" },
  },
  {
    selector: 'edge[relationship = "strongly_supports"]',
    style: { "line-color": "#15803d", "target-arrow-color": "#15803d", width: 3 },
  },
  {
    selector: 'edge[relationship = "opposes"]',
    style: { "line-color": "#ef4444", "target-arrow-color": "#ef4444" },
  },
  {
    selector: 'edge[relationship = "refutes"]',
    style: { "line-color": "#b91c1c", "target-arrow-color": "#b91c1c", width: 3 },
  },
  {
    selector: 'edge[relationship = "clarifies"]',
    style: { "line-color": "#3b82f6", "target-arrow-color": "#3b82f6", "line-style": "dashed" },
  },
  {
    selector: 'edge[relationship = "rebuts"]',
    style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b" },
  },
];

function runLayout(cy) {
  cy.layout({
    name: "dagre",
    rankDir: "BT",
    nodeSep: 60,
    rankSep: 100,
    padding: 40,
    animate: true,
    animationDuration: 300,
    fit: true,
    nodeDimensionsIncludeLabels: true,
  }).run();
}

export default function ArgumentMap({ nodes, edges, onNodeClick }) {
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
      maxZoom: 2.5,
      minZoom: 0.2,
    });

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

  // Update elements and re-run layout whenever nodes/edges change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const newElements = [
      ...nodes.map((node) => ({
        group: "nodes",
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
        group: "edges",
        data: {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          label: edge.relationship,
          relationship: edge.relationship,
        },
      })),
    ];

    // Diff and update: remove old, add new, update existing
    cy.elements().remove();
    cy.add(newElements);

    if (cy.nodes().length > 0) {
      runLayout(cy);
    }
  }, [nodes, edges]);

  return (
    <div className="argument-map">
      {nodes.length === 0 && (
        <p style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", color: "#94a3b8"
        }}>
          Submit a statement to start building the argument map.
        </p>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
