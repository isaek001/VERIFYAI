import { Icon, icons } from "../components/Icon.jsx";
import StatCard from "../components/StatCard.jsx";
import { useOutletContext } from "react-router-dom";
import { useRecordStats } from "./Dashboard.jsx";

function DistributionBar({ label, value, max, tone }) {
  return (
    <div className="dist-row">
      <span className="dist-label">{label}</span>
      <div className="dist-track">
        <div className={`dist-fill ${tone}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="dist-value">{value}</span>
    </div>
  );
}

export default function Reports() {
  const { records, onToast } = useOutletContext();
  const stats = useRecordStats(records);
  const escalated = records.filter((r) => r.status === "Escalated").length;

  const dist = [
    { label: "Verified", value: stats.verified, tone: "green" },
    { label: "Pending review", value: stats.pending, tone: "amber" },
    { label: "Escalated", value: escalated, tone: "red" },
  ];
  const max = Math.max(1, ...dist.map((d) => d.value));

  const exportData = () => {
    const payload = JSON.stringify({ generatedAt: new Date().toISOString(), stats, records }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "verify-ai-report.json";
    a.click();
    URL.revokeObjectURL(url);
    onToast("Report exported.");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">INSIGHTS</div>
          <h1>Verification reports</h1>
          <p className="lede">Operational summaries from the records currently in the archive.</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={exportData}>
            <Icon d={icons.download} size={15} /> Export data
          </button>
        </div>
      </div>

      <div className="stat-grid five">
        <StatCard icon={icons.clipboard} tone="blue" label="Total requests" value={stats.total} note="All submissions" />
        <StatCard icon={icons.archive} tone="blue" label="Records in archive" value={stats.total} note="Stored cases" />
        <StatCard icon={icons.clock} tone="amber" label="Pending" value={stats.pending} note="Awaiting review" />
        <StatCard icon={icons.check} tone="green" label="Completed" value={stats.verified} note="Marked verified" />
        <StatCard icon={icons.alert} tone="red" label="Flagged" value={stats.flagged} note="Escalated or with flags" />
      </div>

      <div className="panel">
        <h2>Outcome distribution</h2>
        <div className="dist">
          {dist.map((d) => (
            <DistributionBar key={d.label} label={d.label} value={d.value} max={max} tone={d.tone} />
          ))}
        </div>
      </div>

      <p className="muted footnote">
        These are operational counts, not an independent audit or accuracy assessment.
      </p>
    </>
  );
}
