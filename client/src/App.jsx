import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import Toast from "./components/Toast.jsx";
import RecordModal from "./components/RecordModal.jsx";
import { useToast } from "./hooks/useToast.js";
import { useRecords } from "./hooks/useRecords.js";
import { api, getSession, setSession, setUnauthorizedHandler } from "./api.js";
import { labelForPath } from "./lib/routes.js";
import { readTheme, applyTheme } from "./lib/theme.js";
import BottomNav from "./components/BottomNav.jsx";

// Pages load on demand so the initial bundle stays small.
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const NewVerification = lazy(() => import("./pages/NewVerification.jsx"));
const Archive = lazy(() => import("./pages/Archive.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
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

  // Light/dark palette, persisted and mirrored onto <html data-theme>.
  // index.html applies the saved value before first paint.
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const handleAuth = useCallback((session) => {
    setUser(session.user);
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

  return (
    <BrowserRouter>
      <Suspense fallback={<AuthFallback />}>
        <Routes>
          {/* Signed-in visitors are bounced off the auth screens. */}
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onAuth={handleAuth} />} />
          <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup onAuth={handleAuth} />} />

          {/* Everything else needs a session. */}
          <Route element={user ? <Workspace user={user} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} /> : <Navigate to="/login" replace />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewVerification />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
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
      <BottomNav />
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

      {selected && <RecordModal record={selected} onClose={() => setSelected(null)} onDecide={decide} busy={busy} />}

      <Toast message={toast} />
    </div>
  );
}
