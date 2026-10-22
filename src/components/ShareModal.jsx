import { useState, useEffect } from "react";
import { copyText } from "../utils/clipboard";
import { shareUrl, getShareToken, enableShare, disableShare } from "../utils/share";

// Owner's side of a view-only link: turn it on, copy it, turn it off.
// debateId is null until the first auto-save lands, which takes 1.5s after
// the first node; the modal says so rather than inventing a row.
export default function ShareModal({ debateId, onClose }) {
  const [token, setToken]   = useState(undefined); // undefined = loading, null = off
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!debateId) return;
    let live = true;
    getShareToken(debateId)
      .then((t) => { if (live) setToken(t); })
      .catch(() => { if (live) { setToken(null); setError("Couldn't check this map's link. Try again."); } });
    return () => { live = false; };
  }, [debateId]);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try { await fn(); } catch { setError("That didn't work. Check your connection and try again."); }
    setBusy(false);
  };

  const handleCopy = async () => {
    setCopied(await copyText(shareUrl(token)));
  };

  let body;
  if (!debateId) {
    body = <p className="concession-modal-body">This map hasn't been saved yet. Give it a moment, then try again.</p>;
  } else if (token === undefined) {
    body = <p className="concession-modal-body">Checking…</p>;
  } else if (token === null) {
    body = (
      <>
        <p className="concession-modal-body">
          Anyone with the link can watch this map update live, without an account.
          They can't change anything.
        </p>
        <div className="concession-modal-actions">
          <button className="concession-btn-confirm" data-testid="share-enable" disabled={busy}
                  onClick={() => run(async () => setToken(await enableShare(debateId)))}>
            {busy ? "Creating…" : "Create view-only link"}
          </button>
          <button className="concession-btn-dismiss" onClick={onClose}>Cancel</button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className="concession-modal-body">
          Anyone with this link can watch this map update live. They can't change anything.
        </p>
        <input className="auth-input share-link-input" data-testid="share-link" readOnly
               value={shareUrl(token)} onFocus={(e) => e.target.select()} />
        {copied && <p className="share-copied" role="status">Link copied</p>}
        <div className="concession-modal-actions">
          <button className="concession-btn-confirm" data-testid="share-copy" onClick={handleCopy}>Copy link</button>
          <button className="concession-btn-dismiss" data-testid="share-disable" disabled={busy}
                  onClick={() => run(async () => { await disableShare(debateId); setToken(null); })}>
            {busy ? "Stopping…" : "Stop sharing"}
          </button>
        </div>
        <p className="share-note">Stop sharing turns this link off for good. A new link can be made any time.</p>
      </>
    );
  }

  return (
    <div className="concession-overlay" data-testid="share-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="concession-modal auth-modal">
        <div className="concession-modal-header">Share view-only</div>
        {body}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
