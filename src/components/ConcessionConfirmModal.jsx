/**
 * ConcessionConfirmModal.jsx — Popup asking the user to confirm a concession
 * that Claude detected in their submitted statement.
 *
 * type "other" — speaker agreed with the opposing speaker's node (rating: "up")
 * type "self"  — speaker retracted one of their own nodes (rating: "down")
 */

import { speakerName, speakerBorder } from "../utils/speakers.js";

export default function ConcessionConfirmModal({ concession, onConfirm, onDismiss, theme }) {
  const { type, content, nodeSpeaker, concedingBy, agreedByText } = concession;
  const isSelf = type === "self";

  return (
    <div className="concession-overlay">
      <div className="concession-modal">
        <div className="concession-modal-header">
          {isSelf ? "Self-retraction detected" : "Concession detected"}
        </div>

        <p className="concession-modal-body">
          {isSelf ? (
            <>
              It looks like{" "}
              <span
                className="concession-speaker-chip"
                style={{ backgroundColor: speakerBorder(concedingBy, theme) }}
              >
                {speakerName(concedingBy, theme)}
              </span>{" "}
              is retracting their own statement:
            </>
          ) : (
            <>
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
            </>
          )}
        </p>

        <blockquote className="concession-quote">{content}</blockquote>

        {agreedByText && (
          <p className="concession-original">
            "{agreedByText}"
          </p>
        )}

        <div className="concession-modal-actions">
          <button className="concession-btn-confirm" onClick={onConfirm}>
            {isSelf ? "Yes, retract this point" : "Yes, concede this point"}
          </button>
          <button className="concession-btn-dismiss" onClick={onDismiss}>
            No, ignore
          </button>
        </div>
      </div>
    </div>
  );
}
