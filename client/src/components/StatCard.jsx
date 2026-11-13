import { Icon } from "./Icon.jsx";

export default function StatCard({ icon, tone, label, value, note }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon d={icon} size={18} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
