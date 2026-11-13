import { Icon, icons } from "./Icon.jsx";
import { formatDate, statusClass } from "../lib/format.js";

const FIELDS = [
  { key: "candidate", label: "CANDIDATE / RECORD" },
  { key: "exam", label: "EXAMINATION" },
  { key: "result", label: "RESULT" },
  { key: "date", label: "DATE SUBMITTED" },
  { key: "status", label: "STATUS" },
];

export default function RecordsTable({ records, onOpen, emptyHint = true }) {
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
      {records.map((r) => (
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
          <div className="record-fields">
            {FIELDS.map((f) => {
              let value;
              if (f.key === "candidate") {
                value = (
                  <>
                    <strong className="record-id">{r.candidateId}</strong>
                    <span className="cell-sub">{r.candidateName || "—"}</span>
                  </>
                );
              } else if (f.key === "exam") {
                value = r.exam;
              } else if (f.key === "result") {
                value = r.result || "—";
              } else if (f.key === "date") {
                value = formatDate(r.createdAt);
              } else {
                value = (
                  <span className={`badge ${statusClass(r.status)}`}>{r.status}</span>
                );
              }
              return (
                <div key={f.key} className="record-field">
                  <span className="record-label">{f.label}</span>
                  <span className="record-value">{value}</span>
                </div>
              );
            })}
          </div>
          <div className="record-open">
            <Icon d={icons.chevronRight} size={16} />
          </div>
        </section>
      ))}
    </div>
  );
}
