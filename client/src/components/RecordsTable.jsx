import { useState } from "react";
import { Icon, icons } from "./Icon.jsx";
import { formatDate, initials, statusClass } from "../lib/format.js";
import { generateVerificationPdf } from "../lib/pdf.js";

const FIELDS = [
  { key: "exam", label: "EXAMINATION" },
  { key: "result", label: "RESULT" },
  { key: "date", label: "DATE SUBMITTED" },
];

const downloadPdf = async (record) => {
  const blob = generateVerificationPdf(record);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `VERIFYAI-Verification-${record.candidateId || record.id}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default function RecordsTable({ records, onOpen, emptyHint = true }) {
  const [generating, setGenerating] = useState(null);

  if (records.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Icon d={icons.archive} size={30} />
        </div>
        <strong>No records found</strong>
        {emptyHint && <span>Try changing your search or create a new verification.</span>}
      </div>
    );
  }

  return (
    <div className="records-list">
      {records.map((r) => {
        const busy = generating === r.id;
        return (
          <section
            key={r.id}
            className="record-card"
            onClick={() => onOpen(r)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(r);
            }}
          >
            <div className="record-avatar">
              {initials(r.candidateName || r.candidateId)}
            </div>
            <div className="record-body">
              <div className="record-identity">
                <div className="record-names">
                  <strong className="record-id">{r.candidateId}</strong>
                  <span className="cell-sub">{r.candidateName || "—"}</span>
                </div>
                <span className={`badge ${statusClass(r.status)}`}>{r.status}</span>
              </div>
              <div className="record-fields">
                {FIELDS.map((f) => {
                  const value =
                    f.key === "exam"
                      ? r.exam
                      : f.key === "result"
                        ? r.result || "—"
                        : formatDate(r.createdAt);
                  return (
                    <div key={f.key} className="record-field">
                      <span className="record-label">{f.label}</span>
                      <span className="record-value">{value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="record-actions">
              <button
                className="btn-download"
                onClick={(e) => {
                  e.stopPropagation();
                  setGenerating(r.id);
                  downloadPdf(r)
                    .catch(() => {})
                    .finally(() => setGenerating(null));
                }}
                disabled={busy}
                aria-label={`Download verification PDF for ${r.candidateId}`}
                title="Download verification PDF"
              >
                {busy ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  </>
                ) : (
                  <>
                    <Icon d={icons.download} size={14} />
                    <span>Download PDF</span>
                  </>
                )}
              </button>
              <div className="record-open">
                <Icon d={icons.chevronRight} size={14} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
