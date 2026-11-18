import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Icon, icons } from "../components/Icon.jsx";
import StatCard from "../components/StatCard.jsx";
import { Notice } from "../components/Notice.jsx";
import PasswordField from "../components/auth/PasswordField.jsx";
import { api } from "../api.js";
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

const ROLE_LABELS = {
  admin: "Administrator",
  verifying: "Verifying officer",
  records: "Records officer",
};

// Reusable change-password form: any signed-in account may rotate its own
// password. Officers see only this; admins get it alongside their profile.
function PasswordChangeForm({ user, onToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const pwdOk = next.length >= 8;

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    const errs = {};
    if (!current) errs.current = "Enter your current password.";
    if (!next) errs.next = "Choose a new password.";
    else if (next.length < 8) errs.next = "Password must be at least 8 characters.";
    else if (next === current) errs.next = "Choose a password different from your current one.";
    if (!confirm) errs.confirm = "Confirm your new password.";
    else if (next && confirm !== next) errs.confirm = "Passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      onToast?.("Password updated.");
    } catch (err) {
      setFormError(err.message || "Could not update the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="pwd-form" onSubmit={submit} noValidate>
      {formError && (
        <div className="auth-err" role="alert">
          <Icon d={icons.alert} size={16} />
          {formError}
        </div>
      )}

      <PasswordField
        id="profile-current"
        label="Current password"
        autoComplete="current-password"
        placeholder="Enter your current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={errors.current}
      />

      <PasswordField
        id="profile-new"
        label="New password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={errors.next}
        hint={pwdOk ? "Good — your password meets the minimum length." : "Use at least 8 characters."}
        hintOk={pwdOk}
      />

      <PasswordField
        id="profile-confirm"
        label="Confirm new password"
        autoComplete="new-password"
        placeholder="Re-enter the new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />

      <button className="btn primary pwd-submit" type="submit" disabled={busy}>
        {busy ? "Saving..." : "Update password"}
      </button>
    </form>
  );
}

// Officer profile: identity plus the one thing this role may edit —
// the password. No stats, no settings (those belong to the admin).
function OfficerProfile({ user, onLogout, onToast }) {
  const roleLabel = ROLE_LABELS[user?.role] || "Officer";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">ACCOUNT</div>
          <h1>Your profile</h1>
          <p className="lede">Your account details and password.</p>
        </div>
        <div className="head-actions">
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
              <span className="badge badge-verified">{roleLabel}</span>
              <span className="badge badge-blue wrap">Federal College of Animal Health and Production Technology</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Change password</h2>
              <p className="muted">Update the password for this account.</p>
            </div>
            <Icon d={icons.lock} size={22} className="panel-head-icon" />
          </div>
          <PasswordChangeForm user={user} onToast={onToast} />
        </div>
      </div>

      <Notice title="Access is controlled">
        This account is for authorised personnel of the Federal College of Animal Health and Production Technology.
        Sign out when you finish, especially on a shared workstation.
      </Notice>
    </>
  );
}

export default function Profile() {
  const { user, records, onLogout, onToast } = useOutletContext();

  // Officers (verifying / records) see identity + password only.
  if (user?.role && user.role !== "admin") {
    return <OfficerProfile user={user} onLogout={onLogout} onToast={onToast} />;
  }

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
              <span className="badge badge-blue wrap">Federal College of Animal Health and Production Technology</span>
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
            <DetailRow
              icon={icons.shield}
              label="Workspace"
              value="Federal College of Animal Health and Production Technology, Vom"
            />
            <DetailRow icon={icons.key} label="Account ID" value={user?.id || "—"} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Change password</h2>
              <p className="muted">Update the password for this account.</p>
            </div>
            <Icon d={icons.lock} size={22} className="panel-head-icon" />
          </div>
          <PasswordChangeForm user={user} onToast={onToast} />
        </div>
      </div>

      <div className="stat-grid">
        <StatCard icon={icons.clipboard} tone="blue" label="Reviews recorded" value={stats.total} note="Attributed to you" />
        <StatCard icon={icons.check} tone="green" label="Verified" value={stats.verified} note="Human-approved records" />
        <StatCard icon={icons.clock} tone="amber" label="Still pending" value={stats.pending} note="Awaiting decision" />
        <StatCard icon={icons.alert} tone="red" label="Escalated" value={stats.escalated} note="Flagged for attention" />
      </div>

      <Notice title="Access is controlled">
        This account is for authorised personnel of the Federal College of Animal Health and Production Technology.
        Review decisions you record are attributed to your name and email. Sign out when you finish, especially on a
        shared workstation.
      </Notice>
    </>
  );
}
