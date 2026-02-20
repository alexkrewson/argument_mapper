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

function buildStylesheet(theme) {
  const a = theme.a, b = theme.b;
  const dark = !!theme.dark;
  return [
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
        color: dark ? "#e2e8f0" : "#1e293b",
        "background-color": dark ? "#1e293b" : "#f8fafc",
        "border-width": 0,
        "font-weight": "bold",
        padding: "26px",
      },
    },
    // --- Node types ---
    {
      selector: 'node[type = "claim"]',
      style: { "font-size": "13px" },
    },
    // --- Speaker colors (internal IDs are always "Blue"/"Green") ---
    {
      selector: 'node[speaker = "Blue"]',
      style: { "background-color": a.bg, "color": "#fff" },
    },
    {
      selector: 'node[speaker = "Green"]',
      style: { "background-color": b.bg, "color": "#fff" },
    },
    {
      selector: 'node[speaker = "Moderator"]',
      style: { "background-color": dark ? "#2e1065" : "#ede9fe", "border-color": dark ? "#64748b" : "#94a3b8" },
    },
    // --- Faded nodes ---
    { selector: "node.faded", style: { opacity: 0.25 } },
    { selector: "edge.faded", style: { opacity: 0.25 } },
    // --- Contradiction/walkback colored backgrounds ---
    { selector: "node.contradiction-faded", style: { "background-color": dark ? "#450a0a" : "#fee2e2" } },
    { selector: "node.walkback-faded",      style: { "background-color": dark ? "#431407" : "#ffedd5" } },
    // --- Contradiction borders ---
    {
      selector: "node.contradiction-border",
      style: {
        "background-color": dark ? "#450a0a" : "#fee2e2",
        "border-color": "#dc2626",
        "border-style": "dashed",
        "border-dash-pattern": [6, 4],
        "border-width": 3,
        opacity: 1,
      },
    },
    {
      selector: 'node.contradiction-border[speaker = "Blue"]',
      style: { "outline-color": a.border, "outline-width": 3, "outline-style": "solid", "outline-offset": 3 },
    },
    {
      selector: 'node.contradiction-border[speaker = "Green"]',
      style: { "outline-color": b.border, "outline-width": 3, "outline-style": "solid", "outline-offset": 3 },
    },
    // --- Walkback borders ---
    {
      selector: "node.walkback-border",
      style: {
        "background-color": dark ? "#431407" : "#ffedd5",
        "border-color": "#f97316",
        "border-style": "dashed",
        "border-dash-pattern": [6, 4],
        "border-width": 3,
        opacity: 1,
      },
    },
    {
      selector: 'node.walkback-border[speaker = "Blue"]',
      style: { "outline-color": a.border, "outline-width": 3, "outline-style": "solid", "outline-offset": 3 },
    },
    {
      selector: 'node.walkback-border[speaker = "Green"]',
      style: { "outline-color": b.border, "outline-width": 3, "outline-style": "solid", "outline-offset": 3 },
    },
    // --- Base edge style ---
    {
      selector: "edge",
      style: {
        "curve-style": "straight",
        "target-arrow-shape": "none",
        "source-arrow-shape": "none",
        width: 2,
        "line-color": "#94a3b8",
      },
    },
  ];
}

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
 * Single child directly above parent → straight vertical line (no bends).
 * Single child offset horizontally → same orthogonal routing as multi-child.
 */
function applyEdgeCurves(cy) {
  const byTarget = new Map();
  cy.edges().forEach((edge) => {
    const id = edge.target().id();
    if (!byTarget.has(id)) byTarget.set(id, []);
    byTarget.get(id).push(edge);
  });

  byTarget.forEach((siblings) => {
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

      // Single child: use straight line unless significantly offset horizontally.
      // Small offsets produce distracting rectangular jogs — straight looks cleaner.
      if (siblings.length === 1 && Math.abs(sx - tx) < 40) {
        edge.style({ "curve-style": "straight" });
        return;
      }

      const ux = dx / L, uy = dy / L;
      const nx = -uy,    ny =  ux;

      // W1: exit child vertically to rail (same x as child)
      // W2: horizontal to parent's x at rail — all siblings converge here
      // The segment from W2 to parent is purely vertical (W2.x == parent.x),
      // so the edge enters the parent from its bottom center.
      const toSeg = (Wx, Wy) => {
        const rx = Wx - sx, ry = Wy - sy;
        return { w: (rx * ux + ry * uy) / L, d: rx * nx + ry * ny };
      };

      const s1 = toSeg(sx, railY);   // W1 — child exits top
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

function pulseNode(el, color) {
  el.animate({
    style: { "outline-color": color, "outline-width": 10, "outline-opacity": 0.75, "outline-offset": 3 },
    duration: 1500,
    easing: "ease-in-out",
    complete: () => {
      el.animate({
        style: { "outline-width": 0, "outline-opacity": 0 },
        duration: 1500,
        easing: "ease-in-out",
      });
    },
  });
}

// Heights of the fixed overlays (header + tab bar, and footer input area).
// We always reserve this space so nodes are never hidden behind them,
// even when the UI is slid away.
const HEADER_H = 90;   // matches .app-top-spacer height in CSS
const FOOTER_H = 110;  // approximate .app-footer height
const SIDE_PAD = 30;   // left/right breathing room

function fitToSafeZone(cy) {
  const eles = cy.elements();
  if (eles.length === 0) return;
  const bb = eles.boundingBox();
  const W = cy.width();
  const H = cy.height();
  const safeW = W - 2 * SIDE_PAD;
  const safeH = H - HEADER_H - FOOTER_H;
  if (safeW <= 0 || safeH <= 0) return;

  const zoom = Math.min(
    safeW  / (bb.w + 60),
    safeH  / (bb.h + 60),
    2
  );
  const modelCx  = (bb.x1 + bb.x2) / 2;
  const modelCy  = (bb.y1 + bb.y2) / 2;
  const screenCx = SIDE_PAD + safeW / 2;
  const screenCy = HEADER_H + safeH / 2;

  cy.animate({
    zoom,
    pan: { x: screenCx - modelCx * zoom, y: screenCy - modelCy * zoom },
    duration: 250,
    easing: "ease-in-out",
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
    fit: false, // fitToSafeZone handles viewport after animation
  });
  layout.one("layoutstop", () => {
    applyEdgeCurves(cy);
    // Wait for node animations to settle, then fit to the safe zone
    // (excluding the header and footer overlay areas).
    setTimeout(() => {
      fitToSafeZone(cy);
      if (onDone) onDone();
    }, 320);
  });
  layout.run();
}

export default function ArgumentMap({ nodes, edges, onNodeClick, fadedNodeIds, contradictionFadedIds, walkbackFadedIds, contradictionBorderIds, walkbackBorderIds, newNodeIds, onToggleUI, theme }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onToggleUIRef = useRef(onToggleUI);
  useEffect(() => { onToggleUIRef.current = onToggleUI; }, [onToggleUI]);
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Initialize cytoscape once
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: buildStylesheet(themeRef.current),
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
            .map((key) => `<span title="${TACTICS[key].name}" style="cursor:default;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.25);border-radius:3px;padding:1px 4px;font-size:10px;">${TACTICS[key].symbol}</span>`)
            .join("");
          const typeBadge = data.type
            ? `<span class="type-badge type-${data.type}">${data.type}</span>`
            : "";
          return `<div style="display:flex;gap:3px;align-items:center;flex-wrap:nowrap;pointer-events:none;overflow:hidden;transform:translate(-26px,-26px);margin:6px 0 0 6px;opacity:${data.faded ? 0.25 : 1};">
            <span class="node-id-badge">${data.id}</span>
            ${typeBadge}
            ${tacticSymbols ? `<span style="display:flex;gap:2px;">${tacticSymbols}</span>` : ''}
          </div>`;
        },
      },
    ]);

    // ── Touch gesture state machine ────────────────────────────────────────
    // States: idle | first-down | awaiting-second | second-down | drag-zoom
    // Gestures:
    //   single tap on background  → toggle header/footer (UI)
    //   1-finger quick double-tap → zoom in ×2.5 centred on tap point
    //   1-finger double-tap+hold → drag down=zoom-in, up=zoom-out
    //   2-finger double-tap      → zoom out ×0.4
    const DOUBLE_TAP_MS  = 300;  // window between two taps
    const HOLD_MS        = 180;  // hold duration before drag-zoom activates
    const ZOOM_SENS      = 0.015; // zoom factor per pixel dragged

    const g = {
      state: "idle",
      tapDownTime: 0, lastLiftTime: 0,
      tapClientX: 0,  tapClientY: 0,
      holdTimer: null, singleTapTimer: null,
      dragStartY: 0,  dragStartZoom: 1,
    };

    function rendPos(clientX, clientY) {
      const r = containerRef.current.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    }

    function zoomToPoint(newZoom, rx, ry) {
      const z0 = cy.zoom(), p0 = cy.pan();
      const gx = (rx - p0.x) / z0, gy = (ry - p0.y) / z0;
      cy.animate({
        zoom: newZoom,
        pan: { x: rx - gx * newZoom, y: ry - gy * newZoom },
        duration: 300, easing: "ease-in-out",
      });
    }

    function onTouchStart(e) {
      const now = Date.now();
      const nf  = e.touches.length;
      const dt  = now - g.lastLiftTime;

      if (g.state === "awaiting-second" && dt < DOUBLE_TAP_MS) {
        // ── Second tap detected ──
        clearTimeout(g.singleTapTimer);
        e.preventDefault();
        e.stopImmediatePropagation();

        if (nf === 1) {
          g.state      = "second-down";
          g.tapClientX = e.touches[0].clientX;
          g.tapClientY = e.touches[0].clientY;
          g.dragStartY = e.touches[0].clientY;
          g.dragStartZoom = cy.zoom();
          g.tapDownTime   = now;
          g.holdTimer = setTimeout(() => { g.state = "drag-zoom"; }, HOLD_MS);
        } else if (nf === 2) {
          // Two-finger double-tap → zoom out
          g.state = "idle";
          cy.animate({ zoom: Math.max(cy.minZoom(), cy.zoom() * 0.4), duration: 300, easing: "ease-in-out" });
        }
      } else {
        // ── First tap (or stale gap) ──
        clearTimeout(g.singleTapTimer);
        clearTimeout(g.holdTimer);
        g.state       = "first-down";
        g.tapDownTime = now;
        if (nf === 1) {
          g.tapClientX = e.touches[0].clientX;
          g.tapClientY = e.touches[0].clientY;
        }
      }
    }

    function onTouchMove(e) {
      if (g.state === "second-down") {
        const dx = Math.abs(e.touches[0].clientX - g.tapClientX);
        const dy = Math.abs(e.touches[0].clientY - g.tapClientY);
        if (dx > 8 || dy > 8) { clearTimeout(g.holdTimer); g.state = "idle"; }
      } else if (g.state === "drag-zoom") {
        e.preventDefault();
        e.stopImmediatePropagation();
        const delta   = e.touches[0].clientY - g.dragStartY; // +down = zoom in
        const newZoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(),
          g.dragStartZoom * Math.exp(delta * ZOOM_SENS)));
        const { x, y } = rendPos(g.tapClientX, g.tapClientY);
        cy.zoom({ level: newZoom, renderedPosition: { x, y } });
      }
    }

    function onTouchEnd(e) {
      const now = Date.now();
      if (g.state === "first-down") {
        if (now - g.tapDownTime < DOUBLE_TAP_MS) {
          // Quick lift — start window for second tap
          g.state        = "awaiting-second";
          g.lastLiftTime = now;
          g.singleTapTimer = setTimeout(() => {
            g.state = "idle";
            // Single tap confirmed — toggle UI (touch path)
            onToggleUIRef.current?.();
          }, DOUBLE_TAP_MS);
        } else {
          g.state = "idle";
        }
      } else if (g.state === "second-down") {
        clearTimeout(g.holdTimer);
        e.preventDefault();
        e.stopImmediatePropagation();
        g.state = "idle";
        // Quick second tap — zoom in
        const { x, y } = rendPos(g.tapClientX, g.tapClientY);
        zoomToPoint(Math.min(cy.maxZoom(), cy.zoom() * 2.5), x, y);
      } else if (g.state === "drag-zoom") {
        g.state = "idle";
      }
    }

    const el = containerRef.current;
    el.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    el.addEventListener("touchmove",  onTouchMove,  { capture: true, passive: false });
    el.addEventListener("touchend",   onTouchEnd,   { capture: true, passive: false });

    cyRef.current = cy;

    return () => {
      el.removeEventListener("touchstart", onTouchStart, { capture: true });
      el.removeEventListener("touchmove",  onTouchMove,  { capture: true });
      el.removeEventListener("touchend",   onTouchEnd,   { capture: true });
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Wire up node tap → onNodeClick; background mouse-click → toggleUI (desktop)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const nodeHandler = (evt) => {
      const data = evt.target.data();
      const node = nodes.find((n) => n.id === data.id);
      if (node) onNodeClick?.(node);
    };
    cy.on("tap", "node", nodeHandler);

    // Desktop only: background tap toggles UI (touch is handled by native gesture machine)
    const bgHandler = (evt) => {
      if (evt.target === cy && !evt.originalEvent?.changedTouches?.length) {
        onToggleUI?.();
      }
    };
    cy.on("tap", bgHandler);

    return () => {
      cy.off("tap", "node", nodeHandler);
      cy.off("tap", bgHandler);
    };
  }, [onNodeClick, onToggleUI, nodes]);

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

  // Theme stylesheet is baked in at init time (buildStylesheet(themeRef.current)).
  // App.jsx passes key={themeKey} so this component remounts on every theme change,
  // giving a fresh cy with the correct stylesheet — no in-place cy.style() call
  // needed (which would trigger resetToDefault() and corrupt the renderer).

  // Pulse new nodes after layout settles — kept separate so clearing newNodeIds
  // doesn't re-trigger the layout above.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !newNodeIds?.size) return;
    const timer = setTimeout(() => {
      cy.nodes()
        .filter((n) => newNodeIds.has(n.id()))
        .forEach((el) => {
          const spk = el.data("speaker");
          const color = spk === "Blue"  ? theme.a.bg
                      : spk === "Green" ? theme.b.bg
                      : "#94a3b8";
          pulseNode(el, color);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [newNodeIds, theme]);

  return (
    <div className="argument-map">
      {nodes.length === 0 && (
        <p style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          color: theme.dark ? "#f1f5f9" : "#0f172a",
        }}>
          No statements yet.
        </p>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
