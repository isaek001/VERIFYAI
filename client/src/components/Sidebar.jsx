import { NavLink } from "react-router-dom";
import { Icon, icons } from "./Icon.jsx";
import { ROUTES } from "../lib/routes.js";
import { initials } from "../lib/format.js";

export default function Sidebar({ open, onClose, user, onLogout }) {
  return (
    <>
      {/* Click-away backdrop, mobile only */}
      <div className={`nav-backdrop ${open ? "on" : ""}`} onClick={onClose} aria-hidden="true" />

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Icon d={icons.shield} size={22} strokeWidth={2} />
          </div>
          <div className="brand-text">
            <div className="brand-name">
              VERIFY<span>AI</span>
            </div>
            <div className="brand-sub">RESULTS VERIFICATION</div>
          </div>
          <button className="icon-btn ghost drawer-close" onClick={onClose} aria-label="Close navigation menu">
            <Icon d={icons.close} size={20} />
          </button>
        </div>

        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav">
          {ROUTES.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon d={item.icon} size={18} />
              <span>{item.label}</span>
              {item.trailing && <Icon d={icons.plus} size={16} className="nav-plus" />}
            </NavLink>
          ))}
        </nav>

        <div className="side-spacer" />

        <div className="access-box">
          <Icon d={icons.lock} size={17} />
          <div>
            <strong>Controlled access</strong>
            <span>For authorised personnel</span>
          </div>
        </div>

        <div className="side-user">
          <NavLink to="/profile" className="side-user-link" onClick={onClose}>
            <div className="avatar">{initials(user?.name)}</div>
            <div className="side-user-meta">
              <strong>{user?.name || "Verification Officer"}</strong>
              <span>NVRI · Vom</span>
            </div>
          </NavLink>
          <button className="icon-btn ghost" onClick={onLogout} aria-label="Sign out">
            <Icon d={icons.logout} size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}
