import { Icon, icons } from "./Icon.jsx";

export default function FindingsList({ findings }) {
  if (!findings || findings.length === 0) {
    return <p className="muted">No automated flags recorded.</p>;
  }
  return (
    <ul className="findings">
      {findings.map((f, i) => (
        <li key={i} className={`finding sev-${f.severity}`}>
          <Icon d={f.severity === "info" ? icons.check : icons.alert} size={15} />
          <span>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}
