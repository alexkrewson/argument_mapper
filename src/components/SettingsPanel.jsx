import { useState, useEffect, useRef } from "react";
import { THEMES } from "../utils/themes.js";

export default function SettingsPanel({ currentThemeKey, onThemeChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="settings-wrap" ref={ref}>
      <button
        className={`settings-btn${open ? " settings-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Settings"
        aria-label="Settings"
      >
        ⚙
      </button>

      {open && (
        <div className="settings-dropdown">
          {[false, true].map((isDark) => {
            const entries = Object.entries(THEMES).filter(([, t]) => !!t.dark === isDark);
            if (entries.length === 0) return null;
            return (
              <div key={String(isDark)}>
                <div className="settings-section-label">
                  {isDark ? "🌙 Dark" : "☀ Light"}
                </div>
                {entries.map(([key, theme]) => (
                  <button
                    key={key}
                    className={`theme-option${key === currentThemeKey ? " theme-option--active" : ""}`}
                    onClick={() => { onThemeChange(key); setOpen(false); }}
                  >
                    <span className="theme-swatches">
                      <span className="theme-swatch" style={{ backgroundColor: theme.a.bg }} />
                      <span className="theme-swatch" style={{ backgroundColor: theme.b.bg }} />
                    </span>
                    <span className="theme-label">{theme.label}</span>
                    <span className="theme-names">
                      {theme.a.name} · {theme.b.name}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
