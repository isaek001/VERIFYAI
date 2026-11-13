import FindingsList from "../FindingsList.jsx";
import { Icon, icons } from "../Icon.jsx";

const VERDICTS = {
  match: {
    label: "Sources agree",
    badge: "badge-verified",
    banner: "v-match",
    icon: icons.check,
    note: "Every compared field agrees. Save the record for authorised human review.",
  },
  mismatch: {
    label: "Discrepancies found",
    badge: "badge-escalated",
    banner: "v-mismatch",
    icon: icons.alert,
    note: "The photo disagrees with the official record. Saving will mark this record Escalated.",
  },
  incomplete: {
    label: "Incomplete comparison",
    badge: "badge-amber",
    banner: "v-incomplete",
    icon: icons.alert,
    note: "Some fields could not be compared. Human review must confirm the rest.",
  },
  unavailable: {
    label: "Official source unavailable",
    badge: "badge-blue",
    banner: "v-unavailable",
    icon: icons.shield,
    note: "The official record could not be fetched. Only the uploaded photo was captured.",
  },
};

const IDENTITY_STATUS = {
  match: "Match",
  differ: "Differs",
  missing: "Not on photo",
  unknown: "Not compared",
};

const SUBJECT_STATUS = {
  match: "Match",
  differ: "Differs",
  "missing-photo": "Not on photo",
  "missing-official": "Not official",
  unknown: "Not compared",
};

function DetailLine({ label, value }) {
  return (
    <div className="src-line">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function SourceCard({ icon, title, chip, chipTone, data, unavailableMessage, subjectLabel }) {
  return (
    <div className="source-card">
      <div className="source-card-head">
        <div className="source-card-icon">
          <Icon d={icon} size={17} />
        </div>
        <strong>{title}</strong>
        {chip && <span className={`source-chip ${chipTone || ""}`}>{chip}</span>}
      </div>

      {data && data.ok ? (
        <>
          <div className="source-lines">
            <DetailLine label="Candidate name" value={data.candidateName} />
            <DetailLine label="Exam number" value={data.examNumber} />
            <DetailLine label="Exam year" value={data.examYear} />
            {data.center ? <DetailLine label="Centre" value={data.center} /> : null}
          </div>
          <div className="source-subjects">
            <span className="field-label">{subjectLabel}</span>
            {data.subjects.length === 0 ? (
              <p className="muted">No subjects were returned.</p>
            ) : (
              <ul>
                {data.subjects.map((s, i) => (
                  <li key={`${s.subject}-${i}`}>
                    <span>{s.subject}</span>
                    <b>{s.grade || "—"}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="source-empty">
          <Icon d={icons.alert} size={16} />
          <p className="muted">{unavailableMessage}</p>
        </div>
      )}
    </div>
  );
}

export default function ComparisonResults({ result, busy, onSave }) {
  const { official, extracted, comparison, summary, status } = result;
  const v = VERDICTS[comparison.verdict] || VERDICTS.incomplete;
  const hasRows = comparison.identity.length > 0 || comparison.subjects.length > 0;

  return (
    <div className="panel results-panel">
      <div className="panel-head">
        <div>
          <h2>Verification comparison</h2>
          <p className="muted">Official record checked against the uploaded photo.</p>
        </div>
        <span className={`badge ${v.badge}`}>{v.label}</span>
      </div>

      <div className={`verdict-banner ${v.banner}`}>
        <Icon d={v.icon} size={18} />
        <p>
          <strong>{v.label}.</strong> {v.note}
        </p>
        <span className="verdict-summary">{summary}</span>
      </div>

      <div className="compare-grid">
        <SourceCard
          icon={icons.shield}
          title="Official record"
          chip={official.sourceLabel || "Official source"}
          chipTone={official.demo ? "chip-demo" : "chip-live"}
          data={official.ok ? official : null}
          unavailableMessage={official.message || "The official record is unavailable."}
          subjectLabel="OFFICIAL SUBJECTS"
        />
        <SourceCard
          icon={icons.sparkles}
          title="Extracted from photo"
          chip={extracted.sourceLabel || "Vision extraction"}
          chipTone="chip-vision"
          data={extracted.ok ? extracted : null}
          unavailableMessage={extracted.message || "The photo could not be read."}
          subjectLabel="SUBJECTS READ FROM PHOTO"
        />
      </div>

      {hasRows && (
        <>
          <div className="field-label group-label">FIELD-BY-FIELD COMPARISON</div>
          <div className="table-wrap">
            <table className="records-table compare-table">
              <thead>
                <tr>
                  <th>FIELD</th>
                  <th>OFFICIAL RECORD</th>
                  <th>UPLOADED PHOTO</th>
                  <th>RESULT</th>
                </tr>
              </thead>
              <tbody>
                {comparison.identity.length > 0 && (
                  <tr className="group-row">
                    <th colSpan={4}>CANDIDATE DETAILS</th>
                  </tr>
                )}
                {comparison.identity.map((row) => (
                  <tr key={`id-${row.field}`}>
                    <td>
                      <strong>{row.field}</strong>
                    </td>
                    <td>{row.official || "—"}</td>
                    <td>{row.photo || "—"}</td>
                    <td>
                      <span className={`cmp-pill st-${row.status}`}>{IDENTITY_STATUS[row.status] || row.status}</span>
                    </td>
                  </tr>
                ))}
                {comparison.subjects.length > 0 && (
                  <tr className="group-row">
                    <th colSpan={4}>SUBJECTS</th>
                  </tr>
                )}
                {comparison.subjects.map((row, i) => (
                  <tr key={`sub-${row.subject}-${i}`}>
                    <td>
                      <strong>{row.subject}</strong>
                    </td>
                    <td>{row.officialGrade || "—"}</td>
                    <td>{row.photoGrade || "—"}</td>
                    <td>
                      <span className={`cmp-pill st-${row.status}`}>{SUBJECT_STATUS[row.status] || row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="modal-section compare-findings">
        <span className="field-label">CHECK FINDINGS</span>
        <FindingsList findings={comparison.findings} />
      </div>

      <div className="results-foot">
        <p className="muted">
          {status === "Escalated"
            ? "Saving will file this record as Escalated for further attention."
            : "Confirm the remaining details against the original document before approval."}
        </p>
        <button className="btn primary" onClick={onSave} disabled={busy}>
          <Icon d={icons.check} size={16} /> {busy ? "Saving..." : "Save record for human review"}
        </button>
      </div>
    </div>
  );
}
