import { Icon, icons } from "../Icon.jsx";
import { WarnBox } from "../Notice.jsx";

const CHECKS = [
  "Exam number and name discrepancies",
  "Grade differences between sources",
  "Subjects the photo could not show",
  "Unreadable or incomplete result slips",
];

const WORKFLOW = [
  { n: 1, title: "Capture", sub: "Exam number + result photo" },
  { n: 2, title: "Compare", sub: "Official record vs photo" },
  { n: 3, title: "Human review", sub: "Officer resolves differences" },
  { n: 4, title: "Record outcome", sub: "Save decision and audit note" },
];

export default function GuidanceCards({ analysisDone }) {
  return (
    <div className="two-col">
      <div className="panel">
        <h2 className="with-icon">
          <Icon d={icons.sparkles} size={18} className="green" /> What the platform checks
        </h2>
        <p className="muted">Every verification looks for:</p>
        <ul className="check-list">
          {CHECKS.map((c) => (
            <li key={c}>
              <Icon d={icons.check} size={16} className="green" />
              {c}
            </li>
          ))}
        </ul>
        <WarnBox>AI output may be inaccurate. Always verify against the original source.</WarnBox>
      </div>

      <div className="panel">
        <h2>Verification workflow</h2>
        <ol className="workflow">
          {WORKFLOW.map((s) => (
            <li key={s.n}>
              <span className={`wf-num ${analysisDone && s.n === 2 ? "on" : ""}`}>{s.n}</span>
              <div>
                <strong>{s.title}</strong>
                <span>{s.sub}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
