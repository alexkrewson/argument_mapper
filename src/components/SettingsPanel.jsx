import { useState, useEffect, useRef } from "react";
import { THEMES } from "../utils/themes.js";
import { supabase } from "../utils/supabase";
import { copyText } from "../utils/clipboard";

function formatCredits(cents) {
  if (cents == null) return null;
  if (cents < 0) return "0.00¢";
  if (cents < 100) return `${Number(cents).toFixed(2)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

const Chevron = ({ open }) => (
  <span className="settings-section-chevron">{open ? "▲" : "▼"}</span>
);

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: "auto" }}>
    <rect x="5" y="5" width="9" height="9" rx="1.5"/>
    <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/>
  </svg>
);

const SUPPORT_EMAIL = "support@trolleysolution.com";

export default function SettingsPanel({ currentThemeKey, onThemeChange, onThemePreviewStart, onThemePreviewEnd, user, onOpenAuth, gameMode, onGameModeChange, gameSounds, onGameSoundsChange, creditBalance, onBuyCredits, onCopyContext }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const ref = useRef(null);

  // deleteAccount=false wipes this app's data and leaves the login intact.
  // deleteAccount=true also removes the login, which Google Play requires an
  // app with account creation to offer — but the login is shared with the other
  // apps in this Supabase project, so it's confirmed separately.
  const handleDeleteData = async (deleteAccount = false) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in.");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ deleteAccount }),
        }
      );
      if (!resp.ok) {
        throw new Error(
          deleteAccount
            ? "Couldn't delete your account. Try again."
            : "Couldn't delete your data. Try again."
        );
      }
      await supabase.auth.signOut();
      setConfirmDelete(false);
      setOpen(false);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Close on outside click or touch
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        onThemePreviewEnd?.();
        setConfirmDelete(false);
        setDeleteError(null);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open, onThemePreviewEnd]);

  return (
    <div className="settings-wrap" ref={ref}>
      <button
        className={`settings-btn${open ? " settings-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Settings"
        aria-label="Settings"
        data-testid="settings-btn"
      >
        ⚙
      </button>

      {open && (
        <div className="settings-dropdown" data-testid="settings-dropdown">

          {/* Account */}
          <button
            className="settings-section-label settings-section-toggle"
            onClick={() => setShowAccount(v => !v)}
            data-testid="settings-account-toggle"
          >
            Account <Chevron open={showAccount} />
          </button>
          {showAccount && (
            <>
              {user ? (
                <>
                  {creditBalance != null && (
                    <div className="settings-credits-card">
                      <span className="settings-credits-amount" data-testid="settings-credits-amount">{formatCredits(creditBalance)}</span>
                      <span className="settings-credits-unit">remaining</span>
                      <button className="settings-credits-buy" data-testid="settings-buy-credits" onClick={() => { onBuyCredits(); setOpen(false); }}>
                        Top up
                      </button>
                    </div>
                  )}
                  <div className="settings-user-email" data-testid="settings-user-email">{user.email}</div>
                  <button className="theme-option" data-testid="settings-change-password" onClick={() => { onOpenAuth("change_password"); setOpen(false); }}>
                    Change password
                  </button>
                  <button className="theme-option" data-testid="settings-signout" onClick={() => { supabase.auth.signOut(); setOpen(false); }}>
                    Sign out
                  </button>
                  {!confirmDelete ? (
                    <button className="theme-option" data-testid="settings-delete-data-btn" onClick={() => setConfirmDelete(true)}>
                      Delete my data
                    </button>
                  ) : (
                    <div className="settings-delete-confirm" data-testid="settings-delete-confirm">
                      <p>
                        Permanently deletes all your saved productive disagreements and credit balance.
                        Your sign-in stays, so you can start fresh. This can't be undone.
                      </p>
                      {deleteError && <p className="settings-delete-error">{deleteError}</p>}
                      {/* Explicit arrow: passing the handler directly would hand
                          React's click event in as deleteAccount, which is truthy. */}
                      <button className="theme-option" data-testid="settings-delete-confirm-yes" onClick={() => handleDeleteData(false)} disabled={deleting}>
                        {deleting ? "Deleting…" : "Yes, delete my data"}
                      </button>
                      {!confirmAccount ? (
                        <button className="theme-option" data-testid="settings-delete-account-btn" onClick={() => setConfirmAccount(true)} disabled={deleting}>
                          Delete my account too
                        </button>
                      ) : (
                        <div data-testid="settings-delete-account-confirm">
                          <p>
                            This also removes your sign-in. The same login is used
                            across our other apps, so you'll lose access to those too.
                          </p>
                          <button className="theme-option" data-testid="settings-delete-account-yes" onClick={() => handleDeleteData(true)} disabled={deleting}>
                            {deleting ? "Deleting…" : "Delete data and account"}
                          </button>
                        </div>
                      )}
                      <button className="theme-option" data-testid="settings-delete-confirm-cancel" onClick={() => { setConfirmDelete(false); setConfirmAccount(false); }} disabled={deleting}>
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button className="theme-option" data-testid="settings-signin-open" onClick={() => { onOpenAuth(); setOpen(false); }}>
                  Sign in / Sign up
                </button>
              )}
            </>
          )}

          {/* Help */}
          <button
            className="settings-section-label settings-section-label--themes settings-section-toggle"
            onClick={() => setShowHelp(v => !v)}
            data-testid="settings-help-toggle"
          >
            Help <Chevron open={showHelp} />
          </button>
          {showHelp && (
            <>
              <button
                className="theme-option"
                data-testid="settings-contact-dev"
                onClick={async () => {
                  // Only confirm on success — this used to claim "copied" even
                  // when the Android WebView had rejected the write.
                  if (!(await copyText(SUPPORT_EMAIL))) return;
                  setEmailCopied(true);
                  setTimeout(() => setEmailCopied(false), 2500);
                }}
              >
                Contact Developer
                <CopyIcon />
              </button>
              {emailCopied && (
                <div className="settings-email-copied" data-testid="settings-email-copied">
                  {SUPPORT_EMAIL}<br/>copied to clipboard
                </div>
              )}
            </>
          )}

          {/* Advanced */}
          <button
            className="settings-section-label settings-section-label--themes settings-section-toggle"
            onClick={() => setShowAdvanced(v => !v)}
            data-testid="settings-advanced-toggle"
          >
            Advanced <Chevron open={showAdvanced} />
          </button>
          {showAdvanced && (
            <div className="settings-advanced-content">
              <div className="settings-section-label settings-section-label--sub">Game Mode</div>

              <label className="settings-toggle-row">
                <span className="settings-toggle-label">Etiquette points</span>
                <span
                  className={`settings-toggle${gameMode ? " settings-toggle--on" : ""}`}
                  onClick={() => onGameModeChange(!gameMode)}
                  role="switch"
                  aria-checked={gameMode}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") onGameModeChange(!gameMode); }}
                  data-testid="settings-game-mode-toggle"
                >
                  <span className="settings-toggle-thumb" />
                </span>
              </label>

              <label className={`settings-toggle-row${!gameMode ? " settings-toggle-row--dormant" : ""}`}>
                <span className="settings-toggle-label">Point sounds</span>
                <span
                  className={`settings-toggle${gameSounds && gameMode ? " settings-toggle--on" : ""}`}
                  onClick={() => { if (gameMode) onGameSoundsChange(!gameSounds); }}
                  role="switch"
                  aria-checked={gameSounds && gameMode}
                  tabIndex={gameMode ? 0 : -1}
                  onKeyDown={(e) => { if (gameMode && (e.key === " " || e.key === "Enter")) onGameSoundsChange(!gameSounds); }}
                  data-testid="settings-game-sounds-toggle"
                >
                  <span className="settings-toggle-thumb" />
                </span>
              </label>

              {onCopyContext && (
                <>
                  <div className="settings-section-label settings-section-label--sub settings-section-label--spaced">Debug</div>
                  <button
                    className="theme-option"
                    data-testid="settings-copy-json"
                    onClick={() => {
                      onCopyContext();
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "✓ Copied!" : "Copy map JSON"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Themes */}
          <button
            className="settings-section-label settings-section-label--themes settings-section-toggle"
            onClick={() => setShowThemes(v => !v)}
            data-testid="settings-themes-toggle"
          >
            Themes <Chevron open={showThemes} />
          </button>
          {showThemes && (
            <div onMouseLeave={() => onThemePreviewEnd?.()}>
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
                        onMouseEnter={() => onThemePreviewStart?.(key)}
                        onClick={() => { onThemeChange(key); setOpen(false); }}
                        data-testid={`theme-option-${key}`}
                      >
                        <span
                          className={`theme-swatches${theme.dark ? " theme-swatches--dark" : ""}`}
                          style={{ backgroundColor: theme.panelBg }}
                        >
                          <span className="theme-swatch" style={{ backgroundColor: theme.a.bg }} />
                          <span className="theme-swatch" style={{ backgroundColor: theme.b.bg }} />
                        </span>
                        <span className="theme-label">{theme.label}</span>
                        <span className="theme-names">{theme.a.name} · {theme.b.name}</span>
                        {key === currentThemeKey && <span className="theme-active-check">✓</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
