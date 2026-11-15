// Route guards.
//
// ProtectedRoute  — every signed-in screen lives behind it. It restores the
//                   session, verifies the token against the server once per
//                   mount (a stale/expired token is caught here instead of
//                   on the first data call), and bounces guests to the
//                   sign-in page — remembering where they were headed so
//                   Login can send them back after signing in.
//
// GuestOnlyRoute  — the sign-in / create-account pages. Signed-in users
//                   never see them again: they are forwarded to the page
//                   they originally asked for (or the dashboard).
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, setSession } from "../../api.js";

const Spinner = () => (
  <div className="auth-loading" role="status" aria-label="Checking your session">
    <div className="empty-icon spin" />
  </div>
);

export function ProtectedRoute({ user, onAuth, onExpired, children }) {
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
    return <Navigate to="/" replace state={{ from }} />;
  }
  if (checking) return <Spinner />;
  return children;
}

export function GuestOnlyRoute({ user, children }) {
  const location = useLocation();
  if (user) {
    const from = location.state?.from;
    return <Navigate to={from || "/dashboard"} replace />;
  }
  return children;
}

export default ProtectedRoute;
