import { useState, useEffect, useRef } from "react";
import { THEMES } from "../utils/themes.js";
import { supabase } from "../utils/supabase";

function formatCredits(cents) {
  if (cents == null) return null;
  if (cents < 0) return "0.00¢";
  if (cents < 100) return `${Number(cents).toFixed(2)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SettingsPanel({ currentThemeKey, onThemeChange, user, onOpenAuth, gameMode, onGameModeChange, onStartTour, creditBalance, onBuyCredits }) {
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
          <div>
            <div className="settings-section-label">Account</div>
            {user ? (
              <>
                <div className="settings-user-email">{user.email}</div>
                {creditBalance != null && (
                  <div className="settings-credits-row">
                    <span className="settings-credits-balance">{formatCredits(creditBalance)} remaining</span>
                    <button className="settings-credits-buy" onClick={() => { onBuyCredits(); setOpen(false); }}>
                      Buy credits
                    </button>
                  </div>
                )}
                <button className="theme-option" onClick={() => { supabase.auth.signOut(); setOpen(false); }}>
                  Sign out
                </button>
              </>
            ) : (
              <button className="theme-option" onClick={() => { onOpenAuth(); setOpen(false); }}>
                Sign in / Sign up
              </button>
            )}
          </div>
          <div className="settings-section-label settings-section-label--themes">Help</div>
          <button className="theme-option" onClick={() => { onStartTour(); setOpen(false); }}>
            Take a tour
          </button>
          <div className="settings-section-label settings-section-label--themes">Game Mode</div>
          <label className="settings-toggle-row">
            <span className="settings-toggle-label">🎮 Points &amp; sounds</span>
            <span
              className={`settings-toggle${gameMode ? " settings-toggle--on" : ""}`}
              onClick={() => onGameModeChange(!gameMode)}
              role="switch"
              aria-checked={gameMode}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") onGameModeChange(!gameMode); }}
            >
              <span className="settings-toggle-thumb" />
            </span>
          </label>
          <div className="settings-section-label settings-section-label--themes">Themes</div>
          {[false, true].map((isDark) => {
            const entries = Object.entries(THEMES).filter(([, t]) => !!t.dark === isDark);
            if (entries.length === 0) return null;
            return (
              <div key={String(isDark)}>
                <div className="settings-section-label settings-section-label--sub">
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
