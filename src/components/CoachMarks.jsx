import { useEffect, useState } from "react";

export default function CoachMarks({ chevronRef, textareaRef, onDismiss }) {
  const [rects, setRects] = useState({});

  useEffect(() => {
    setRects({
      chevron: chevronRef?.current?.getBoundingClientRect(),
      textarea: textareaRef?.current?.getBoundingClientRect(),
    });
  }, []);

  const dismiss = () => {
    localStorage.setItem("argmap_coached", "true");
    onDismiss();
  };

  const W = window.innerWidth;
  const H = window.innerHeight;

  return (
    <div className="coach-overlay" onClick={dismiss}>
      {/* General hint — upper-center */}
      <div
        className="coach-callout"
        style={{ position: "fixed", top: "22vh", left: "50%", transform: "translateX(-50%)", width: 220 }}
        onClick={(e) => e.stopPropagation()}
      >
        <strong>Long-press any button</strong>
        <span>Hold a control for half a second to see what it does.</span>
      </div>

      {/* Textarea callout — above the input */}
      {rects.textarea && (
        <div
          className="coach-callout"
          style={{
            position: "fixed",
            bottom: H - rects.textarea.top + 12,
            left: Math.max(8, Math.min(W - 216, rects.textarea.left + rects.textarea.width / 2 - 108)),
            width: 200,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <strong>Type your argument here</strong>
          <span>State your claim, concession, or rebuttal.</span>
          <div className="coach-arrow coach-arrow--down" />
        </div>
      )}

      {/* Chevron callout — above the chevron, right-aligned */}
      {rects.chevron && (
        <div
          className="coach-callout"
          style={{
            position: "fixed",
            bottom: H - rects.chevron.top + 12,
            right: W - rects.chevron.right,
            width: 180,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <strong>Tap to reveal controls</strong>
          <span>Expand undo, redo, skip, and more.</span>
          <div className="coach-arrow coach-arrow--down-right" />
        </div>
      )}

      <button className="coach-got-it" onClick={dismiss}>Got it</button>
    </div>
  );
}
