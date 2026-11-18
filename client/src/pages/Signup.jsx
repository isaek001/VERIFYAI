import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, setSession } from "../api.js";
import { Icon, icons } from "../components/Icon.jsx";
import AuthShell from "../components/auth/AuthShell.jsx";
import PasswordField from "../components/auth/PasswordField.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The two account types a visitor may register for. Admin is absent on
// purpose: administrators are seeded or promoted by an existing admin,
// and every new account starts pending until the admin approves it.
const ROLE_OPTIONS = [
  {
    value: "verifying",
    icon: icons.shield,
    label: "Verifying officer",
    hint: "Run result verifications in the New verification workspace.",
  },
  {
    value: "records",
    icon: icons.reports,
    label: "Records officer",
    hint: "Read the archive and work with Reports.",
  },
];

export default function Signup({ onAuth }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  // Set after a successful sign-up: the account exists but must be
  // approved by an administrator before it can sign in.
  const [pendingRole, setPendingRole] = useState("");

  useEffect(() => {
    document.title = "Create account · Verify AI";
  }, []);

  const pwdOk = password.length >= 8;

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = "Enter your full name.";
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Choose a password.";
    else if (!pwdOk) next.password = "Password must be at least 8 characters.";
    if (!role) next.role = "Choose the account you're creating.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const data = await api.signup({ name: name.trim(), email: email.trim(), password, role });
      if (data?.pending) {
        // No session yet — show the approval notice instead of signing in.
        setPendingRole(role);
      } else {
        // Bootstrap case: the very first account on a fresh system becomes
        // the admin immediately and receives a session.
        setSession(data);
        onAuth(data);
      }
    } catch (err) {
      if (err.status === 409) {
        setFormError("An account with that email already exists.");
        setErrors({ email: "Use a different email, or sign in instead." });
      } else if (err.status === 400 || err.status === 403) {
        setFormError(err.message);
      } else {
        setFormError("Could not create the account. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  // --- Awaiting-approval screen ---------------------------------------
  if (pendingRole) {
    const option = ROLE_OPTIONS.find((o) => o.value === pendingRole);
    return (
      <AuthShell
        title="Account created"
        subtitle="Your registration has been received."
        footer={
          <>
            Already have an account?{" "}
            <Link className="link" to="/login">
              Sign in
            </Link>
          </>
        }
      >
        <div className="auth-pending" role="status">
          <div className="pending-ico">
            <Icon d={icons.clock} size={26} />
          </div>
          <h2>Waiting for approval</h2>
          <p>
            Your <strong>{option?.label || "officer"}</strong> account is pending review by an administrator. You can
            sign in as soon as it is approved.
          </p>
          <Link className="btn primary full-btn" to="/login">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register as a Verifying or Records officer. An administrator approves new accounts before they can sign in."
      footer={
        <>
          Already have an account?{" "}
          <Link className="link" to="/login">
            Sign in
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

        <div className="field" role="radiogroup" aria-label="Account type">
          <span className="field-label">Account type</span>
          <div className="role-pick">
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`role-opt${role === option.value ? " on" : ""}`}
                aria-pressed={role === option.value}
                onClick={() => {
                  setRole(option.value);
                  setErrors((prev) => ({ ...prev, role: undefined }));
                }}
              >
                <Icon d={option.icon} size={18} />
                <span>
                  <strong>{option.label}</strong>
                  <em>{option.hint}</em>
                </span>
              </button>
            ))}
          </div>
          {errors.role && (
            <span className="field-error" role="alert">
              {errors.role}
            </span>
          )}
        </div>

        <label className="field" htmlFor="signup-name">
          <span className="field-label">Full name</span>
          <span className="input-wrap">
            <Icon d={icons.user} size={16} className="input-icon" />
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Adaeze Okafor"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? "true" : undefined}
              aria-describedby={errors.name ? "signup-name-err" : undefined}
            />
          </span>
          {errors.name && (
            <span className="field-error" id="signup-name-err" role="alert">
              {errors.name}
            </span>
          )}
        </label>

        <label className="field" htmlFor="signup-email">
          <span className="field-label">Email address</span>
          <span className="input-wrap">
            <Icon d={icons.mail} size={16} className="input-icon" />
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@fcahpt.gov.ng"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "signup-email-err" : undefined}
            />
          </span>
          {errors.email && (
            <span className="field-error" id="signup-email-err" role="alert">
              {errors.email}
            </span>
          )}
        </label>

        <PasswordField
          id="signup-password"
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={pwdOk ? "Good — your password meets the minimum length." : "Use at least 8 characters."}
          hintOk={pwdOk}
        />

        <button className="btn primary full-btn" type="submit" disabled={busy}>
          {busy ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="auth-terms">
        By creating an account you agree to use Verify AI for authorised work at the Federal College of Animal Health
        and Production Technology only.
      </p>
    </AuthShell>
  );
}
