/**
 * ArgumentMap.jsx — Cytoscape.js graph visualization of the argument map.
 *
 * Takes nodes and edges from the map JSON and renders them as an interactive graph.
 * Color coding:
 *   - Blue (#3b82f6) for User A nodes
 *   - Green (#22c55e) for User B nodes
 *   - Red border for flagged/vetoed nodes
 *   - Edge colors: green for "supports", red for "opposes", orange for "qualifies"
 */

import CytoscapeComponent from "react-cytoscapejs";

export default function ArgumentMap({ nodes, edges }) {
  // Convert our map format into Cytoscape's element format.
  // Cytoscape expects { data: { id, label, ... } } for each element.
  const elements = [
    // Map our nodes to Cytoscape node format
    ...nodes.map((node) => ({
      data: {
        id: node.id,
        label: node.claim,
        speaker: node.speaker,
        flagged: node.flagged,
      },
    })),
    // Map our edges to Cytoscape edge format
    ...edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
      },
    })),
  ];

  // Cytoscape stylesheet — controls how nodes and edges look.
  const stylesheet = [
    {
      // Base node style
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
    {
      // User A nodes — blue
      selector: 'node[speaker = "User A"]',
      style: {
        "background-color": "#dbeafe",
        "border-color": "#3b82f6",
      },
    },
    {
      // User B nodes — green
      selector: 'node[speaker = "User B"]',
      style: {
        "background-color": "#dcfce7",
        "border-color": "#22c55e",
      },
    },
    {
      // Flagged/vetoed nodes — red border, dimmed
      selector: "node[?flagged]",
      style: {
        "border-color": "#ef4444",
        "border-width": 3,
        "border-style": "dashed",
        opacity: 0.5,
      },
    },
    {
      // Base edge style
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
    {
      // "supports" edges — green
      selector: 'edge[label = "supports"]',
      style: {
        "line-color": "#22c55e",
        "target-arrow-color": "#22c55e",
      },
    },
    {
      // "opposes" edges — red
      selector: 'edge[label = "opposes"]',
      style: {
        "line-color": "#ef4444",
        "target-arrow-color": "#ef4444",
      },
    },
    {
      // "qualifies" edges — orange
      selector: 'edge[label = "qualifies"]',
      style: {
        "line-color": "#f59e0b",
        "target-arrow-color": "#f59e0b",
      },
    },
  ];

  // Layout algorithm — "cose" gives a nice force-directed layout.
  // It automatically positions nodes to minimize edge crossing.
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
        // Disable user editing of the graph (it's display-only)
        userZoomingEnabled={true}
        userPanningEnabled={true}
        boxSelectionEnabled={false}
      />
    </div>
  );
}
