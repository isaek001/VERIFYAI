import { useState } from "react";
import { Icon, icons } from "../Icon.jsx";

// Secure text field with a show/hide reveal (HIG: secure fields hide
// private data; the reveal is optional and never the default).
export default function PasswordField({ id, label, autoComplete, placeholder, value, onChange, error, hint, hintOk }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="pwd-wrap">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          className="pwd-toggle"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          tabIndex={-1}
        >
          <Icon d={revealed ? icons.eyeOff : icons.eye} size={17} />
        </button>
      </span>
      {error ? (
        <span className="field-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={`field-hint${hintOk ? " ok" : ""}`} id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
