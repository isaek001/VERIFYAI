import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Icon, icons } from "../components/Icon.jsx";
import RecordsTable from "../components/RecordsTable.jsx";
import { WarnBox } from "../components/Notice.jsx";
import { canAccess, routeFor } from "../lib/routes.js";

const TABS = ["All records", "Pending review", "Verified", "Escalated"];

function toCsv(rows) {
  const header = ["Record ID", "Candidate ID", "Candidate Name", "Examination", "Result", "Status", "Created", "Reviewer"];
  const body = rows.map((r) => [r.id, r.candidateId, r.candidateName, r.exam, r.result, r.status, r.createdAt, r.reviewedBy || ""]);
  return [header, ...body]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function Archive() {
  const { records, loading, onOpen, onNavigate, onToast, serviceOk, user } = useOutletContext();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All records");

  // Only roles allowed to run a new verification get the shortcut button.
  const canNew = canAccess(user, routeFor("/new"));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      const matchesQuery = [r.candidateId, r.candidateName, r.exam, r.status].join(" ").toLowerCase().includes(q);
      const matchesFilter = filter === "All records" || r.status === filter;
      return matchesQuery && matchesFilter;
    });
  }, [records, query, filter]);

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "verify-ai-records.csv";
    a.click();
    URL.revokeObjectURL(url);
    onToast("Records exported as CSV.");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">RECORD MANAGEMENT</div>
          <h1>Records archive</h1>
          <p className="lede">Search and retrieve verification cases, subject to authorised access.</p>
        </div>
        <div className="head-actions">
          {canNew && (
            <button className="btn primary" onClick={() => onNavigate("/new")}>
              <Icon d={icons.plus} size={16} /> New verification
            </button>
          )}
        </div>
      </div>

      {!serviceOk && (
        <WarnBox wide>Records could not be loaded. Check your connection and refresh to try again.</WarnBox>
      )}

      <div className="archive-toolbar">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={filter === t}
              className={`tab ${filter === t ? "on" : ""}`}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <div className="search">
            <Icon d={icons.search} size={16} />
            <input
              placeholder="Search records"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search records"
            />
          </div>
          <button className="btn ghost" onClick={exportCsv}>
            <Icon d={icons.download} size={15} /> Export CSV
          </button>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            <div className="empty-icon spin" />
            <strong>Loading records...</strong>
          </div>
        ) : (
          <RecordsTable records={filtered} onOpen={onOpen} />
        )}
        <div className="table-foot">
          Showing {filtered.length} of {records.length} records. Search and filters apply to the current loaded record
          set.
        </div>
      </div>
    </>
  );
}
