import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import Toast from "./components/Toast.jsx";
import RecordModal from "./components/RecordModal.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { useToast } from "./hooks/useToast.js";
import { useRecords } from "./hooks/useRecords.js";
import { api, getSession, setSession, setUnauthorizedHandler } from "./api.js";
import { ProtectedRoute, GuestOnlyRoute, RoleRoute } from "./components/routes/ProtectedRoute.jsx";
import { homeFor, labelForPath, roleOf } from "./lib/routes.js";
import { readTheme, applyTheme } from "./lib/theme.js";
import BottomNav from "./components/BottomNav.jsx";

// Pages load on demand so the initial bundle stays small.
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const NewVerification = lazy(() => import("./pages/NewVerification.jsx"));
const Archive = lazy(() => import("./pages/Archive.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Users = lazy(() => import("./pages/Users.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Signup = lazy(() => import("./pages/Signup.jsx"));

const PageFallback = () => (
  <div className="empty-state">
    <div className="empty-icon spin" />
    <strong>Loading...</strong>
  </div>
);

const AuthFallback = () => (
  <div className="auth-loading" role="status">
    <div className="empty-icon spin" />
  </div>
);

export default function App() {
  // Restored from localStorage; a stale token is caught by the first
  // API call, which drops us back to the sign-in screen.
  const [user, setUser] = useState(() => getSession()?.user || null);

  // Set when the server rejects a previously valid session, so the
  // sign-in page can explain the redirect instead of dropping the user
  // silently mid-action.
  const [sessionExpired, setSessionExpired] = useState(false);

  // Light/dark palette, persisted and mirrored onto <html data-theme>.
  // index.html applies the saved value before first paint.
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionExpired(true);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const handleAuth = useCallback((session) => {
    setSessionExpired(false);
    setUser(session.user);
  }, []);

  // The token was rejected server-side (expired / revoked): clear the local
  // session so ProtectedRoute drops us back to the sign-in page.
  const handleSessionExpired = useCallback(() => {
    setSession(null);
    setSessionExpired(true);
    setUser(null);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout(); // best effort — local session clears regardless
    } catch {
      /* already invalid */
    }
    setSession(null);
    setUser(null);
  }, []);

  // v7_* flags opt in to React Router v7 behaviour early, which clears the
  // "React Router Future Flag Warning" notices in the console.
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<AuthFallback />}>
        <ErrorBoundary>
          <Routes>
          {/* Sign-in / create-account: guests only. Anyone already signed
              in is forwarded to the page they originally asked for (or the
              dashboard) — ProtectedRoute passes that target as location state. */}
          <Route
            path="/"
            element={
              <GuestOnlyRoute user={user}>
                <Login onAuth={handleAuth} />
              </GuestOnlyRoute>
            }
          />
          {/* /login stays as an alias so old links keep working. */}
          <Route
            path="/login"
            element={
              <GuestOnlyRoute user={user}>
                <Login onAuth={handleAuth} />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <GuestOnlyRoute user={user}>
                <Signup onAuth={handleAuth} />
              </GuestOnlyRoute>
            }
          />

          {/* Everything else sits behind ProtectedRoute: it verifies the
              token against the server and redirects guests to sign-in. */}
          <Route
            element={
              <ProtectedRoute user={user} onAuth={handleAuth} onExpired={handleSessionExpired} expired={sessionExpired}>
                <Workspace user={user} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />
              </ProtectedRoute>
            }
          >
            {/* Each page names its own path: RoleRoute looks the roles up
                in lib/routes.js, so access rules are declared once. */}
            <Route path="/dashboard" element={<RoleRoute path="/dashboard"><Dashboard /></RoleRoute>} />
            <Route path="/new" element={<RoleRoute path="/new"><NewVerification /></RoleRoute>} />
            <Route path="/archive" element={<RoleRoute path="/archive"><Archive /></RoleRoute>} />
            <Route path="/reports" element={<RoleRoute path="/reports"><Reports /></RoleRoute>} />
            <Route path="/users" element={<RoleRoute path="/users"><Users /></RoleRoute>} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<RoleRoute path="/settings"><Settings /></RoleRoute>} />
            <Route path="*" element={<HomeRedirect />} />
          </Route>
          </Routes>
        </ErrorBoundary>
      </Suspense>
    </BrowserRouter>
  );
}

// Unknown path inside the shell: send the visitor to their own home page
// (dashboard / new verification / reports depending on role).
function HomeRedirect() {
  const { user } = useOutletContext();
  return <Navigate to={homeFor(user)} replace />;
}

// The signed-in shell: sidebar, topbar, page outlet and shared state.
// Pages read their props from the outlet context (see useOutletContext).
function Workspace({ user, onLogout, theme, onToggleTheme }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast, showToast } = useToast();
  const { records, loading, serviceOk, load, updateRecord } = useRecords();
  const location = useLocation();
  const navigate = useNavigate();

  const page = labelForPath(location.pathname);

  const decide = async (status, reviewedBy, reviewNote) => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateRecord(selected.id, { status, reviewedBy, reviewNote });
      setSelected(null);
      showToast(status === "Verified" ? "Human review decision recorded." : "Record escalated for further attention.");
    } catch {
      showToast("Could not save the review decision.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.title = `Verify AI · ${page}`;
  }, [page]);

  // Props every page can pull from the outlet context.
  const context = {
    records,
    loading,
    serviceOk,
    load,
    busy: loading,
    onNavigate: navigate,
    onOpen: setSelected,
    onToast: showToast,
    onRefresh: load,
    onRecordCreated: load,
    user,
    onLogout,
  };

  return (
    <div className="app">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} user={user} onLogout={onLogout} />
      <BottomNav user={user} />
      <div className="main">
        <Topbar
          page={page}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onOpenMenu={() => setMenuOpen(true)}
          user={user}
        />
        <main className="content">
          <Suspense fallback={<PageFallback />}>
            <Outlet context={context} />
          </Suspense>
        </main>
      </div>

      {selected && (
        <RecordModal
          record={selected}
          onClose={() => setSelected(null)}
          onDecide={decide}
          busy={busy}
          readOnly={roleOf(user) !== "admin"}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
