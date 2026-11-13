import { useOutletContext } from "react-router-dom";
import { Icon, icons } from "../components/Icon.jsx";
import StatCard from "../components/StatCard.jsx";
import { Notice } from "../components/Notice.jsx";
import { initials, formatDate } from "../lib/format.js";

function DetailRow({ icon, label, value, badge }) {
  return (
    <div className="detail-row">
      <div className="detail-icon">
        <Icon d={icon} size={17} />
      </div>
      <div className="detail-meta">
        <span className="detail-label">{label}</span>
        <strong className="detail-value">{value}</strong>
      </div>
      {badge && <span className="badge badge-verified">{badge}</span>}
    </div>
  );
}

export default function Profile() {
  const { user, records, onLogout, onNavigate } = useOutletContext();

  // Review activity attributed to this officer in the loaded record set.
  const mine = records.filter((r) => r.reviewedBy && user?.name && r.reviewedBy === user.name);
  const stats = {
    total: mine.length,
    verified: mine.filter((r) => r.status === "Verified").length,
    escalated: mine.filter((r) => r.status === "Escalated").length,
    pending: mine.filter((r) => r.status === "Pending review").length,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">ACCOUNT</div>
          <h1>Your profile</h1>
          <p className="lede">Identity and review activity for this Verify AI account.</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => onNavigate("/settings")}>
            <Icon d={icons.settings} size={15} /> Workspace settings
          </button>
          <button className="btn danger" onClick={onLogout}>
            <Icon d={icons.logout} size={15} /> Sign out
          </button>
        </div>
      </div>

      <div className="profile-grid">
        <div className="panel profile-card">
          <div className="profile-avatar">{initials(user?.name)}</div>
          <div className="profile-id">
            <h2>{user?.name}</h2>
            <p className="muted">{user?.email}</p>
            <div className="profile-tags">
              <span className="badge badge-verified">Verification officer</span>
              <span className="badge badge-blue">NVRI · Vom</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Account details</h2>
              <p className="muted">Read-only. Contact an administrator to make changes.</p>
            </div>
            <Icon d={icons.lock} size={22} className="panel-head-icon" />
          </div>

          <div className="detail-list">
            <DetailRow icon={icons.user} label="Full name" value={user?.name || "—"} />
            <DetailRow icon={icons.mail} label="Email address" value={user?.email || "—"} />
            <DetailRow
              icon={icons.clock}
              label="Member since"
              value={formatDate(user?.createdAt)}
              badge={user?.createdAt ? "Active" : null}
            />
            <DetailRow icon={icons.shield} label="Workspace" value="National Veterinary Research Institute, Vom" />
            <DetailRow icon={icons.key} label="Account ID" value={user?.id || "—"} />
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon={icons.clipboard} tone="blue" label="Reviews recorded" value={stats.total} note="Attributed to you" />
        <StatCard icon={icons.check} tone="green" label="Verified" value={stats.verified} note="Human-approved records" />
        <StatCard icon={icons.clock} tone="amber" label="Still pending" value={stats.pending} note="Awaiting decision" />
        <StatCard icon={icons.alert} tone="red" label="Escalated" value={stats.escalated} note="Flagged for attention" />
      </div>

      <Notice title="Access is controlled">
        This account is for authorised NVRI personnel. Review decisions you record are attributed to your name and
        email. Sign out when you finish, especially on a shared workstation.
      </Notice>
    </>
  );
}
