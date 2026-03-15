import { useState, useRef, useEffect } from "react";
import { supabase } from "../utils/supabase";

export default function AuthButton({ user, onOpenAuth }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!user) {
    return (
      <button className="settings-btn" onClick={onOpenAuth} type="button">
        Log in
      </button>
    );
  }

  return (
    <div className="settings-wrap" ref={ref}>
      <button
        className={`settings-btn auth-user-chip${open ? " settings-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
        title={user.email}
      >
        {user.email.split("@")[0]}
      </button>
      {open && (
        <div className="settings-dropdown auth-dropdown">
          <div className="settings-section-label">{user.email}</div>
          <button
            className="theme-option"
            onClick={async () => { await supabase.auth.signOut(); setOpen(false); }}
            type="button"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
