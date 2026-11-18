// Route guards.
//
// ProtectedRoute  — every signed-in screen lives behind it. It restores the
//                   session, verifies the token against the server once per
//                   mount (a stale/expired token is caught here instead of
//                   on the first data call), and bounces guests to the
//                   sign-in page — remembering where they were headed so
//                   Login can send them back after signing in.
//
// RoleRoute       — per-page role gate. The shell (Workspace) is shared by
//                   every role, so each page that only some roles may open
//                   wraps itself in RoleRoute; someone outside the role is
//                   sent to their own home page instead of a dead end.
//
// GuestOnlyRoute  — the sign-in / create-account pages. Signed-in users
//                   never see them again: they are forwarded to the page
//                   they originally asked for (or their role's home).
import { useEffect, useState } from "react";
import { Navigate, useLocation, useOutletContext } from "react-router-dom";
import { api, setSession } from "../../api.js";
import { canAccess, homeFor, routeFor } from "../../lib/routes.js";

const Spinner = () => (
  <div className="auth-loading" role="status" aria-label="Checking your session">
    <div className="empty-icon spin" />
  </div>
);

export function ProtectedRoute({ user, onAuth, onExpired, expired, children }) {
  const location = useLocation();
  // Verify once per sign-in (user.id is a stable string — verifying on the
  // user object's identity would re-run after every refresh of /me).
  const [checking, setChecking] = useState(Boolean(user));

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      try {
        const data = await api.me();
        if (alive && data?.user) onAuth({ user: data.user });
      } catch (err) {
        // 401 -> token expired or revoked: drop the session so the guard
        // redirects. Other failures (server briefly down) keep the cached
        // session so the app stays usable; API calls re-check it anyway.
        if (alive && err?.status === 401) {
          setSession(null);
          onExpired?.();
        }
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/" replace state={{ from, expired: Boolean(expired) }} />;
  }
  if (checking) return <Spinner />;
  return children;
}

// Per-page role gate. Roles live in lib/routes.js next to the page's nav
// row, so a page's access rules are declared in exactly one place.
export function RoleRoute({ path, children }) {
  const { user } = useOutletContext(); // Workspace passes the session user
  const route = routeFor(path);
  if (route && !canAccess(user, route)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

export function GuestOnlyRoute({ user, children }) {
  const location = useLocation();
  if (user) {
    const from = location.state?.from;
    return <Navigate to={from || homeFor(user)} replace />;
  }
  return children;
}

export default ProtectedRoute;
