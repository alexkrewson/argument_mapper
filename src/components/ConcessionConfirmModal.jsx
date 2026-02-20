/**
 * ConcessionConfirmModal.jsx — Popup asking the user to confirm a concession
 * that Claude detected in their submitted statement.
 */

import { speakerName, speakerBorder } from "../utils/speakers.js";

export default function ConcessionConfirmModal({ concession, onConfirm, onDismiss, theme }) {
  const { content, nodeSpeaker, concedingBy, agreedByText } = concession;

  return (
    <div className="concession-overlay">
      <div className="concession-modal">
        <div className="concession-modal-header">
          Concession detected
        </div>

        <p className="concession-modal-body">
          It looks like{" "}
          <span
            className="concession-speaker-chip"
            style={{ backgroundColor: speakerBorder(concedingBy, theme) }}
          >
            {speakerName(concedingBy, theme)}
          </span>{" "}
          is agreeing with{" "}
          <span
            className="concession-speaker-chip"
            style={{ backgroundColor: speakerBorder(nodeSpeaker, theme) }}
          >
            {speakerName(nodeSpeaker, theme)}
          </span>
          's statement:
        </p>

        <blockquote className="concession-quote">{content}</blockquote>

        {agreedByText && (
          <p className="concession-original">
            "{agreedByText}"
          </p>
        )}

        <div className="concession-modal-actions">
          <button className="concession-btn-confirm" onClick={onConfirm}>
            Yes, concede this point
          </button>
          <button className="concession-btn-dismiss" onClick={onDismiss}>
            No, ignore
          </button>
        </div>
      </div>
    </div>
  );
}
