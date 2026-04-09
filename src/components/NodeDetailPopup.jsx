/**
 * NodeDetailPopup.jsx — Modal popup showing full details for a selected node.
 *
 * Displays: node ID, type, speaker, original text, AI summary,
 * tactic badges with explanations. Closes on X, backdrop click, or Escape.
 *
 * Also supports an edit mode (pencil icon in header) and create mode (isNew prop).
 */

import { useEffect, useState } from "react";
import { TACTICS } from "../utils/tactics.js";
import { POINTS } from "../utils/scoring.js";
import { speakerName, speakerBorder, speakerBackground } from "../utils/speakers.js";
import { fmtNodeId, fmtNodeNum } from "../utils/format.js";

const NODE_TYPES = ["claim", "premise", "objection", "rebuttal", "evidence", "clarification"];

export default function NodeDetailPopup({
  node, isNew, originalText, onClose,
  fadedNodeIds, nodes, edges,
  onNodeClick, onRate, onSave,
  currentSpeaker, loading, theme, gameMode,
}) {
  const [editMode, setEditMode] = useState(!!isNew);

  // Form state — initialised from node prop (blank for new nodes)
  const [editContent,  setEditContent]  = useState(node?.content ?? "");
  const [editType,     setEditType]     = useState(node?.type ?? "claim");
  const [editParent,   setEditParent]   = useState(
    () => edges?.find((e) => e.from === node?.id)?.to ?? ""
  );
  const [editTactics,     setEditTactics]     = useState(node?.metadata?.tactics ?? []);
  const [editTags,        setEditTags]        = useState(node?.metadata?.tags ?? []);
  const [tagInput,        setTagInput]        = useState("");
  const [editContradicts, setEditContradicts] = useState(node?.metadata?.contradicts ?? "");
  const [editGoalposts,   setEditGoalposts]   = useState(node?.metadata?.moves_goalposts_from ?? "");

  // Escape: cancel edit, or close popup
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== "Escape") return;
      if (editMode && !isNew) setEditMode(false);
      else onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, editMode, isNew]);

  const toggleTactic = (key) =>
    setEditTactics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const addTag = () => {
    const tag = tagInput.trim().replace(/,+$/, "");
    if (tag && !editTags.includes(tag)) setEditTags((prev) => [...prev, tag]);
    setTagInput("");
  };

  const handleSave = () => {
    if (!editContent.trim()) return;
    onSave?.(isNew ? null : node.id, {
      content: editContent.trim(),
      type: editType,
      tactics: editTactics,
      tags: editTags,
      contradicts: editContradicts || null,
      moves_goalposts_from: editGoalposts || null,
    }, editParent || null);
    if (!isNew) setEditMode(false);
  };

  // ── Edit / Create mode ────────────────────────────────────────────────
  if (editMode) {
    return (
      <div className="popup-backdrop">
        <div className="popup-card popup-card--edit" onClick={(e) => e.stopPropagation()}>

          {/* Edit header */}
          <div className="popup-header">
            <span className="popup-edit-title">
              {isNew ? "Add Node" : `Edit ${fmtNodeId(node.id)}`}
              {!isNew && (
                <span
                  className="speaker-badge"
                  style={{ backgroundColor: speakerBorder(node.speaker, theme), marginLeft: "0.5rem" }}
                >
                  {speakerName(node.speaker, theme)}
                </span>
              )}
            </span>
            <div className="popup-edit-actions">
              <button
                className="popup-edit-cancel-btn"
                onClick={isNew ? onClose : () => setEditMode(false)}
              >
                Cancel
              </button>
              <button className="popup-edit-save-btn" onClick={handleSave}>
                {isNew ? "Add" : "Save"}
              </button>
            </div>
          </div>

          {/* Statement */}
          <div className="popup-section">
            <h4>Statement</h4>
            <textarea
              className="popup-edit-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Enter the node statement…"
              rows={3}
              autoFocus
            />
          </div>

          {/* Type */}
          <div className="popup-section">
            <h4>Type</h4>
            <select
              className="popup-edit-select"
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Parent node */}
          <div className="popup-section">
            <h4>Parent Node</h4>
            <select
              className="popup-edit-select popup-edit-flag-select"
              value={editParent}
              onChange={(e) => setEditParent(e.target.value)}
            >
              <option value="">(none — root node)</option>
              {nodes?.filter((n) => n.id !== (isNew ? null : node?.id)).map((n) => (
                <option key={n.id} value={n.id}>
                  {fmtNodeId(n.id)}: {n.content.length > 60 ? n.content.slice(0, 57) + "…" : n.content}
                </option>
              ))}
            </select>
          </div>

          {/* Tactics multi-select */}
          <div className="popup-section">
            <h4>Tactics</h4>
            <div className="popup-edit-tactics">
              {Object.entries(TACTICS).map(([key, tac]) => (
                <button
                  key={key}
                  type="button"
                  className={`tactic-toggle tactic-${tac.type}${editTactics.includes(key) ? " tactic-toggle--on" : ""}`}
                  onClick={() => toggleTactic(key)}
                >
                  {tac.symbol} {tac.name}
                </button>
              ))}
            </div>
          </div>

          {/* Contradiction flag */}
          <div className="popup-section">
            <h4>Contradiction</h4>
            <div className="popup-edit-flag-row">
              <button
                type="button"
                className={`flag-toggle flag-toggle--contradiction${editContradicts ? " flag-toggle--on" : ""}`}
                onClick={() => {
                  if (editContradicts) {
                    setEditContradicts("");
                  } else {
                    const firstOther = nodes?.find((n) => n.id !== (isNew ? null : node?.id));
                    setEditContradicts(firstOther?.id ?? "");
                  }
                }}
              >
                ⚠️ Contradicts a node
              </button>
              {editContradicts && (
                <select
                  className="popup-edit-select popup-edit-flag-select"
                  value={editContradicts}
                  onChange={(e) => setEditContradicts(e.target.value)}
                >
                  {nodes?.filter((n) => n.id !== (isNew ? null : node?.id)).map((n) => (
                    <option key={n.id} value={n.id}>
                      {fmtNodeId(n.id)}: {n.content.length > 60 ? n.content.slice(0, 57) + "…" : n.content}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Goalpost flag */}
          <div className="popup-section">
            <h4>Moves Goalposts</h4>
            <div className="popup-edit-flag-row">
              <button
                type="button"
                className={`flag-toggle flag-toggle--goalposts${editGoalposts ? " flag-toggle--on" : ""}`}
                onClick={() => {
                  if (editGoalposts) {
                    setEditGoalposts("");
                  } else {
                    const firstOther = nodes?.find((n) => n.id !== (isNew ? null : node?.id));
                    setEditGoalposts(firstOther?.id ?? "");
                  }
                }}
              >
                🥅 Moves the goalposts
              </button>
              {editGoalposts && (
                <select
                  className="popup-edit-select popup-edit-flag-select"
                  value={editGoalposts}
                  onChange={(e) => setEditGoalposts(e.target.value)}
                >
                  {nodes?.filter((n) => n.id !== (isNew ? null : node?.id)).map((n) => (
                    <option key={n.id} value={n.id}>
                      {fmtNodeId(n.id)}: {n.content.length > 60 ? n.content.slice(0, 57) + "…" : n.content}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="popup-section">
            <h4>Tags</h4>
            {editTags.length > 0 && (
              <div className="popup-edit-tag-list">
                {editTags.map((tag) => (
                  <span key={tag} className="popup-edit-tag">
                    {tag}
                    <button
                      type="button"
                      className="popup-edit-tag-remove"
                      onClick={() => setEditTags((prev) => prev.filter((t) => t !== tag))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              className="popup-edit-input"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }
              }}
              placeholder="Add tag — Enter or comma to confirm"
            />
          </div>

        </div>
      </div>
    );
  }

  // ── View mode ─────────────────────────────────────────────────────────
  if (!node) return null;

  const speakerColor = speakerBorder(node.speaker, theme);
  const speakerBg    = speakerBackground(node.speaker, theme);
  const tactics = node.metadata?.tactics?.filter((key) => TACTICS[key]) || [];
  const tacticReasons = node.metadata?.tactic_reasons || {};
  const contradictsId = node.metadata?.contradicts;
  const goalpostsId = node.metadata?.moves_goalposts_from;
  const contradictsNode = contradictsId ? nodes?.find((n) => n.id === contradictsId) : null;
  const goalpostsNode = goalpostsId ? nodes?.find((n) => n.id === goalpostsId) : null;
  const contradictedByNode = nodes?.find((n) => n.metadata?.contradicts === node.id) ?? null;
  const walkedBackByNode = nodes?.find((n) => n.metadata?.moves_goalposts_from === node.id) ?? null;

  // Detect if this node is a *downstream* predecessor of a contradiction/goalpost but not
  // directly involved. Used to show either an "undermined" warning (same speaker) or
  // a soft info note (other speaker).
  const upstreamConflict = (() => {
    if (!nodes || !edges) return null;
    // Skip nodes that are already directly flagged — they have their own chips
    if (contradictsNode || contradictedByNode || goalpostsNode || walkedBackByNode) return null;
    const predMap = new Map();
    for (const edge of edges) {
      if (!predMap.has(edge.to)) predMap.set(edge.to, new Set());
      predMap.get(edge.to).add(edge.from);
    }
    const getPreds = (startId) => {
      const visited = new Set();
      const q = [startId];
      while (q.length) {
        const id = q.shift();
        for (const p of predMap.get(id) || []) {
          if (!visited.has(p)) { visited.add(p); q.push(p); }
        }
      }
      return visited;
    };
    for (const n of nodes) {
      const targetId = n.metadata?.contradicts || n.metadata?.moves_goalposts_from;
      if (!targetId) continue;
      if (getPreds(targetId).has(node.id)) {
        return {
          type: n.metadata?.contradicts ? "contradiction" : "goalpost move",
          isSameUser: node.speaker === n.speaker,
          sourceId: n.id,
          targetId,
        };
      }
    }
    return null;
  })();

  return (
    <div className="popup-backdrop" onClick={onClose}>
      <div className="popup-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="popup-header">
          <div className="node-badges">
            <span className="node-id-badge">{fmtNodeNum(node.id)}</span>
            <span className="speaker-badge" style={{ backgroundColor: speakerColor }}>
              {speakerName(node.speaker, theme)}
            </span>
            <span className={`type-badge type-${node.type}`}>{node.type.charAt(0).toUpperCase() + node.type.slice(1)}</span>
            {contradictsNode && (
              <span className="node-flag-chip node-flag-chip--contradiction">⚠ {fmtNodeId(contradictsNode.id)}</span>
            )}
            {contradictedByNode && (
              <span className="node-flag-chip node-flag-chip--contradiction">⚠↙ {fmtNodeId(contradictedByNode.id)}</span>
            )}
            {goalpostsNode && (
              <span className="node-flag-chip node-flag-chip--goalposts">⤳ {fmtNodeId(goalpostsNode.id)}</span>
            )}
            {node.metadata?.non_sequitur && (
              <span className="node-flag-chip node-flag-chip--non-sequitur">⚡ non-sequitur</span>
            )}
            {walkedBackByNode && (
              <span className="node-flag-chip node-flag-chip--goalposts">⤳↙ {fmtNodeId(walkedBackByNode.id)}</span>
            )}
            {tactics.map((key) => (
              <span key={key} className={`tactic-badge tactic-${TACTICS[key].type}`} title={TACTICS[key].name}>
                {TACTICS[key].symbol}
              </span>
            ))}
          </div>
          <div className="popup-header-actions">
            {onSave && (
              <button
                className="popup-edit-btn"
                onClick={() => setEditMode(true)}
                title="Edit node"
                aria-label="Edit node"
              >
                ✏
              </button>
            )}
            <button className="popup-close" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        </div>

        {/* Fading reason banner */}
        {fadedNodeIds?.has(node.id) && node.rating === "up" && (
          <div className="agreement-banner">
            <span className="agreement-banner-icon">&#x2714;</span>
            <div>
              {node.metadata?.agreed_by?.text ? (
                <>
                  <strong>{speakerName(node.metadata.agreed_by.speaker, theme)} conceded {speakerName(node.speaker, theme)}'s point</strong>
                  <div className="agreement-by">implicit, from their submission</div>
                  <blockquote className="agreement-quote">
                    "{node.metadata.agreed_by.text}"
                  </blockquote>
                </>
              ) : node.metadata?.agreed_by?.speaker ? (
                <strong>{speakerName(node.metadata.agreed_by.speaker, theme)} conceded {speakerName(node.speaker, theme)}'s point</strong>
              ) : (
                <strong>Conceded</strong>
              )}
            </div>
          </div>
        )}

        {fadedNodeIds?.has(node.id) && node.rating === "down" && (
          <div className="flag-banner flag-goalposts">
            <span className="flag-banner-icon">↩</span>
            <div className="flag-banner-body">
              <strong>Retracted</strong>
              <div>{speakerName(node.speaker, theme)} retracted this argument via concession</div>
            </div>
          </div>
        )}

        {fadedNodeIds?.has(node.id) && !node.rating && (
          <div className="inactive-banner">
            <span className="inactive-banner-icon">⬡</span>
            <div>
              <strong>No longer active</strong>
              <div className="inactive-banner-reason">
                This argument supports a statement that has been agreed on, retracted, or walked back
              </div>
            </div>
          </div>
        )}

        {/* Contradiction / goalpost chips — prominent labels for the two directly involved nodes */}
        {contradictsNode && (
          <div className="flag-chip flag-chip--contradiction" onClick={() => { onClose(); onNodeClick?.(contradictsNode); }}>
            <span className="flag-chip-label">⚠ Contradicts {fmtNodeId(contradictsNode.id)}</span>
            <span className="flag-chip-sub">{contradictsNode.content.length > 80 ? contradictsNode.content.slice(0, 77) + "…" : contradictsNode.content}</span>
          </div>
        )}

        {contradictedByNode && (
          <div className="flag-chip flag-chip--contradiction" onClick={() => { onClose(); onNodeClick?.(contradictedByNode); }}>
            <span className="flag-chip-label">⚠ Contradicted by {fmtNodeId(contradictedByNode.id)}</span>
            <span className="flag-chip-sub">{contradictedByNode.content.length > 80 ? contradictedByNode.content.slice(0, 77) + "…" : contradictedByNode.content}</span>
          </div>
        )}

        {goalpostsNode && (
          <div className="flag-chip flag-chip--goalposts" onClick={() => { onClose(); onNodeClick?.(goalpostsNode); }}>
            <span className="flag-chip-label">⤳ Moves Goalpost of {fmtNodeId(goalpostsNode.id)}</span>
            <span className="flag-chip-sub">{goalpostsNode.content.length > 80 ? goalpostsNode.content.slice(0, 77) + "…" : goalpostsNode.content}</span>
          </div>
        )}

        {walkedBackByNode && (
          <div className="flag-chip flag-chip--goalposts" onClick={() => { onClose(); onNodeClick?.(walkedBackByNode); }}>
            <span className="flag-chip-label">⤳ Goalpost Moved by {fmtNodeId(walkedBackByNode.id)}</span>
            <span className="flag-chip-sub">{walkedBackByNode.content.length > 80 ? walkedBackByNode.content.slice(0, 77) + "…" : walkedBackByNode.content}</span>
          </div>
        )}

        {/* Downstream conflict — same speaker: red "undermined" chip */}
        {upstreamConflict?.isSameUser && (
          <div className="flag-chip flag-chip--contradiction" onClick={() => { onClose(); onNodeClick?.(nodes?.find(n => n.id === upstreamConflict.sourceId)); }}>
            <span className="flag-chip-label">⚠ Undermined</span>
            <span className="flag-chip-sub">
              This statement supports an argument undermined by an upstream {upstreamConflict.type} ({fmtNodeId(upstreamConflict.sourceId)} / {fmtNodeId(upstreamConflict.targetId)})
            </span>
          </div>
        )}

        {/* Downstream conflict — other speaker: soft info note */}
        {upstreamConflict && !upstreamConflict.isSameUser && (
          <div className="downstream-note">
            <span className="downstream-note-icon">ℹ</span>
            <span className="downstream-note-text">
              This statement is downstream of an upstream {upstreamConflict.type} by the other speaker and may carry less weight in the current argument.
            </span>
          </div>
        )}

        {/* Non-sequitur flag */}
        {node.metadata?.non_sequitur && (
          <div className="flag-chip flag-chip--non-sequitur">
            <span className="flag-chip-label">⚡ Non-sequitur</span>
            <span className="flag-chip-sub">This statement doesn't appear to logically connect to the current argument</span>
          </div>
        )}

        {/* Original text */}
        {originalText && (
          <div className="popup-section">
            <h4>Original Statement</h4>
            <blockquote className="popup-quote" style={{ borderLeftColor: speakerColor, background: speakerBg }}>{originalText}</blockquote>
          </div>
        )}

        {/* AI summary */}
        <div className="popup-section">
          <h4>AI Summary</h4>
          <p className="popup-summary">{node.content}</p>
        </div>

        {/* Tactic explanations */}
        {tactics.length > 0 && (
          <div className="popup-section">
            <h4>Tactics Detected</h4>
            <ul className="popup-tactics">
              {tactics.map((key) => (
                <li key={key}>
                  <span className={`tactic-badge tactic-${TACTICS[key].type}`}>
                    {TACTICS[key].symbol} {TACTICS[key].name}
                  </span>
                  {tacticReasons[key] && (
                    <span className="tactic-reason">{tacticReasons[key]}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Points breakdown (game mode only) */}
        {gameMode && (() => {
          const events = [];
          for (const key of tactics) {
            if (POINTS[key] != null)
              events.push({ label: `${TACTICS[key].symbol} ${TACTICS[key].name}`, pts: POINTS[key], speaker: node.speaker });
          }
          if (node.metadata?.contradicts)
            events.push({ label: "⚠ Contradiction", pts: POINTS.contradiction, speaker: node.speaker });
          if (node.metadata?.moves_goalposts_from)
            events.push({ label: "🥅 Moves goalposts", pts: POINTS.goalposts, speaker: node.speaker });
          if (node.metadata?.non_sequitur)
            events.push({ label: "⚡ Non-sequitur", pts: POINTS.non_sequitur, speaker: node.speaker });
          if (node.rating === "down")
            events.push({ label: "↩ Retracted own argument", pts: POINTS.self_retraction, speaker: node.speaker });
          if (node.rating === "up") {
            const agreedBy = node.metadata?.agreed_by?.speaker;
            if (agreedBy && agreedBy !== node.speaker) {
              events.push({ label: "✓ Argument validated by opponent", pts: POINTS.concession_received, speaker: node.speaker });
              events.push({ label: "✓ Conceded (intellectual honesty)", pts: POINTS.concession_given, speaker: agreedBy });
            }
          }
          if (events.length === 0) return null;

          // Totals per speaker
          const totals = {};
          for (const ev of events) totals[ev.speaker] = (totals[ev.speaker] ?? 0) + ev.pts;

          return (
            <div className="popup-section">
              <h4>Points</h4>
              <table className="node-points-table">
                <tbody>
                  {events.map((ev, i) => (
                    <tr key={i}>
                      <td className="node-points-label">{ev.label}</td>
                      <td className="node-points-player" style={{ color: speakerBorder(ev.speaker, theme) }}>
                        {speakerName(ev.speaker, theme)}
                      </td>
                      <td className={`node-points-val${ev.pts >= 0 ? " pts-pos" : " pts-neg"}`}>
                        {ev.pts >= 0 ? "+" : ""}{ev.pts}
                      </td>
                    </tr>
                  ))}
                  {Object.entries(totals).map(([sp, total]) => (
                    <tr key={sp} className="node-points-total">
                      <td className="node-points-label"><strong>Total</strong></td>
                      <td className="node-points-player" style={{ color: speakerBorder(sp, theme) }}>
                        <strong>{speakerName(sp, theme)}</strong>
                      </td>
                      <td className={`node-points-val${total >= 0 ? " pts-pos" : " pts-neg"}`}>
                        <strong>{total >= 0 ? "+" : ""}{total}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Concede button */}
        {onRate && (() => {
          const isOtherNode = node.speaker !== currentSpeaker;
          const isActive = isOtherNode ? node.rating === "up" : node.rating === "down";
          const ratingType = isOtherNode ? "up" : "down";
          const btnText = isOtherNode
            ? `${speakerName(currentSpeaker, theme)} concedes that ${speakerName(node.speaker, theme)}'s point is correct`
            : `${speakerName(currentSpeaker, theme)} concedes that this statement of theirs is incorrect`;
          return (
            <div className="popup-section popup-rating-row">
              <button
                className={`concede-btn${isActive ? " concede-btn--active" : ""}`}
                onClick={() => onRate(node.id, ratingType)}
                disabled={loading}
              >
                {isActive ? `✓ ${btnText}` : btnText}
              </button>
            </div>
          );
        })()}

        {/* Tags */}
        {node.metadata?.tags?.length > 0 && (
          <div className="popup-section">
            <h4>Tags</h4>
            <div className="popup-tags">
              {node.metadata.tags.map((tag) => (
                <span key={tag} className="popup-tag">{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
