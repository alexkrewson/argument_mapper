import { useState } from "react";

export default function SaveDebateModal({ defaultTitle, onSave, onClose, loading }) {
  const [title, setTitle] = useState(defaultTitle || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(title.trim());
  };

  return (
    <div className="concession-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="concession-modal auth-modal">
        <div className="concession-modal-header">Save debate</div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="text"
            placeholder="Give this debate a title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
          <div className="concession-modal-actions">
            <button className="concession-btn-confirm" type="submit" disabled={loading || !title.trim()}>
              {loading ? "Saving..." : "Save"}
            </button>
            <button className="concession-btn-dismiss" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
