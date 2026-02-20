/**
 * ModeratorGauge.jsx — Floating draggable gauge showing debate leaning.
 *
 * Displays a horizontal track with a marker indicating which side
 * the AI moderator thinks has the stronger argument.
 * Click to open the detail popup.
 */

import { useState, useRef, useCallback } from "react";

export default function ModeratorGauge({ analysis, onShowDetail }) {
  const [position, setPosition] = useState({ x: 16, y: null }); // null y = use bottom default
  const gaugeRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleGripMouseDown = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = gaugeRef.current.getBoundingClientRect();
    const parentRect = gaugeRef.current.parentElement.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left + parentRect.left,
      y: e.clientY - rect.top + parentRect.top,
    };

    const onMouseMove = (e) => {
      const parentRect = gaugeRef.current.parentElement.getBoundingClientRect();
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      // Clamp within parent bounds
      const maxX = parentRect.width - rect.width;
      const maxY = parentRect.height - rect.height;
      setPosition({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY)),
      });
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  if (!analysis) return null;

  // Map leaning (-1 to +1) to percentage (0% to 100%)
  const pct = ((analysis.leaning + 1) / 2) * 100;

  // Dot color: blue when leaning A, gray when neutral, green when leaning B
  let markerColor = "#1e293b"; // neutral dark
  if (analysis.leaning < -0.1) markerColor = "#3b82f6"; // blue
  if (analysis.leaning > 0.1) markerColor = "#22c55e"; // green

  const style = {
    left: position.x,
    ...(position.y !== null
      ? { top: position.y }
      : { bottom: 16 }),
  };

  return (
    <div
      ref={gaugeRef}
      className="moderator-gauge"
      style={style}
      onClick={onShowDetail}
    >
      <div
        className="gauge-header"
        onMouseDown={handleGripMouseDown}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="gauge-grip">&#x2630;</span>
        <span className="gauge-title">Moderator</span>
      </div>
      <div className="gauge-labels">
        <span className="gauge-label-a">Blue</span>
        <span className="gauge-label-b">Green</span>
      </div>
      <div className="gauge-track">
        <div
          className="gauge-marker"
          style={{ left: `${pct}%`, backgroundColor: markerColor }}
        />
      </div>
    </div>
  );
}
