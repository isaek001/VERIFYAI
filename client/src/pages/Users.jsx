import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api.js";
import { Icon, icons } from "../components/Icon.jsx";
import { Notice } from "../components/Notice.jsx";
import { initials, formatDate } from "../lib/format.js";

// Admin: the approval queue for new sign-ups plus every account on the
// system. Officers never reach this page (see lib/routes.js roles).
const ROLE_LABELS = {
  admin: "Administrator",
  verifying: "Verifying officer",
  records: "Records officer",
};

const STATUS_BADGES = {
  pending: { cls: "badge badge-amber", label: "Pending approval" },
  active: { cls: "badge badge-verified", label: "Active" },
  suspended: { cls: "badge badge-escalated", label: "Suspended" },
};

function UserRow({ account, meId, busy, onAction }) {
  const isSelf = account.id === meId;
  const badge = STATUS_BADGES[account.status] || STATUS_BADGES.active;

  return (
    <div className="user-row">
      <div className="avatar">{initials(account.name)}</div>
      <div className="user-meta">
        <strong>
          {account.name}
          {isSelf && <span className="user-you">You</span>}
        </strong>
        <span>{account.email}</span>
      </div>
      <span className="user-role">{ROLE_LABELS[account.role] || account.role}</span>
      <span className={badge.cls}>{badge.label}</span>
      <span className="user-joined">{formatDate(account.createdAt)}</span>
      {!isSelf && (
        <div className="user-actions">
          {account.status === "pending" && (
            <>
              <button
                className="btn primary small"
                disabled={busy}
                onClick={() => onAction(account, { status: "active" }, "Account approved.")}
              >
                Approve
              </button>
              <button
                className="btn ghost small"
                disabled={busy}
                onClick={() => onAction(account, { status: "suspended" }, "Sign-up declined.")}
              >
                Decline
              </button>
            </>
          )}
          {account.status === "active" && (
            <button
              className="btn ghost small"
              disabled={busy}
              onClick={() => onAction(account, { status: "suspended" }, "Account suspended.")}
            >
              Suspend
            </button>
          )}
          {account.status === "suspended" && (
            <button
              className="btn primary small"
              disabled={busy}
              onClick={() => onAction(account, { status: "active" }, "Account reactivated.")}
            >
              Reactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Users() {
  const { user: me, onToast } = useOutletContext();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.listUsers();
      setUsers(Array.isArray(data.users) ? data.users : []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the account list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "User accounts · Verify AI";
    load();
  }, [load]);

  const act = async (account, patch, message) => {
    setBusyId(account.id);
    try {
      await api.updateUser(account.id, patch);
      await load();
      onToast?.(message);
    } catch (err) {
      onToast?.(err.message || "Could not update the account.");
    } finally {
      setBusyId(null);
    }
  };

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">ADMIN</div>
          <h1>User accounts</h1>
          <p className="lede">Approve new sign-ups and manage who can access Verify AI.</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={load} disabled={loading}>
            <Icon d={icons.refresh} size={15} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <Notice title="Could not load accounts">
          {error} Check your connection and try again.
        </Notice>
      )}

      <div className="panel users-panel">
        <div className="panel-head">
          <div>
            <h2>
              Pending approvals{" "}
              {pending.length > 0 && <span className="badge badge-amber">{pending.length}</span>}
            </h2>
            <p className="muted">Sign-ups waiting for a decision. Approved accounts can sign in immediately.</p>
          </div>
          <Icon d={icons.clock} size={22} className="panel-head-icon" />
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-icon spin" />
          </div>
        ) : pending.length === 0 ? (
          <p className="muted users-empty">No accounts are waiting for approval.</p>
        ) : (
          <div className="user-list">
            {pending.map((account) => (
              <UserRow
                key={account.id}
                account={account}
                meId={me?.id}
                busy={busyId === account.id}
                onAction={act}
              />
            ))}
          </div>
        )}
      </div>

      <div className="panel users-panel">
        <div className="panel-head">
          <div>
            <h2>All accounts</h2>
            <p className="muted">Everyone with access, newest first.</p>
          </div>
          <Icon d={icons.users} size={22} className="panel-head-icon" />
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-icon spin" />
          </div>
        ) : (
          <div className="user-list">
            {others.map((account) => (
              <UserRow
                key={account.id}
                account={account}
                meId={me?.id}
                busy={busyId === account.id}
                onAction={act}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
