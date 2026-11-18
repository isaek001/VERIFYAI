// Single source of truth for app routes: path ↔ label ↔ nav icon ↔ roles.
// Sidebar nav, the bottom nav, the topbar breadcrumb, the document title
// and the role guards all read from here, so adding a page only means
// adding one row.
import { icons } from "../components/Icon.jsx";

// Roles: admin (everything), verifying (New verification + Profile),
// records (Reports + Profile). A route without `roles` is for everyone.
export const ROUTES = [
  { path: "/dashboard", label: "Dashboard", icon: icons.dashboard, end: true, short: "Dashboard", roles: ["admin"] },
  { path: "/new", label: "New verification", icon: icons.file, trailing: true, short: "New", roles: ["admin", "verifying"] },
  { path: "/archive", label: "Records archive", icon: icons.archive, short: "Archive", roles: ["admin", "records"] },
  { path: "/reports", label: "Reports", icon: icons.reports, short: "Reports", roles: ["admin", "records"] },
  { path: "/users", label: "User accounts", icon: icons.users, short: "Users", roles: ["admin"] },
  { path: "/profile", label: "Profile", icon: icons.user, short: "Profile" },
];

// Sessions created before the role column existed carry no role; treat
// them as admins (the server backfills existing accounts that way too).
// Every request is still enforced server-side with the real value.
export function roleOf(user) {
  return user?.role || "admin";
}

export function routeFor(pathname) {
  return ROUTES.find((r) => r.path === pathname) || null;
}

export function canAccess(user, route) {
  return !route?.roles || route.roles.includes(roleOf(user));
}

// The navigation this role actually sees.
export function routesFor(user) {
  return ROUTES.filter((route) => canAccess(user, route));
}

// Where each role lands after signing in — and where it is sent when it
// opens a page outside its role, so nobody hits a dead end.
export function homeFor(user) {
  const role = roleOf(user);
  if (role === "verifying") return "/new";
  if (role === "records") return "/reports";
  return "/dashboard";
}

// Label for the breadcrumb/title. Unknown paths fall back to Dashboard.
export function labelForPath(pathname) {
  const match = routeFor(pathname);
  return match ? match.label : "Dashboard";
}
