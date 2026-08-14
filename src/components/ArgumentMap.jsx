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
import { fmtNodeId } from "../utils/format.js";

// Persists viewport across remounts triggered by theme key changes.
// Saved in the init-effect cleanup, restored in the first fitToSafeZone call.
let _savedViewport = null;

// Layout constants (px).
// BADGE_BASE_TOP = top/left inset for badges inside the node (the "margin" rule).
// NODE_WIDTH     = Cytoscape node width (matches stylesheet width: 260).
// BADGE_AVAIL    = usable badge row width (node minus left+right inset).
const BADGE_ROW_PX   = 16;   // rendered badge row height (fixed via height:16px on all badges)
const BADGE_BASE_TOP = 4;    // top & left inset for badge area
const NODE_WIDTH     = 260;  // must match stylesheet width
const BADGE_AVAIL    = NODE_WIDTH - 2 * BADGE_BASE_TOP;  // 252px

function estimateBadgeRows(tactics, flagPairs, nonSequitur, possibleConcession) {
  // Primary row: fixed badges (~110px) + tactic icons inline, wrapping as needed
  const primaryRows = Math.ceil((110 + (tactics?.length ?? 0) * 29) / BADGE_AVAIL);
  const chipCount   = (flagPairs?.length ?? 0) + (nonSequitur ? 1 : 0) + (possibleConcession ? 1 : 0);
  const chipRows    = chipCount ? Math.ceil(chipCount * 104 / BADGE_AVAIL) : 0;
  return primaryRows + chipRows;
}

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
  const lcars = !!theme.lcars;
  return [
    // --- Base node style ---
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-wrap": "wrap",
        "text-max-width": "208px",
        "font-size": lcars ? "11px" : "12px",
        // Spread rather than assign undefined. Cytoscape rejects an undefined
        // property value, and rejecting one can take neighbouring properties in
        // the same block down with it -- which is how every non-LCARS theme
        // ended up with stock grey ellipses: width, shape and background-color
        // all silently fell back to defaults while data() mappers still applied.
        ...(lcars && {
          "font-family": "Antonio, Arial Narrow, sans-serif",
          "text-transform": "uppercase",
        }),
        "text-valign": "center",
        "text-halign": "center",
        "text-margin-y": "data(textMarginY)",
        width: 260,
        height: "data(nodeHeight)",
        shape: "roundrectangle",
        // Speaker rules below set colour and background together; this base
        // colour is what Moderator and unmatched nodes get, so it has to work
        // against the dark background rather than assume a light one.
        color: lcars ? "#FF9900" : dark ? "#e2e8f0" : "#0f172a",
        "background-color": lcars ? "#0a0900" : dark ? "#1e293b" : "#f8fafc",
        "border-width": 0,
        "font-weight": "bold",
        padding: "4px",
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
      style: { "background-color": a.bg, "color": "#0f172a" },
    },
    {
      selector: 'node[speaker = "Green"]',
      style: { "background-color": b.bg, "color": "#0f172a" },
    },
    {
      selector: 'node[speaker = "Moderator"]',
      style: { "background-color": dark ? "#2e1065" : "#ede9fe", "border-color": dark ? "#64748b" : "#94a3b8" },
    },
    // --- Faded nodes ---
    { selector: "node.faded", style: { opacity: 0.25 } },
    { selector: "edge.faded", style: { opacity: 0.25 } },
    { selector: "node.non-sequitur", style: { "border-width": 3, "border-color": "#dc2626" } },
    // --- Base edge style ---
    {
      selector: "edge",
      style: {
        "curve-style": "straight",
        "target-arrow-shape": "none",
        "source-arrow-shape": "none",
        width: 2,
        "line-color": lcars ? "#FF9900" : "#94a3b8",
        opacity: lcars ? 0.35 : 1,
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
// cy.height() is app-main height (spacer already excluded from flex layout).
// No header overlay inside cy container — just a small top breathing room.
const HEADER_H = 12;
const SIDE_PAD = 30;

function fitToSafeZone(cy) {
  const eles = cy.elements();
  if (eles.length === 0) return;
  const bb = eles.boundingBox();
  const W = cy.width();
  const H = cy.height();
  // Measure the actual footer height so we respect both collapsed and expanded states
  const footerEl = document.querySelector(".app-footer");
  const footerH = footerEl ? footerEl.offsetHeight : 130;
  const safeW = W - 2 * SIDE_PAD;
  const safeH = H - HEADER_H - footerH;
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
    duration: 200,
    easing: "ease-in-out",
  });
}

function runLayout(cy, onDone) {
  const layout = cy.layout({
    name: "dagre",
    rankDir: "BT",
    nodeSep: 80,
    rankSep: 75,
    padding: 40,
    animate: false,
    fit: false,
  });
  layout.one("layoutstop", () => {
    applyEdgeCurves(cy);
    // Defer to the next paint frame: on the very first render (e.g. loading a
    // debate with content already present at mount) the container hasn't been
    // laid out yet, so cy.width()/height() can read stale/zero here even
    // though a resize() call is made — causing fitToSafeZone's zoom/pan to
    // silently no-op and leaving the viewport at cytoscape's raw defaults.
    requestAnimationFrame(() => {
      cy.resize(); // re-measure container in case it was display:none when last resized
      fitToSafeZone(cy);
      if (onDone) onDone();
    });
  });
  layout.run();
}

export default function ArgumentMap({ nodes, edges, onNodeClick, fadedNodeIds, contradictionFadedIds, walkbackFadedIds, newNodeIds, onToggleUI, theme }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onToggleUIRef = useRef(onToggleUI);
  useEffect(() => { onToggleUIRef.current = onToggleUI; }, [onToggleUI]);
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);


  // buildStylesheet reads exactly four things off the theme: the two speaker
  // backgrounds and the dark/lcars flags. Never a name. But the `theme` prop is
  // App's resolvedTheme, which is rebuilt whenever playerNames changes -- so it
  // gets a fresh identity on every keystroke in the speaker-name field, and on
  // every press of the shuffle button.
  //
  // Re-applying the stylesheet on those is not merely wasteful, it is fatal:
  // swapping cytoscape's Style instance out from under elements that are
  // already rendered leaves them computing stock defaults -- grey ellipses,
  // 30px wide -- permanently. The sheet still reads back correctly, no bypass
  // is set on the element, and neither style().update() nor re-applying the
  // sheet brings them back. Only the data() mappers survive, which is why the
  // ovals keep their per-node height and look deceptively deliberate.
  //
  // So key the effects on the VALUES the stylesheet is built from. A rename is
  // then a no-op here, which it always should have been.
  const styleKey = `${!!theme.dark}|${!!theme.lcars}|${theme.a.bg}|${theme.b.bg}`;

  // tplRef holds the badge template function. It's updated on every render so
  // that HMR-patched code takes effect immediately without needing a remount.
  const tplRef = useRef(null);
  {
    const fmtId = fmtNodeId;
    const cs = (color) => `background:${color};color:#fff;border-radius:3px;padding:0 5px;font-size:9px;font-weight:800;letter-spacing:0.05em;white-space:nowrap;border:1.5px solid rgba(0,0,0,0.4);display:inline-flex;align-items:center;height:16px;box-sizing:border-box;`;
    const rowStyle = `display:flex;gap:3px;align-items:center;flex-wrap:wrap;`;
    // Reassigned during render on purpose -- see the note above: it's what makes
    // HMR-patched template code take effect without remounting the graph.
    // eslint-disable-next-line react-hooks/refs
    tplRef.current = (data) => {
      const theme = themeRef.current;
      // Plugin: translate(0%,-100%) translate(node.left, node.top)
      // With an absolutely-positioned child, _node collapses to zero height so
      // translate(0%,-100%) = translate(0,0). _node's origin lands at (node.left, node.top).
      // The badge div with position:absolute;top/left:BADGE_BASE_TOP is therefore
      // always exactly BADGE_BASE_TOP inside the node's top-left corner — no dependency
      // on matching BADGE_ROW_PX to actual CSS-rendered row height.
      const GAP = 2; // flex gap between rows

      const spkName  = data.speaker === "Blue"  ? theme.a.name
                     : data.speaker === "Green" ? theme.b.name : "Mod";
      const spkColor = data.speaker === "Blue"  ? theme.a.border
                     : data.speaker === "Green" ? theme.b.border : "#64748b";

      // Row 1 (primary) — node id + speaker + type + tactic icons, wrapping as needed
      const nodeNum = data.id.replace(/^node_/i, "");
      const tacticHtml = (data.tactics || [])
        .filter((key) => TACTICS[key])
        .map((key) => {
          const tbc = TACTICS[key].type === "fallacy" ? "#dc2626" : TACTICS[key].type === "technique" ? "#12883e" : "#b36205";
          return `<span title="${TACTICS[key].name}" style="cursor:help;pointer-events:auto;background:rgba(0,0,0,0.45);border:2px solid ${tbc};border-radius:3px;padding:0 4px;font-size:10px;display:inline-flex;align-items:center;height:16px;box-sizing:border-box;">${TACTICS[key].symbol}</span>`;
        })
        .join("");
      const primaryRow = `<div style="${rowStyle}">
        <span style="${cs("#334155")}">${nodeNum}</span>
        <span style="${cs(spkColor)}">${spkName}</span>
        ${data.type ? `<span class="type-badge type-${data.type}">${data.type.charAt(0).toUpperCase() + data.type.slice(1)}</span>` : ""}
        ${tacticHtml}
      </div>`;

      // Row 2 (chips)
      const chipHtml = (data.flagPairs || []).map((pair) => {
        const num = (id) => id.replace(/^node_/i, "");
        const label = `${num(pair.upstream)} ⚠️ ${num(pair.downstream)}`;
        const title = pair.type === "contradiction"
          ? `Contradiction: ${fmtId(pair.upstream)} ⚠️ ${fmtId(pair.downstream)}`
          : `Goalpost move: ${fmtId(pair.upstream)} ⚠️ ${fmtId(pair.downstream)}`;
        return `<span title="${title}" style="${cs("#dc2626")}">${label}</span>`;
      }).join("");
      const nonSeqHtml = data.non_sequitur ? `<span title="This statement doesn't logically connect to the argument" style="${cs("#dc2626")}">⚡ non-sequitur</span>` : "";
      const pc = data.possible_concession;
      const pcHtml = pc
        ? `<span title="${pc.type === "self"
              ? "This may be a retraction of their own point — nobody has confirmed it"
              : "This may be an acknowledgement of the other speaker's point — nobody has confirmed it"}" style="${cs("#0c857b")}">🤝? possible concession</span>`
        : "";
      const chipRow = (chipHtml || nonSeqHtml || pcHtml) ? `<div style="${rowStyle}">${chipHtml}${nonSeqHtml}${pcHtml}</div>` : "";

      return `<div data-node-id="${data.id}" style="position:absolute;top:${BADGE_BASE_TOP}px;left:${BADGE_BASE_TOP}px;display:flex;flex-direction:column;gap:${GAP}px;pointer-events:none;width:${BADGE_AVAIL}px;opacity:${data.faded ? 0.25 : 1};">
        ${primaryRow}${chipRow}
      </div>`;
    };
  }

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

    cy.nodeHtmlLabel([{
      query: "node",
      halign: "left",
      valign: "top",
      halignBox: "right",
      valignBox: "top",
      // Delegate to tplRef so HMR code changes take effect without remount.
      tpl: (data) => tplRef.current(data),
    }]);

    // ── Touch gestures ─────────────────────────────────────────────────────
    // One gesture: a tap toggles the header and footer. Pinch is cytoscape's
    // own and needs nothing from us.
    //
    // Removed 2026-08-13 — double-tap zoom-in, double-tap-and-hold drag-zoom,
    // and two-finger double-tap zoom-out. They fired on taps meant as single
    // taps, so the map zoomed unpredictably while you were just trying to show
    // the chrome, and nothing announced they existed. Pinch already zooms, in
    // the way everyone already knows.
    //
    // Deleting them also made the tap immediate. It used to wait out a 300ms
    // window to learn whether a second tap was coming; with nothing to wait for,
    // the chrome now responds on lift.
    const TAP_MS   = 300;  // longer than this is a press, not a tap
    const TAP_SLOP = 8;    // px of movement still counted as a tap, not a pan

    const g = { downTime: 0, x: 0, y: 0, moved: false, fingers: 0 };

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
      g.fingers = e.touches.length;
      if (g.fingers !== 1) { g.downTime = 0; return; }   // pinch — cytoscape's
      g.downTime = Date.now();
      g.x = e.touches[0].clientX;
      g.y = e.touches[0].clientY;
      g.moved = false;
    }

    function onTouchMove(e) {
      if (!g.downTime || e.touches.length !== 1) { g.downTime = 0; return; }
      if (Math.abs(e.touches[0].clientX - g.x) > TAP_SLOP ||
          Math.abs(e.touches[0].clientY - g.y) > TAP_SLOP) {
        g.moved = true;   // a pan, not a tap
      }
    }

    function onTouchEnd() {
      const held = Date.now() - g.downTime;
      const wasTap = g.downTime && !g.moved && g.fingers === 1 && held < TAP_MS;
      g.downTime = 0;
      if (wasTap) onToggleUIRef.current?.();
    }

    const el = containerRef.current;
    el.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    el.addEventListener("touchmove",  onTouchMove,  { capture: true, passive: false });
    el.addEventListener("touchend",   onTouchEnd,   { capture: true, passive: false });

    // ── Mouse double-click zoom (desktop) ──────────────────────────────────
    // Double left-click  → zoom in  ×2.5 centred on cursor
    // Double right-click → zoom out ×2.5 centred on cursor
    // Use native DOM events in capture mode for reliability (same as touch).
    function onDblClick(e) {
      if (e.touches) return; // skip touch (handled above)
      const r = el.getBoundingClientRect();
      zoomToPoint(Math.min(cy.maxZoom(), cy.zoom() * 2.5), e.clientX - r.left, e.clientY - r.top);
    }
    el.addEventListener("dblclick", onDblClick, { capture: true });

    let lastRightClickTime = 0;
    function onContextMenu(e) {
      e.preventDefault(); // suppress browser context menu
      const now = Date.now();
      if (now - lastRightClickTime < 400) {
        // Double right-click → zoom out
        const r = el.getBoundingClientRect();
        zoomToPoint(Math.max(cy.minZoom(), cy.zoom() / 2.5), e.clientX - r.left, e.clientY - r.top);
        lastRightClickTime = 0;
      } else {
        lastRightClickTime = now;
      }
    }
    el.addEventListener("contextmenu", onContextMenu, { capture: true });

    cyRef.current = cy;

    return () => {
      el.removeEventListener("touchstart", onTouchStart, { capture: true });
      el.removeEventListener("touchmove",  onTouchMove,  { capture: true });
      el.removeEventListener("touchend",   onTouchEnd,   { capture: true });
      el.removeEventListener("dblclick", onDblClick, { capture: true });
      el.removeEventListener("contextmenu", onContextMenu, { capture: true });
      if (cy.nodes().length > 0) {
        const nodePositions = {};
        cy.nodes().forEach(n => { nodePositions[n.id()] = { ...n.position() }; });
        _savedViewport = { zoom: cy.zoom(), pan: { ...cy.pan() }, nodePositions };
      }
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Re-apply the stylesheet whenever the theme changes (including live hover-preview)
  // without rebuilding the graph — preserves zoom/pan. Firing cy.style() also emits a
  // "style" event, which cytoscape-node-html-label listens for to refresh badge HTML
  // (colors there are read fresh from themeRef.current on every call).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // fromJson, NOT cy.style(sheet). Handing a stylesheet to cy.style() swaps in
    // a fresh Style instance that the already-rendered elements are never
    // re-bound to: they fall back to stock cytoscape defaults -- grey ellipses,
    // 30px wide -- and stay there. The sheet reads back correctly afterwards and
    // no bypass is set on the element, which is what made this look like a
    // rendering bug rather than a stylesheet one. fromJson mutates the Style the
    // elements already point at, so the update actually reaches them.
    cy.style().fromJson(buildStylesheet(themeRef.current)).update();
  }, [styleKey]);

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

    // Build flagPairsMap: nodeId → [{type, upstream, downstream}] for all affected nodes.
    const predecessorMap = new Map();
    for (const edge of edges) {
      if (!predecessorMap.has(edge.to)) predecessorMap.set(edge.to, new Set());
      predecessorMap.get(edge.to).add(edge.from);
    }
    function bfsBack(startId) {
      const visited = new Set([startId]);
      const queue = [startId];
      while (queue.length > 0) {
        const current = queue.shift();
        for (const predId of predecessorMap.get(current) || []) {
          if (!visited.has(predId)) { visited.add(predId); queue.push(predId); }
        }
      }
      return visited;
    }
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const flagPairsMap = new Map();
    const addPair = (nodeId, pair) => {
      if (!flagPairsMap.has(nodeId)) flagPairsMap.set(nodeId, []);
      const existing = flagPairsMap.get(nodeId);
      if (!existing.some(p => p.upstream === pair.upstream && p.downstream === pair.downstream && p.type === pair.type))
        existing.push(pair);
    };
    for (const node of nodes) {
      if (node.metadata?.contradicts) {
        const pair = { type: "contradiction", upstream: node.metadata.contradicts, downstream: node.id };
        addPair(pair.upstream, pair); addPair(pair.downstream, pair);
        // Only same-speaker predecessors get the badge — the other speaker's nodes are not undermined
        for (const predId of bfsBack(pair.upstream))
          if (predId !== pair.upstream && predId !== pair.downstream)
            if (nodeById.get(predId)?.speaker === node.speaker) addPair(predId, pair);
      }
      if (node.metadata?.moves_goalposts_from) {
        const pair = { type: "goalpost", upstream: node.metadata.moves_goalposts_from, downstream: node.id };
        addPair(pair.upstream, pair); addPair(pair.downstream, pair);
        for (const predId of bfsBack(pair.upstream))
          if (predId !== pair.upstream && predId !== pair.downstream)
            if (nodeById.get(predId)?.speaker === node.speaker) addPair(predId, pair);
      }
    }

    const nodeDataOf = (node) => {
      const tactics      = node.metadata?.tactics || [];
      const flagPairs    = flagPairsMap.get(node.id) || [];
      const non_sequitur = node.metadata?.non_sequitur || false;
      // A confirmed concession answers the question the badge asks, so the badge
      // goes. Maps saved before b597f16 can carry both.
      const settled = !!(node.metadata?.agreed_by || node.metadata?.conceded_by);
      const possible_concession = settled ? null : (node.metadata?.possible_concession ?? null);
      const badgeRows    = estimateBadgeRows(tactics, flagPairs, non_sequitur, possible_concession);
      // Summary placement rule: gap(badge_bottom → text_top) = gap(text_bottom → node_bottom)
      //   Both gaps = BADGE_BASE_TOP (matches left/top badge inset for visual unity).
      //   text_centre = (badge_bottom + nodeHeight) / 2
      //   → textMarginY = (BADGE_BASE_TOP + _badgeH) / 2
      //   nodeHeight = badge_bottom + 4×BADGE_BASE_TOP + textLines×14
      //             = (BADGE_BASE_TOP + _badgeH) + 4×BADGE_BASE_TOP + textLines×14
      //   → gap above text = gap below text = 2×BADGE_BASE_TOP = 8px
      const _badgeH     = badgeRows * BADGE_ROW_PX + Math.max(0, badgeRows - 1) * 2;
      const textLines   = Math.max(1, Math.ceil(node.content.length * 8 / 208));
      const nodeHeight  = Math.max(44, BADGE_BASE_TOP + _badgeH + 4 * BADGE_BASE_TOP + textLines * 14);
      const textMarginY = Math.round((BADGE_BASE_TOP + _badgeH) / 2);
      return {
        id: node.id,
        label: node.content,
        speaker: node.speaker,
        type: node.type,
        rating: node.rating,
        tactics,
        flagPairs,
        non_sequitur,
        possible_concession,
        badgeRows,
        nodeHeight,
        textMarginY,
      };
    };
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
    cy.nodes().removeClass("faded");
    cy.edges().removeClass("faded");

    // Opacity fading (thumbs-up agreed / thumbs-down retracted)
    cy.nodes().forEach((n) => n.data("faded", fadedNodeIds?.has(n.id()) || false));
    if (fadedNodeIds?.size) {
      cy.nodes().filter((n) => fadedNodeIds.has(n.id())).addClass("faded");
      cy.edges().filter((e) => fadedNodeIds.has(e.source().id()) && fadedNodeIds.has(e.target().id())).addClass("faded");
    }

    // Non-sequitur border class
    cy.nodes().removeClass("non-sequitur");
    cy.nodes().filter((n) => n.data("non_sequitur")).addClass("non-sequitur");

    // Always run a full fresh layout so dagre re-centers and symmetrically
    // repositions all nodes whenever the graph structure changes.
    if (cy.nodes().length > 0) {
      const doLayout = () => runLayout(cy, () => {
        // dagre dumps zero-edge nodes at an arbitrary extreme position (rank 0,
        // ordered by array index) — pull them back next to the connected graph
        // instead of leaving them wherever dagre happened to put them. Only
        // genuinely edge-less nodes get this treatment: a non-sequitur node
        // that *does* have a real edge (the model isn't always reliable about
        // leaving them disconnected) must stay in the normal tree layout, or
        // its position relative to its connected neighbor becomes meaningless
        // — stacking it by array order can put a child above its parent.
        const strayNodes = cy.nodes().filter((n) => n.degree() === 0);
        if (strayNodes.length === 0) return;
        const connectedNodes = cy.nodes().not(strayNodes);
        const bb = connectedNodes.length > 0 ? connectedNodes.boundingBox() : { x2: 0, y1: 0 };
        const rightX = bb.x2 + 80 + NODE_WIDTH / 2;
        strayNodes.forEach((n, i) => {
          n.position({ x: rightX, y: bb.y1 + i * (n.height() + 40) });
        });
        // Edge bends were computed against the pre-reposition coordinates —
        // any edge touching a moved node (e.g. a non-sequitur with an
        // attached edge) now has a stale curve-style/segment path relative
        // to its node's new position, which renders as a plain diagonal
        // line instead of a clean right-angle bend. Recompute after moving.
        applyEdgeCurves(cy);
        fitToSafeZone(cy);
      });

      if (_savedViewport) {
        // Theme remount: restore positions directly — no layout animation needed.
        // But if no node IDs match (a new debate was loaded alongside the theme change),
        // fall through to a fresh layout instead.
        const savedVp = _savedViewport;
        _savedViewport = null;
        let restoredCount = 0;
        cy.batch(() => {
          cy.nodes().forEach(n => {
            const pos = savedVp.nodePositions[n.id()];
            if (pos) { n.position(pos); restoredCount++; }
          });
        });
        if (restoredCount > 0) {
          applyEdgeCurves(cy);
          cy.viewport({ zoom: savedVp.zoom, pan: savedVp.pan });
        } else {
          doLayout();
        }
      } else {
        doLayout();
      }
    }
  }, [nodes, edges, fadedNodeIds, contradictionFadedIds, walkbackFadedIds]);

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
          const t = themeRef.current;
          const color = spk === "Blue"  ? t.a.bg
                      : spk === "Green" ? t.b.bg
                      : "#94a3b8";
          pulseNode(el, color);
        });
    }, 350);
    return () => clearTimeout(timer);
    // styleKey, not theme — a rename must not re-pulse nodes that are no longer new.
  }, [newNodeIds, styleKey]);

  // Cytoscape caches its container's size and will happily keep drawing to the
  // old one. Three things resize it and none of them is a window resize event:
  // the chrome auto-hiding (the top spacer collapses), the soft keyboard opening
  // now that the activity is adjustResize, and rotation. Without this the map
  // keeps a blank strip where the header used to be, and nodes stay clipped at
  // a boundary that no longer exists.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;

    // Two different jobs on the same observer, deliberately on two different
    // schedules — which is the whole trick here:
    //
    //  - Pan compensation runs EVERY frame, because it is fixing motion, and
    //    motion you correct only at the end is motion the user still watched.
    //  - cy.resize() stays debounced, because it clears and repaints the
    //    canvas. Node bodies live on that canvas while the badges are HTML on
    //    top, so a resize per frame looks like every node blinking out and back
    //    with its badge hanging in mid-air. The chrome slide is a 250ms
    //    transition; one repaint after it stops is what is wanted.
    //
    // The size guard below is for the same flicker reason: the observer fires
    // for reasons that leave the box alone, and resizing for those is pure
    // flicker. Rounded, because sub-pixel jitter is not a resize.
    let last = { w: 0, h: 0 };
    let timer = 0;
    // Where the container's top edge sat when we last looked. Deliberately kept
    // across bursts: at the first frame of a new slide this still holds the
    // settled position from before it started, so nothing is lost to the gap
    // between the transition beginning and the observer first firing.
    let lastTop = null;
    let raf = 0;
    let steady = 0;

    // Cytoscape pins its content to the container's top-left, so when the
    // chrome slides away and that corner rises 90px, the map rises with it —
    // the app pans on your behalf. Undo it by exactly what the corner moved.
    //
    // panBy is safe to run per frame; it repaints but does not clear. It is
    // cy.resize() that blanks the canvas, which is why that one stays debounced.
    const compensate = () => {
      const cy = cyRef.current;
      if (!cy) return false;
      const top = el.getBoundingClientRect().top;
      const moved = lastTop !== null && top !== lastTop;
      if (moved) cy.panBy({ x: 0, y: lastTop - top });
      lastTop = top;
      return moved;
    };

    // WHERE this runs is the whole thing, and it took three goes to get right.
    //
    // Cytoscape drives its canvas from its own permanent rAF loop, so panBy()
    // does not draw — it flags a frame as wanted and the loop paints it whenever
    // it next runs. Our own rAF callback and cytoscape's are two independent
    // callbacks in the same frame, and if theirs runs first, the canvas paints
    // with the pan we are about to fix. The badges do not go through that loop,
    // so they tracked perfectly while the node bodies lagged a frame behind —
    // which is precisely the "badges stable, nodes wiggle" that got reported.
    //
    // beforeRender fires inside cytoscape's loop, immediately before the draw,
    // so the correction is already applied to the pan the canvas is about to be
    // painted with. Same frame, by construction, instead of by luck of ordering.
    // Priority 500 puts it above animations (400) and element calcs (300): the
    // viewport should be settled before anything reads positions from it.
    const renderer = cyRef.current?.renderer?.();
    const hooked = typeof renderer?.beforeRender === "function";
    if (hooked) renderer.beforeRender(compensate, 500);

    // Fallback for a cytoscape without that hook. Same idea, one frame less
    // reliable: rAF at least runs before paint, unlike the ResizeObserver.
    // Stops once things settle — a permanent rAF loop on a phone is a battery
    // leak, and cytoscape's loop is already paying that cost for us above.
    const follow = () => {
      steady = compensate() ? 0 : steady + 1;
      raf = steady < 6 ? requestAnimationFrame(follow) : 0;
    };

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;

      if (!hooked) {
        compensate();             // this frame, immediately
        if (!raf) {               // and every frame after, until it settles
          steady = 0;
          raf = requestAnimationFrame(follow);
        }
      }

      const w = Math.round(box.width);
      const h = Math.round(box.height);
      if (w === last.w && h === last.h) return;

      // Leading edge: resize at once on the first change of a burst, then let
      // the trailing debounce catch the end. The chrome toggle is now a single
      // 90px step rather than an animation, so waiting 120ms to resize left the
      // canvas 90px short of its container for that whole time — a strip at the
      // bottom with no map in it. One resize for a one-step change is not the
      // per-frame resizing that caused the node flicker; that was ~15 of them.
      if (!last.w && !last.h) {
        cyRef.current?.resize();          // first observation, size it now
      } else if (!timer) {
        cyRef.current?.resize();          // start of a burst
      }

      last = { w, h };
      clearTimeout(timer);
      timer = setTimeout(() => cyRef.current?.resize(), 120);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="argument-map">
      {nodes.length === 0 && (
        <p className="empty-state" style={{
          color: theme.lcars ? "#FF9900" : theme.dark ? "#f1f5f9" : "#0f172a",
        }}>
          No statements yet.
        </p>
      )}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
