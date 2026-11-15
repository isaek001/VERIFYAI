import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, setSession } from "../api.js";
import { Icon, icons } from "../components/Icon.jsx";
import AuthShell from "../components/auth/AuthShell.jsx";
import PasswordField from "../components/auth/PasswordField.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Demo credentials are a development convenience only: the block below is
// compiled out of production builds, and the server refuses this login in
// production unless ALLOW_DEMO_LOGIN=1 is set.
const DEMO = import.meta.env.PROD ? null : { email: "officer@fcahpt.gov.ng", password: "Passw0rd!" };

export default function Login({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  useEffect(() => {
    document.title = "Sign in · Verify AI";
  }, []);

  // ProtectedRoute bounces here with state.expired when the token died
  // mid-session — say so instead of silently dropping the user.
  useEffect(() => {
    if (location.state?.expired) setFormError("Your session expired. Sign in again to continue.");
  }, [location]);

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const data = await api.login({ email: email.trim(), password });
      setSession(data);
      onAuth(data);
    } catch (err) {
      setFormError(err.status === 429 ? err.message : "Email or password is incorrect.");
      if (err.status === 401) setErrors({ password: "Check your password and try again." });
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => {
    if (!DEMO) return;
    setEmail(DEMO.email);
    setPassword(DEMO.password);
    setErrors({});
    setFormError("");
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with your Federal College of Animal Health and Production Technology staff account to continue."
      footer={
        <>
          New to Verify AI?{" "}
          <Link className="link" to="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        {formError && (
          <div className="auth-err" role="alert">
            <Icon d={icons.alert} size={16} />
            {formError}
          </div>
        )}

        <label className="field" htmlFor="login-email">
          <span className="field-label">Email address</span>
          <span className="input-wrap">
            <Icon d={icons.mail} size={16} className="input-icon" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@fcahpt.gov.ng"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "login-email-err" : undefined}
            />
          </span>
          {errors.email && (
            <span className="field-error" id="login-email-err" role="alert">
              {errors.email}
            </span>
          )}
        </label>

        <PasswordField
          id="login-password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        <button className="btn primary full-btn" type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {DEMO && (
        <div className="auth-demo">
          <div>
            <strong>Demo account</strong>
            <span>
              {DEMO.email} · {DEMO.password}
            </span>
          </div>
          <button type="button" className="btn ghost small" onClick={useDemo}>
            Use demo login
          </button>
        </div>
      )}
    </AuthShell>
  );
}
