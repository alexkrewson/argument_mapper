import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ArgumentMap from "./ArgumentMap";
import { THEMES, DEFAULT_THEME_KEY } from "../utils/themes.js";
import { computeFadedInfo } from "../utils/fadedInfo.js";
import { fetchSharedDebate } from "../utils/share";
import { fmtNodeId } from "../utils/format.js";

// What someone with a view-only link sees: the owner's map, redrawn as the
// owner adds to it, with nothing to type into. No account, no auth calls, no
// credits -- main.jsx renders this INSTEAD of App when the URL carries
// ?view=<token>, so none of App's sign-in or save machinery ever runs.
//
// Live by polling, not Realtime: an anon viewer can't subscribe to a table it
// has no policy on, and a 5-second poll of one small row is cheap. Paused while
// the tab is hidden, and caught up the moment it is shown again.
const POLL_MS = 5000;
const EMPTY = { nodes: [], edges: [] };
// Module-level so ArgumentMap's tap effect, which depends on it, binds once.
const noop = () => {};

export default function SharedView({ token }) {
  const [debate, setDebate] = useState(undefined); // undefined = loading, null = not shared
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [newNodeIds, setNewNodeIds] = useState(() => new Set());
  const lastJsonRef = useRef(null);
  const knownIdsRef = useRef(null);
  const newTimerRef = useRef(null);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const row = await fetchSharedDebate(token);
        if (!live) return;
        setFailed(false);
        if (!row) { lastJsonRef.current = null; setDebate(null); return; }
        const json = JSON.stringify(row);
        if (json === lastJsonRef.current) return;
        lastJsonRef.current = json;
        // Highlight what arrived since the last poll, the way App highlights
        // a turn. Not on first load: everything would glow.
        const ids = (row.map_data?.map?.argument_map?.nodes ?? []).map((n) => n.id);
        if (knownIdsRef.current) {
          const fresh = new Set(ids.filter((id) => !knownIdsRef.current.has(id)));
          if (fresh.size) {
            setNewNodeIds(fresh);
            clearTimeout(newTimerRef.current);
            newTimerRef.current = setTimeout(() => setNewNodeIds(new Set()), 3500);
          }
        }
        knownIdsRef.current = new Set(ids);
        setDebate(row);
      } catch {
        // Offline or a blip: keep showing the last map and say so.
        if (live) setFailed(true);
      }
    };
    poll();
    const timer = setInterval(() => { if (document.visibilityState === "visible") poll(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      clearTimeout(newTimerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  const theme = useMemo(() => {
    const base = THEMES[debate?.theme_key] ?? THEMES[DEFAULT_THEME_KEY];
    return {
      ...base,
      a: { ...base.a, name: debate?.speaker_a || base.a.name },
      b: { ...base.b, name: debate?.speaker_b || base.b.name },
    };
  }, [debate?.theme_key, debate?.speaker_a, debate?.speaker_b]);

  useEffect(() => {
    document.documentElement.setAttribute("data-dark",  theme.dark  ? "true" : "false");
    document.documentElement.setAttribute("data-lcars", theme.lcars ? "true" : "false");
  }, [theme]);

  useEffect(() => {
    document.title = debate?.title ? `${debate.title} · iDisagree` : "iDisagree";
  }, [debate?.title]);

  const inner = debate?.map_data?.map?.argument_map ?? EMPTY;
  const fadedInfo = useMemo(() => computeFadedInfo(inner.nodes, inner.edges), [inner.nodes, inner.edges]);
  const liveSelected = selected && inner.nodes.find((n) => n.id === selected.id);
  const handleNodeClick = useCallback((node) => setSelected(node), []);

  if (debate === undefined && !failed) {
    return <div className="shared-view-message" data-testid="shared-loading">Loading…</div>;
  }
  if (debate === null || (debate === undefined && failed)) {
    return (
      <div className="shared-view-message" data-testid="shared-unavailable">
        <h1>iDisagree</h1>
        <p>{failed ? "Couldn't load this map. Check your connection and refresh."
                   : "This map isn't shared any more, or the link is wrong."}</p>
        <a href="/">Open iDisagree</a>
      </div>
    );
  }

  const speakerName = (s) => (s === "Blue" ? theme.a.name : s === "Green" ? theme.b.name : s);
  const speakerColor = (s) => (s === "Blue" ? theme.a.bg : theme.b.bg);

  return (
    <div className="shared-view" data-testid="shared-view">
      <header className="app-header shared-view-header">
        <h1><a href="/">iDisagree</a></h1>
        <div className="shared-view-title" data-testid="shared-title">{debate.title}</div>
        <div className="shared-view-legend">
          <span className="shared-view-speaker" style={{ background: theme.a.bg }}>{theme.a.name}</span>
          <span className="shared-view-vs">vs</span>
          <span className="shared-view-speaker" style={{ background: theme.b.bg }}>{theme.b.name}</span>
        </div>
        <span className={`shared-view-badge${failed ? " shared-view-badge--offline" : ""}`} data-testid="shared-badge">
          {failed ? "Reconnecting…" : "View only · live"}
        </span>
      </header>
      <div className="shared-view-map">
        <ArgumentMap
          nodes={inner.nodes}
          edges={inner.edges}
          onNodeClick={handleNodeClick}
          fadedNodeIds={fadedInfo.fadedNodeIds}
          contradictionFadedIds={fadedInfo.contradictionFadedIds}
          walkbackFadedIds={fadedInfo.walkbackFadedIds}
          newNodeIds={newNodeIds}
          onToggleUI={noop}
          theme={theme}
        />
      </div>
      {liveSelected && (
        <div className="shared-view-card" data-testid="shared-node-card" role="dialog">
          <div className="shared-view-card-head">
            <span className="shared-view-speaker" style={{ background: speakerColor(liveSelected.speaker) }}>
              {speakerName(liveSelected.speaker)}
            </span>
            <span className="shared-view-card-id">{fmtNodeId(liveSelected.id)} · {liveSelected.type}</span>
            <button className="shared-view-card-close" onClick={() => setSelected(null)} aria-label="Close">✕</button>
          </div>
          <p className="shared-view-card-content">{liveSelected.content}</p>
          {liveSelected.metadata?.original_text && liveSelected.metadata.original_text !== liveSelected.content && (
            <p className="shared-view-card-original">“{liveSelected.metadata.original_text}”</p>
          )}
        </div>
      )}
    </div>
  );
}
