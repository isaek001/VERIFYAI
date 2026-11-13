import FindingsList from "../FindingsList.jsx";

function ResultField({ label, value }) {
  return (
    <div className="result-field">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

export default function AnalysisResults({ analysis, busy, onSubmit }) {
  return (
    <div className="panel results-panel">
      <div className="panel-head">
        <div>
          <h2>AI check results</h2>
          <p className="muted">Review extracted fields and flags before submitting.</p>
        </div>
        <span className="assistive-badge">ASSISTIVE OUTPUT · NOT AN APPROVAL</span>
      </div>

      <div className="result-grid">
        <ResultField label="Candidate ID" value={analysis.extracted.candidateId} />
        <ResultField label="Candidate name" value={analysis.extracted.candidateName} />
        <ResultField label="Examination" value={analysis.extracted.exam} />
        <ResultField label="Result" value={analysis.extracted.result} />
      </div>

      <FindingsList findings={analysis.findings} />

      <div className="results-foot">
        <p className="muted">Confirm all details against the original document.</p>
        <button className="btn primary" onClick={onSubmit} disabled={busy}>
          Submit for human review
        </button>
      </div>
    </div>
  );
}
