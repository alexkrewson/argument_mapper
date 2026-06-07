/**
 * StatementInput.jsx — Text input for the current speaker to type their statement.
 *
 * Modes:
 * - "turns"    (default): one statement at a time, alternating speakers
 * - "combined": paste a full back-and-forth conversation for bulk processing
 * - directMode (Moderator tab): chat with the AI about the map
 */

import { useState, useRef, useEffect } from "react";
import { speakerName } from "../utils/speakers.js";
import CoachMarks from "./CoachMarks.jsx";

const TOOLTIPS = {
  Skip:       { title: "Skip Turn",     desc: "Pass to the other speaker without adding anything to the map." },
  Undo:       { title: "Undo",          desc: "Remove the last submitted statement from the map." },
  Redo:       { title: "Redo",          desc: "Restore a previously undone statement." },
  "Add Node": { title: "Add Node",      desc: "Manually place a claim or argument onto the map." },
  Combined:   { title: "Combined Mode", desc: "Paste a full conversation to process multiple turns at once." },
  Turns:      { title: "Turns Mode",    desc: "Default mode — speakers alternate one statement at a time." },
  Changes:    { title: "AI Changes",    desc: "Review recent edits the AI made to your argument map." },
};

const SkipIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 3.5l7 4.5-7 4.5V3.5z"/>
    <rect x="11.5" y="3.5" width="2" height="9" rx="1"/>
  </svg>
);
const UndoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4H10C12.2 4 14 5.8 14 8s-1.8 4-4 4H4"/>
    <polyline points="5,2 3,4 5,6"/>
  </svg>
);
const RedoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H6C3.8 4 2 5.8 2 8s1.8 4 4 4h6"/>
    <polyline points="11,2 13,4 11,6"/>
  </svg>
);
const AddNodeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="2" y="2" width="12" height="12" rx="2.5"/>
    <line x1="8" y1="5" x2="8" y2="11"/>
    <line x1="5" y1="8" x2="11" y2="8"/>
  </svg>
);
const CombinedIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="3" y="5" width="10" height="9" rx="1.5"/>
    <path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2h5A1.5 1.5 0 0 1 13 3.5V5"/>
  </svg>
);
const TurnsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h8"/><polyline points="9,3 12,6 9,9"/>
    <path d="M13 10H5"/><polyline points="7,7 4,10 7,13"/>
  </svg>
);
const ChangesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2l1.5 3.2 3.5.5-2.5 2.4.6 3.5L8 10 4.9 11.6l.6-3.5L3 5.7l3.5-.5z"/>
  </svg>
);

function CtrlBtn({ icon, label, onClick, dormant, tooltipKey }) {
  const [tipPos, setTipPos] = useState(null);
  const timerRef = useRef(null);
  const btnRef  = useRef(null);
  const tooltip = TOOLTIPS[tooltipKey];

  const showTip = (delay) => {
    if (!tooltip) return;
    timerRef.current = setTimeout(() => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setTipPos({ bottom: window.innerHeight - r.top + 10, cx: r.left + r.width / 2 });
    }, delay);
  };
  const hideTip = () => { clearTimeout(timerRef.current); setTipPos(null); };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`ctrl-btn${dormant ? " ctrl-btn--dormant" : ""}`}
      onClick={dormant ? undefined : onClick}
      onMouseEnter={() => showTip(350)}
      onMouseLeave={hideTip}
      onTouchStart={() => showTip(600)}
      onTouchEnd={hideTip}
      onContextMenu={(e) => e.preventDefault()}
    >
      {tipPos && tooltip && (
        <div
          className="ctrl-tooltip"
          style={{ position: "fixed", bottom: tipPos.bottom, left: tipPos.cx, transform: "translateX(-50%)" }}
        >
          <strong>{tooltip.title}</strong>
          <p>{tooltip.desc}</p>
        </div>
      )}
      <span className="ctrl-icon">{icon}</span>
      <span className="ctrl-label">{label}</span>
    </button>
  );
}

export default function StatementInput({
  currentSpeaker, speakerSummary, onSubmit, onChatMessage,
  loading, loadingSpeaker, directMode, onSkipTurn,
  onUndo, onRedo, canUndo, canRedo,
  onAddNode, onReviewChanges, changeLogCount,
  theme, nameEditable, currentName, onNameChange, onRefreshName,
  inputMode, onModeChange, onCombinedSubmit, combiningProgress,
  showCoachMarks, onDismissCoachMarks, estimatedCost,
}) {
  const [text, setText] = useState("");
  const [combinedText, setCombinedText] = useState("");
  const [attachedImages, setAttachedImages] = useState([]);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const textareaRef  = useRef(null);
  const chevronRef   = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!loading) textareaRef.current?.focus();
  }, [loading]);

  // Auto-expand controls when coach marks are active
  useEffect(() => {
    if (showCoachMarks) setControlsExpanded(true);
  }, [showCoachMarks]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || loading) return;
    try {
      if (directMode) {
        await onChatMessage(text.trim());
      } else {
        await onSubmit(text.trim());
      }
      setText("");
      textareaRef.current?.focus();
    } catch {
      // keep text so user doesn't retype
    }
  };

  const handleCombinedProcess = async (e) => {
    e.preventDefault();
    if ((!combinedText.trim() && attachedImages.length === 0) || loading) return;
    try {
      await onCombinedSubmit(combinedText.trim(), attachedImages);
      setCombinedText("");
      setAttachedImages([]);
    } catch {
      // keep text so user doesn't retype
    }
  };

  const processImageFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(",")[1];
      setAttachedImages(prev => [...prev, { base64, mimeType: file.type, preview: dataUrl }]);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith("image/"));
    if (imageItems.length === 0) return; // let normal text paste happen
    e.preventDefault();
    imageItems.forEach(item => processImageFile(item.getAsFile()));
  };

  const speakerColor = theme?.a && currentSpeaker === "Blue" ? theme.a.bg
                     : theme?.b && currentSpeaker === "Green" ? theme.b.bg
                     : currentSpeaker === "Blue" ? "#3b82f6" : "#22c55e";
  const speakerGlow  = `${speakerColor}26`;
  const activeColor  = loading ? "#475569" : speakerColor;
  const activeGlow   = loading ? "rgba(71,85,105,0.15)" : speakerGlow;
  const isCombined   = inputMode === "combined";

  return (
    <form
      className="statement-input"
      style={{ "--speaker-color": activeColor, "--speaker-glow": activeGlow }}
      onSubmit={isCombined ? handleCombinedProcess : handleSubmit}
    >
      {/* Collapsible controls row — lives above the turn row so the chevron stays stationary */}
      {!directMode && (
        <div className={`controls-row${controlsExpanded && !loading ? " controls-row--expanded" : ""}`}>
          <CtrlBtn icon={<SkipIcon />}     label="Skip"     tooltipKey="Skip"     onClick={onSkipTurn}                   dormant={isCombined} />
          <CtrlBtn icon={<UndoIcon />}     label="Undo"     tooltipKey="Undo"     onClick={onUndo}                       dormant={!canUndo} />
          <CtrlBtn icon={<RedoIcon />}     label="Redo"     tooltipKey="Redo"     onClick={onRedo}                       dormant={!canRedo} />
          {!isCombined && <CtrlBtn icon={<AddNodeIcon />} label="Add Node" tooltipKey="Add Node" onClick={onAddNode} />}
          <CtrlBtn icon={<CombinedIcon />} label="Combined" tooltipKey="Combined" onClick={() => onModeChange("combined")} dormant={isCombined} />
          <CtrlBtn icon={<TurnsIcon />}    label="Turns"    tooltipKey="Turns"    onClick={() => onModeChange("turns")}    dormant={!isCombined} />
          {changeLogCount > 0 && (
            <CtrlBtn icon={<ChangesIcon />} label={`Changes (${changeLogCount})`} tooltipKey="Changes" onClick={onReviewChanges} />
          )}
        </div>
      )}

      {/* Turn indicator row */}
      <div className="turn-row">
        <div className="speaker-label" style={{ color: loading && loadingSpeaker ? "#475569" : speakerColor }}>
          {!loading && <span className="speaker-dot" style={{ background: activeColor }} />}
          {loading && combiningProgress ? (
            <>Processing turn {combiningProgress.current} of {combiningProgress.total}<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
          ) : loading && loadingSpeaker ? (
            <>Considering {speakerName(loadingSpeaker, theme)}'s statement<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span></>
          ) : nameEditable ? (
            <span className="name-edit-row">
              <button type="button" className="name-refresh-btn" onClick={onRefreshName} title="Generate a new name" style={{ color: speakerColor }}>⟳</button>
              <input
                className="name-edit-input"
                type="text"
                value={currentName}
                placeholder="Your name"
                size={Math.max(6, (currentName || "Your name").length + 1)}
                onChange={(e) => onNameChange(e.target.value)}
                style={{ color: speakerColor, borderColor: `${speakerColor}60` }}
              /><span>'s turn</span>
            </span>
          ) : (
            `${speakerName(currentSpeaker, theme)}'s turn`
          )}
        </div>
        {!loading && !directMode && (
          <button
            ref={chevronRef}
            type="button"
            className={`chevron-btn${controlsExpanded ? " chevron-btn--expanded" : ""}`}
            onClick={() => setControlsExpanded(v => !v)}
            aria-label={controlsExpanded ? "Hide controls" : "Show controls"}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,4 6,8 10,4"/>
            </svg>
          </button>
        )}
      </div>

      {/* Input row */}
      <div className="input-row">
        {isCombined ? (
          <textarea
            ref={textareaRef}
            autoFocus
            placeholder={"Paste your conversation here, or paste/attach a screenshot.\n\nSupports WhatsApp, iMessage, Slack, Discord, and plain text.\n\nExample:\nAlex: I think remote work is more productive.\nJordan: Studies show office workers collaborate better."}
            value={combinedText}
            onChange={(e) => setCombinedText(e.target.value)}
            onPaste={handlePaste}
            disabled={loading}
            rows={5}
          />
        ) : (
          <textarea
            ref={textareaRef}
            autoFocus
            placeholder={
              directMode
                ? "Ask the AI moderator anything..."
                : `${speakerName(currentSpeaker, theme)}, say whatever you want...`
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={loading}
            rows={3}
          />
        )}
        {isCombined && attachedImages.length > 0 && (
          <div className="combined-image-previews">
            {attachedImages.map((img, i) => (
              <div key={i} className="combined-image-thumb">
                <img src={img.preview} alt={`Screenshot ${i + 1}`} />
                <button
                  type="button"
                  className="combined-image-remove"
                  onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
                >✕</button>
              </div>
            ))}
          </div>
        )}
        {isCombined && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => Array.from(e.target.files || []).forEach(processImageFile)}
          />
        )}
        <div className="input-btn-col">
          {isCombined && (
            <button
              type="button"
              className="combined-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Attach screenshot"
            >
              📎
            </button>
          )}
          <button
            type="submit"
            disabled={loading || (isCombined ? (!combinedText.trim() && attachedImages.length === 0) : !text.trim())}
          >
            {loading
              ? (combiningProgress ? "Processing..." : "Thinking...")
              : (isCombined ? "Process" : "Submit")}
          </button>
          {!loading && !directMode && !isCombined && estimatedCost && (
            <span className="cost-estimate">~{estimatedCost}</span>
          )}
        </div>
      </div>

      {showCoachMarks && (
        <CoachMarks
          chevronRef={chevronRef}
          textareaRef={textareaRef}
          onDismiss={onDismissCoachMarks}
        />
      )}
    </form>
  );
}
