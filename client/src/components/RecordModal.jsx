import { useState } from "react";
import { Icon, icons } from "./Icon.jsx";
import FindingsList from "./FindingsList.jsx";
import { formatDate, statusClass } from "../lib/format.js";

const VERDICT_LABEL = {
  match: "Sources agree",
  mismatch: "Discrepancies found",
  incomplete: "Incomplete comparison",
  unavailable: "Official source unavailable",
};

const VERDICT_BADGE = {
  match: "badge-verified",
  mismatch: "badge-escalated",
  incomplete: "badge-amber",
  unavailable: "badge-blue",
};

export default function RecordModal({ record, onClose, onDecide, busy }) {
  const [reviewer, setReviewer] = useState("Authorised Officer");
  const [note, setNote] = useState("");

  if (!record) return null;

  const field = (label, value) => (
    <div className="result-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Record detail">
        <div className="modal-head">
          <div>
            <div className="eyebrow">RECORD DETAIL</div>
            <h2>{record.candidateId}</h2>
          </div>
          <button className="icon-btn bordered" onClick={onClose} aria-label="Close">
            <Icon d={icons.close} size={16} />
          </button>
        </div>

        <div className="modal-grid">
          {field("Candidate name", record.candidateName || "—")}
          {field("Examination", record.exam || "—")}
          {record.examNumber && field("Exam number", record.examNumber)}
          {record.examYear && field("Exam year", record.examYear)}
          {field("Result", record.result || "—")}
          {field("Date submitted", formatDate(record.createdAt))}
          {field(
            "Status",
            <span className={`badge ${statusClass(record.status)}`}>{record.status}</span>
          )}
          {record.verdict &&
            field(
              "Comparison",
              <span className={`badge ${VERDICT_BADGE[record.verdict] || "badge-pending"}`}>
                {VERDICT_LABEL[record.verdict] || record.verdict}
              </span>
            )}
          {field("Reviewer", record.reviewedBy || "—")}
        </div>

        <div className="modal-section">
          <span className="field-label">AI check findings</span>
          <FindingsList findings={record.findings} />
        </div>

        {record.imageUrl && (
          <div className="modal-section">
            <span className="field-label">Uploaded result photo</span>
            <img className="record-image" src={record.imageUrl} alt="Uploaded result slip" loading="lazy" />
          </div>
        )}

        {record.sourceText && (
          <div className="modal-section">
            <span className="field-label">Pasted source text</span>
            <p className="source-text">{record.sourceText}</p>
          </div>
        )}

        <div className="review-box">
          <label className="field">
            <span className="field-label">Reviewer name</span>
            <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Review note</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional audit note"
            />
          </label>
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn danger" disabled={busy} onClick={() => onDecide("Escalated", reviewer, note)}>
            Escalate
          </button>
          <button className="btn primary" disabled={busy} onClick={() => onDecide("Verified", reviewer, note)}>
            <Icon d={icons.check} size={16} /> Mark verified
          </button>
        </div>
      </div>
    </div>
  );
}
