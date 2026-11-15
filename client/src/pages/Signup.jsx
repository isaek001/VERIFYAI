import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, setSession } from "../api.js";
import { Icon, icons } from "../components/Icon.jsx";
import AuthShell from "../components/auth/AuthShell.jsx";
import PasswordField from "../components/auth/PasswordField.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup({ onAuth }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

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
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const data = await api.signup({ name: name.trim(), email: email.trim(), password });
      setSession(data);
      onAuth(data);
    } catch (err) {
      if (err.status === 409) {
        setFormError("An account with that email already exists.");
        setErrors({ email: "Use a different email, or sign in instead." });
      } else if (err.status === 400) {
        setFormError(err.message);
      } else {
        setFormError("Could not create the account. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register with your Federal College of Animal Health and Production Technology staff email to start verifying results."
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
