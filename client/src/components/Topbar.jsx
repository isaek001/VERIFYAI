import { NavLink } from "react-router-dom";
import { Icon, icons } from "./Icon.jsx";
import { initials } from "../lib/format.js";
import { homeFor } from "../lib/routes.js";

export default function Topbar({ page, theme, onToggleTheme, onOpenMenu, user }) {
  return (
    <header className="topbar">
      <button className="icon-btn bordered menu-btn" onClick={onOpenMenu} aria-label="Open navigation menu">
        <Icon d={icons.menu} size={18} />
      </button>
      {/* Compact brand mark — only visible on phones, where the
          sidebar (and its brand block) is replaced by the bottom nav.
          Lands on the role's home page, not always the dashboard. */}
      <NavLink to={homeFor(user)} className="mobile-brand" aria-label="Verify AI home">
        <span className="brand-mark mini">
          <img src="/logo/verifyai-icon.png" alt="" width="34" height="34" />
        </span>
      </NavLink>
      <nav className="crumbs" aria-label="Breadcrumb">
        Workspace <span>/</span> <strong>{page}</strong>
      </nav>
      <div className="topbar-right">
        <span className="service-pill">
          <i className="dot" /> Service connected
        </span>
        <button
          className="icon-btn bordered"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <Icon d={theme === "dark" ? icons.sun : icons.moon} size={16} />
        </button>
        <div className="avatar small">{initials(user?.name)}</div>
      </div>
    </header>
  );
}
