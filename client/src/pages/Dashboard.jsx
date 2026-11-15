import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Icon, icons } from "../components/Icon.jsx";
import StatCard from "../components/StatCard.jsx";
import RecordsTable from "../components/RecordsTable.jsx";
import { Notice, WarnBox } from "../components/Notice.jsx";

// Counts derived from the loaded records.
export function useRecordStats(records) {
  return useMemo(
    () => ({
      total: records.length,
      pending: records.filter((r) => r.status === "Pending review").length,
      verified: records.filter((r) => r.status === "Verified").length,
      flagged: records.filter(
        (r) => r.status === "Escalated" || (r.findings || []).some((f) => f.severity !== "info")
      ).length,
    }),
    [records]
  );
}

export default function Dashboard() {
  const { records, loading, serviceOk, onNavigate, onOpen, onRefresh, busy } = useOutletContext();
  const stats = useRecordStats(records);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">OVERVIEW</div>
          <h1>Verification dashboard</h1>
          <p className="lede">Monitor requests, review flagged records and track verification activity.</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={onRefresh} disabled={busy}>
            <Icon d={icons.refresh} size={15} /> Refresh records
          </button>
          <button className="btn primary" onClick={() => onNavigate("/new")}>
            <Icon d={icons.plus} size={16} /> New verification
          </button>
          <button className="btn ghost" onClick={() => onNavigate("/archive")}>
            View archive
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon={icons.clipboard} tone="blue" label="Total records" value={stats.total} note="In the archive" />
        <StatCard icon={icons.clock} tone="amber" label="Pending review" value={stats.pending} note="Awaiting officer review" />
        <StatCard icon={icons.check} tone="green" label="Verified" value={stats.verified} note="Human-approved records" />
        <StatCard icon={icons.alert} tone="red" label="Flagged / escalated" value={stats.flagged} note="Require attention" />
      </div>

      {!serviceOk && (
        <WarnBox>Records could not be loaded. Check your connection and refresh to try again.</WarnBox>
      )}

      <div className="section-head">
        <div>
          <h2>Recent verification activity</h2>
          <p className="muted">Latest records submitted to the station</p>
        </div>
        <button className="link-btn" onClick={() => onNavigate("/archive")}>
          View archive <Icon d={icons.download} size={15} />
        </button>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty-state" role="status">
            <div className="empty-icon spin" />
            <strong>Loading records...</strong>
          </div>
        ) : (
          <RecordsTable records={records.slice(0, 5)} onOpen={onOpen} />
        )}
      </div>

      <Notice title="Human approval remains essential">
        AI checks highlight possible issues. An authorised officer must compare the information with the source
        document and make the final verification decision.
      </Notice>
    </>
  );
}
