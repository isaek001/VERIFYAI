const ERROR_PREFIXES = ["unavailable", "Could not", "Use a"];

export default function Toast({ message }) {
  if (!message) return null;
  const isError = ERROR_PREFIXES.some((p) => message.includes(p));
  return (
    <div className={`toast ${isError ? "toast-error" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
