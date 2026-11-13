// Light/dark theme: stored in localStorage and mirrored onto
// <html data-theme> so CSS can switch palettes. index.html runs the
// same logic before first paint to avoid a flash of the wrong theme.
const KEY = "verifyai-theme";

export function readTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* storage blocked — fall through to system preference */
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage blocked — theme still applies for this visit */
  }
}
