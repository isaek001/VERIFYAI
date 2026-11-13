import { Icon, icons } from "./Icon.jsx";

// Green reassurance banner (dashboard + settings).
export function Notice({ title, children }) {
  return (
    <div className="notice">
      <Icon d={icons.shield} size={20} />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

// Amber caution strip.
export function WarnBox({ children, wide = false }) {
  return (
    <div className={`warn-box ${wide ? "wide" : ""}`}>
      <Icon d={icons.alert} size={16} />
      <span>{children}</span>
    </div>
  );
}
