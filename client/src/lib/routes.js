// Single source of truth for app routes: path ↔ label ↔ nav icon.
// Sidebar nav, the topbar breadcrumb and the document title all read
// from here, so adding a page only means adding one row.
import { icons } from "../components/Icon.jsx";

export const ROUTES = [
  { path: "/", label: "Dashboard", icon: icons.dashboard, end: true, short: "Dashboard" },
  { path: "/new", label: "New verification", icon: icons.file, trailing: true, short: "New" },
  { path: "/archive", label: "Records archive", icon: icons.archive, short: "Archive" },
  { path: "/reports", label: "Reports", icon: icons.reports, short: "Reports" },
  { path: "/profile", label: "Profile", icon: icons.user, short: "Profile" },
  { path: "/settings", label: "Settings", icon: icons.settings, short: "Settings" },
];

// Label for the breadcrumb/title. Unknown paths fall back to Dashboard.
export function labelForPath(pathname) {
  const match = ROUTES.find((r) => r.path === pathname);
  return match ? match.label : "Dashboard";
}
