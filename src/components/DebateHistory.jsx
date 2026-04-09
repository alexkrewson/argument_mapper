import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DebateHistory({ user, onLoadDebate, onNewDebate }) {
  const [debates, setDebates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmLoad, setConfirmLoad] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // debate to delete after confirm

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("debates")
      .select("id, title, created_at, updated_at, speaker_a, speaker_b, map_data")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setDebates(data ?? []);
        setLoading(false);
      });
  }, [user]);

  const handleDelete = async (id) => {
    const { error } = await supabase.from("debates").delete().eq("id", id);
    if (!error) setDebates((prev) => prev.filter((d) => d.id !== id));
    setConfirmDelete(null);
  };

  const newArgBtn = (
    <button className="history-new-btn" onClick={onNewDebate}>+ New Argument</button>
  );

  if (loading) {
    return <div className="history-loading">{newArgBtn}Loading debates...</div>;
  }

  if (error) {
    return <div className="history-error">{newArgBtn}{error}</div>;
  }

  if (debates.length === 0) {
    return (
      <div className="history-empty">
        {newArgBtn}
        <p>No saved debates yet.</p>
        <p>Sign in and start debating — your arguments will be saved automatically.</p>
      </div>
    );
  }

  return (
    <div className="history-list">
      {newArgBtn}
      {confirmLoad && (
        <div className="concession-overlay">
          <div className="concession-modal">
            <div className="concession-modal-header">Load debate?</div>
            <p className="concession-modal-body">This will replace your current debate. Any unsaved progress will be lost.</p>
            <div className="concession-modal-actions">
              <button className="concession-btn-confirm" onClick={() => { onLoadDebate(confirmLoad); setConfirmLoad(null); }}>
                Load anyway
              </button>
              <button className="concession-btn-dismiss" onClick={() => setConfirmLoad(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="concession-overlay">
          <div className="concession-modal">
            <div className="concession-modal-header">Delete forever?</div>
            <p className="concession-modal-body">Are you sure you want to delete this conversation forever?</p>
            <div className="concession-modal-actions">
              <button className="concession-btn-confirm" onClick={() => handleDelete(confirmDelete)}>
                Delete
              </button>
              <button className="concession-btn-dismiss" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {debates.map((d) => {
        const nodeCount = d.map_data?.map?.argument_map?.nodes?.length ?? 0;
        return (
          <div className="history-row" key={d.id}>
            <div className="history-row-info">
              <span className="history-row-title history-row-title--clickable" onClick={() => setConfirmLoad(d)}>
                {d.title}
              </span>
              <span className="history-row-meta">
                {formatDate(d.updated_at)}
                {d.speaker_a && d.speaker_b && ` · ${d.speaker_a} vs ${d.speaker_b}`}
                {` · ${nodeCount} node${nodeCount !== 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="history-row-actions">
              <button className="history-delete-btn" onClick={() => setConfirmDelete(d.id)} title="Delete">✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
