// Thin API client. In dev, Vite proxies /api to the Express server.
const BASE = "";
const SESSION_KEY = "verifyai.session";

// --- Session ----------------------------------------------------------
// { token, user } persisted in localStorage so a refresh stays signed in.
let unauthorizedHandler = null;

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  return session;
}

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

// Called by App when the server rejects our token (expired/restarted).
function handleUnauthorized() {
  setSession(null);
  if (unauthorizedHandler) unauthorizedHandler();
}

async function request(path, options = {}) {
  const session = getSession();
  const headers = { "Content-Type": "application/json" };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && !path.startsWith("/api/auth/")) handleUnauthorized();

  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  signup: (payload) => request("/api/auth/signup", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => request("/api/auth/logout", { method: "POST", body: "{}" }),
  me: () => request("/api/auth/me"),

  // Records
  getRecords: () => request("/api/records"),
  analyze: (payload) => request("/api/analyze", { method: "POST", body: JSON.stringify(payload) }),
  // Exam verification: fetch official result + read photo + compare (pure).
  verify: (payload) => request("/api/verify", { method: "POST", body: JSON.stringify(payload) }),
  createRecord: (payload) => request("/api/records", { method: "POST", body: JSON.stringify(payload) }),
  updateRecord: (id, payload) =>
    request(`/api/records/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
};
