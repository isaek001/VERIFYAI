import { NavLink } from "react-router-dom";
import { Icon } from "./Icon.jsx";
import { ROUTES } from "../lib/routes.js";

// Phone-only bottom navigation. On <=760px the sidebar is hidden and
// this fixed icon bar takes over (see .bottom-nav in styles.css), so
// every primary page stays one tap away like a mobile app.
export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {ROUTES.map((route) => (
        <NavLink
          key={route.path}
          to={route.path}
          end={route.end}
          className={({ isActive }) => `bottom-item${isActive ? " on" : ""}`}
        >
          <span className="bottom-ico">
            <Icon d={route.icon} size={19} />
          </span>
          <span className="bottom-txt">{route.short || route.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
