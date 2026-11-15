import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";
import { fetchOfficialResult, supportedBoards } from "./providers/index.js";
import readResultImage from "./vision/index.js";
import { runComparison, summarizeComparison } from "./compare.js";
import kakaverify from "./providers/kakaverify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");

// Vercel sits in front of the function: trust the first proxy hop so
// req.ip (used by the throttles below) is the real client, not the proxy.
app.set("trust proxy", 1);

// CORS is only needed in dev, where Vite serves the client from another
// origin (:5173/:5174). In production the client and API share an origin,
// so the allowlist stays empty unless CORS_ORIGIN lists extra origins.
const DEV_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]);
const EXTRA_ORIGINS = new Set(
  String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = same-origin navigation or curl -> allowed.
      if (!origin) return cb(null, true);
      cb(null, DEV_ORIGINS.has(origin) || EXTRA_ORIGINS.has(origin));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })
);

// Baseline security headers. A full Content-Security-Policy still needs a
// decision on the inline theme script + Google Fonts (see README).
app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  if (isProduction) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// Vercel rejects request bodies over 4.5 MB at the platform, so the JSON
// limit stays under that: a bigger photo would 413 before reaching us.
app.use(express.json({ limit: "4mb" }));

// Uploaded result photos used to live on disk; Vercel functions have a
// read-only filesystem, so the bytes now go into the database (see
// db.createRecord) and are served back by GET /api/uploads/:id. The local
// folder is still created (and served by express.static) for dev.
const uploadsDir = path.join(__dirname, "uploads");
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch {
  /* serverless: nothing writable here, storage lives in the database */
}

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,(.+)$/;

// Validates a photo data-URL before it is stored (type, emptiness, size).
function validateImage(dataUrl) {
  const m = IMAGE_DATA_URL.exec(dataUrl);
  if (!m) return "Upload a PNG, JPG or WEBP image.";
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0) return "The uploaded image is empty.";
  if (buf.length > 4 * 1024 * 1024) return "The image is too large (max 4 MB).";
  return null;
}

// Mirrors the original: field-level completeness checks, in a fixed order.
function runChecks({ candidateId, candidateName, exam, result }) {
  const findings = [];
  if (!candidateId.trim()) findings.push({ severity: "error", message: "Candidate / record ID is missing." });
  if (!candidateName.trim()) findings.push({ severity: "warning", message: "Candidate name was not supplied or extracted." });
  if (!exam.trim()) findings.push({ severity: "error", message: "Examination or test is missing." });
  if (!result.trim()) findings.push({ severity: "error", message: "Result details are missing." });
  if (findings.length === 0) {
    findings.push({
      severity: "info",
      message: "Basic completeness and duplicate checks found no issues. Authenticity has not been established.",
    });
  }
  return findings;
}

// Wraps an async handler so a rejected query becomes a normal Express
// error instead of a hung request.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Liveness probe: stays up even when the database is down (the ping has a
// 3s ceiling), so callers can tell "process dead" from "DB unreachable".
app.get(
  "/api/health",
  wrap(async (_req, res) => {
    const up = await Promise.race([
      db.ping(),
      new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);
    res.json({ ok: true, service: "verify-ai", db: up ? "up" : "down" });
  })
);

// --- Auth -------------------------------------------------------------
// Sessions are bearer tokens held in the client's localStorage and the
// sessions table in Supabase (see db.js).

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

const requireAuth = wrap(async (req, res, next) => {
  const user = await db.getSessionUser(tokenFrom(req));
  if (!user) return res.status(401).json({ error: "Sign in to continue." });
  req.user = user;
  next();
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Naive per-email throttle so a script can't brute-force the demo login.
const loginFails = new Map(); // email -> { count, firstAt }
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

// Generic fixed-window throttle keyed by anything (IP, user id...). The
// map is per-process, so on Vercel it is a per-instance best effort —
// proper distributed limits need a shared store (see README).
const rateHits = new Map(); // key -> { count, firstAt }
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const entry = rateHits.get(key);
  if (!entry || now - entry.firstAt > windowMs) {
    rateHits.set(key, { count: 1, firstAt: now });
    return false;
  }
  entry.count += 1;
  if (rateHits.size > 5000) rateHits.clear(); // bound memory
  return entry.count > max;
}

// Optional sign-up domain allowlist: ALLOWED_EMAIL_DOMAINS=fcahpt.gov.ng,...
const ALLOWED_EMAIL_DOMAINS = String(process.env.ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// The seeded demo account never signs in on a production deployment unless
// ALLOW_DEMO_LOGIN=1 re-enables it explicitly.
const DEMO_EMAILS = new Set(["officer@fcahpt.gov.ng", "officer@nvri.gov.ng"]);
const demoLoginAllowed = !isProduction || process.env.ALLOW_DEMO_LOGIN === "1";

function loginLocked(email) {
  const entry = loginFails.get(email);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOCK_WINDOW_MS) {
    loginFails.delete(email);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

function noteLoginFail(email) {
  const entry = loginFails.get(email) || { count: 0, firstAt: Date.now() };
  entry.count += 1;
  loginFails.set(email, entry);
}

app.post("/api/auth/signup", wrap(async (req, res) => {
  const body = req.body || {};
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!name) return res.status(400).json({ error: "Enter your full name." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (ALLOWED_EMAIL_DOMAINS.length && !ALLOWED_EMAIL_DOMAINS.includes(email.split("@")[1] || "")) {
    return res.status(403).json({ error: "Sign-up is restricted to approved email domains." });
  }
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  // Throttle after validation so garbage bodies never consume the budget.
  if (rateLimited(`signup:${req.ip || "unknown"}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many sign-up attempts from this network. Try again later." });
  }
  if (await db.findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const user = await db.createUser({ name, email, password });
  const token = await db.createSession(user.id);
  res.status(201).json({ token, user });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const body = req.body || {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ error: "Enter your email and password." });
  }
  if (loginLocked(email)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }
  if (!demoLoginAllowed && DEMO_EMAILS.has(email)) {
    // Same generic error as a wrong password — no account enumeration.
    return res.status(401).json({ error: "Email or password is incorrect." });
  }

  const user = await db.findUserByEmail(email);
  if (!user || !db.verifyUserPassword(user, password)) {
    noteLoginFail(email);
    return res.status(401).json({ error: "Email or password is incorrect." });
  }

  loginFails.delete(email);
  res.json({ token: await db.createSession(user.id), user: db.publicUser(user) });
}));

app.post("/api/auth/logout", requireAuth, wrap(async (req, res) => {
  await db.deleteSession(tokenFrom(req));
  res.json({ ok: true });
}));

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Everything below needs a signed-in user.
app.use("/api/analyze", requireAuth);
app.use("/api/records", requireAuth);
app.use("/api/verify", requireAuth);
// KakaVerify wallet + purchase endpoints spend real money — never public.
app.use("/api/kakaverify", requireAuth);

// --- Exam verification (New verification page) --------------------------
// Pure compute: fetches the official record, reads the uploaded photo with
// vision, and returns the field-by-field comparison. Nothing is saved until
// the officer posts the record via POST /api/records.
const BOARDS = new Set(["waec", "neco", "nabteb"]);
const NECO_SUBTYPES = new Set(["SSCEINT", "SSCEEXT"]);

app.post("/api/verify", async (req, res) => {
  try {
    const b = req.body || {};
    const examType = String(b.examType ?? "").toLowerCase().trim();
    const examNumber = String(b.examNumber ?? "").trim();
    const examYear = String(b.examYear ?? "").trim();
    const image = typeof b.image === "string" ? b.image : "";

    // Board-specific sub-types: NECO -> SSCEINT/SSCEEXT,
    // NABTEB -> NCEE/MJ/ND (anything else falls back per board).
    const examSubTypeRaw = String(b.examSubType ?? "").toUpperCase().trim();
    let examSubType;
    if (examType === "neco") examSubType = NECO_SUBTYPES.has(examSubTypeRaw) ? examSubTypeRaw : "SSCEINT";
    else if (examType === "nabteb") examSubType = ["NCEE", "MJ", "ND"].includes(examSubTypeRaw) ? examSubTypeRaw : "MJ";
    else examSubType = examSubTypeRaw;

    // Optional extras that flow through to the providers:
    //   phoneNumber -> KakaVerify token delivery
    //   nin/gender  -> NABTEB candidate lookup
    //   serialNumber/pinCode -> NABTEB ePIN check
    const phoneNumber = String(b.phoneNumber ?? "").trim();
    const nin = String(b.nin ?? "").trim();
    const gender = String(b.gender ?? "").trim();
    const serialNumber = String(b.serialNumber ?? "").trim();
    const pinCode = String(b.pinCode ?? "").trim();

    const errors = [];
    if (!BOARDS.has(examType)) errors.push("Select an examination board (WAEC, NECO or NABTEB).");
    if (examNumber.length < 4) errors.push("Enter the student's exam number.");
    if (!/^\d{4}$/.test(examYear)) {
      errors.push("Enter the four-digit examination year.");
    }
    const mimeMatch = IMAGE_DATA_URL.exec(image);
    if (!mimeMatch) errors.push("Upload a photo of the physical result (PNG, JPG or WEBP).");
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    // Verifications burn provider/quota budget — cap each officer at 30/min.
    if (rateLimited(`verify:${req.user?.id || req.ip}`, 30, 60 * 1000)) {
      return res.status(429).json({ error: "Too many verification requests. Wait a minute and try again." });
    }

    const mimeType = `image/${mimeMatch[1] === "jpg" ? "jpeg" : mimeMatch[1]}`;

    const [official, extracted] = await Promise.all([
      fetchOfficialResult({ examType, examNumber, examYear, examSubType, phoneNumber, nin, gender, serialNumber, pinCode }),
      readResultImage({ dataUrl: image, mimeType, examType }),
    ]);

    const comparison = runComparison({ official, extracted, request: { examType, examNumber, examYear } });

    res.json({
      official,
      extracted,
      comparison,
      board: examType,
      summary: summarizeComparison(comparison),
      status: comparison.verdict === "mismatch" ? "Escalated" : "Pending review",
    });
  } catch (e) {
    console.error("verify failed:", e);
    res.status(500).json({ error: "Verification could not be completed. Try again." });
  }
});

// Which boards and sources the intake form should offer (drives UI notes).
app.get("/api/verify/meta", (_req, res) => {
  res.json({ boards: supportedBoards() });
});

app.post("/api/analyze", (req, res) => {
  const body = req.body || {};
  const candidateId = String(body.candidateId ?? "");
  const candidateName = String(body.candidateName ?? "");
  const exam = String(body.exam ?? "");
  const result = String(body.result ?? "");
  const content = String(body.content ?? "");
  const image = body.image;

  const hasField = [candidateId, candidateName, exam, result].some((v) => v.trim());
  if (!hasField && !content.trim() && !image) {
    return res.status(400).json({ error: "Provide result details or a source document" });
  }

  res.json({
    extracted: { candidateId, candidateName, exam, result },
    findings: runChecks({ candidateId, candidateName, exam, result }),
  });
});

// The only statuses the review flow can produce (kept in sync with the
// client's status badges) — anything else is rejected before storage.
const RECORD_STATUSES = new Set(["Pending review", "Verified", "Escalated"]);

app.get("/api/records", wrap(async (req, res) => {
  // Server-side cap keeps list responses well under Vercel's 4.5 MB
  // response limit; pass ?limit= to pull more.
  const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 1000));
  res.json({ records: await db.listRecords(limit) });
}));

app.post("/api/records", wrap(async (req, res) => {
  const body = req.body || {};
  if (body.status !== undefined && !RECORD_STATUSES.has(String(body.status))) {
    return res.status(400).json({ error: "Unknown record status." });
  }

  // Verification record: photo + official/extracted/comparison payloads.
  if (typeof body.image === "string" && body.image.startsWith("data:image/")) {
    if (!String(body.examNumber ?? "").trim() || !String(body.exam ?? "").trim()) {
      return res.status(400).json({ error: "Exam number and examination are required." });
    }
    const invalid = validateImage(body.image);
    if (invalid) return res.status(400).json({ error: invalid });
    const { image, ...rest } = body;
    const record = await db.createRecord({ ...rest, imageData: image });
    return res.status(201).json({ record });
  }

  // Original manual-entry flow.
  const candidateId = String(body.candidateId ?? "").trim();
  const exam = String(body.exam ?? "").trim();
  const result = String(body.result ?? "").trim();
  if (!candidateId || !exam || !result) {
    return res.status(400).json({ error: "Candidate / record ID, examination and result are required." });
  }
  const record = await db.createRecord(body);
  res.status(201).json({ record });
}));

app.put("/api/records/:id", wrap(async (req, res) => {
  const patch = { ...(req.body || {}) };
  if (patch.status !== undefined && !RECORD_STATUSES.has(String(patch.status))) {
    return res.status(400).json({ error: "Unknown record status." });
  }
  // A review decision is always attributed to the officer who holds the
  // token — never to a name supplied by the client.
  if (patch.status !== undefined) patch.reviewedBy = req.user.name;
  const record = await db.updateRecord(req.params.id, patch);
  if (!record) return res.status(404).json({ error: "Record not found" });
  res.json({ record });
}));

app.delete("/api/records/:id", wrap(async (req, res) => {
  const removed = await db.deleteRecord(req.params.id);
  if (!removed) return res.status(404).json({ error: "Record not found" });
  res.json({ ok: true });
}));

// Stored result photos, served by id. Public on purpose: <img> tags cannot
// send a bearer token. The bytes live in the records table (imageData) and
// record.imageUrl points here, which keeps list responses small.
app.get("/api/uploads/:id", wrap(async (req, res) => {
  const dataUrl = await db.getRecordImage(req.params.id);
  const m = dataUrl ? IMAGE_DATA_URL.exec(dataUrl) : null;
  if (!m) return res.status(404).json({ error: "Image not found" });
  res.set("Content-Type", `image/${m[1] === "jpg" ? "jpeg" : m[1]}`);
  res.set("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(m[2], "base64"));
}));

// --- KakaVerify.ng endpoints --------------------------------------------
// Wallet queries and token/PIN purchases via KakaVerify (https://developers.kakaverify.ng).
// All require the KAKAVERIFY_API_KEY configured in server/.env.

app.get("/api/kakaverify/balance", async (_req, res) => {
  try {
    const result = await kakaverify.fetchWalletBalance();
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify balance failed:", e);
    res.status(500).json({ error: "Could not fetch KakaVerify wallet balance." });
  }
});

app.get("/api/kakaverify/history", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const result = await kakaverify.fetchWalletHistory({ limit });
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify history failed:", e);
    res.status(500).json({ error: "Could not fetch KakaVerify transaction history." });
  }
});

// Purchase an exam token (WAEC scratch card, NECO token, JAMB PIN, etc.).
app.post("/api/kakaverify/purchase-token", async (req, res) => {
  try {
    const b = req.body || {};
    const examType = String(b.examType ?? "").toLowerCase().trim();
    const quantity = Math.min(100, Math.max(1, Number(b.quantity) || 1));
    const phoneNumber = String(b.phoneNumber ?? "").trim();
    if (!examType) return res.status(400).json({ error: "Provide an exam type (waec, neco, nabteb, waec_nysc, nbais)." });
    const result = await kakaverify.purchaseExamToken({ examType, quantity, phoneNumber });
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify purchase-token failed:", e);
    res.status(500).json({ error: "Could not purchase exam token from KakaVerify." });
  }
});

// Purchase a WAEC Registration PIN (WASSCE Private Candidates).
app.post("/api/kakaverify/purchase-waec-pin", async (req, res) => {
  try {
    const b = req.body || {};
    const phone = String(b.phone ?? "").trim();
    const variationCode = String(b.variationCode ?? "waec-registraion").trim();
    const result = await kakaverify.purchaseWaecPin({ phone, variationCode });
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify purchase-waec-pin failed:", e);
    res.status(500).json({ error: "Could not purchase WAEC PIN from KakaVerify." });
  }
});

// List active WAEC ePIN packages.
app.get("/api/kakaverify/waec-packages", async (_req, res) => {
  try {
    const result = await kakaverify.fetchWaecPackages();
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify waec-packages failed:", e);
    res.status(500).json({ error: "Could not fetch WAEC packages from KakaVerify." });
  }
});

// Check WAEC ePIN purchase status.
app.get("/api/kakaverify/waec-status", async (req, res) => {
  try {
    const { request_id, transref, limit } = req.query;
    const result = await kakaverify.fetchWaecStatus({ requestId: request_id, transref, limit: Number(limit) || 20 });
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify waec-status failed:", e);
    res.status(500).json({ error: "Could not fetch WAEC purchase status from KakaVerify." });
  }
});

// List active JAMB packages.
app.get("/api/kakaverify/jamb-packages", async (_req, res) => {
  try {
    const result = await kakaverify.fetchJambPackages();
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify jamb-packages failed:", e);
    res.status(500).json({ error: "Could not fetch JAMB packages from KakaVerify." });
  }
});

// Verify a JAMB Profile Code (returns candidate name).
app.post("/api/kakaverify/jamb-verify", async (req, res) => {
  try {
    const b = req.body || {};
    const profileId = String(b.profileId ?? "").trim();
    const variationCode = String(b.variationCode ?? "utme-mock").trim();
    if (!profileId) return res.status(400).json({ error: "Provide a 10-digit JAMB Profile Code." });
    const result = await kakaverify.verifyJambProfile({ profileId, variationCode });
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify jamb-verify failed:", e);
    res.status(500).json({ error: "Could not verify JAMB profile via KakaVerify." });
  }
});

// Purchase a JAMB ePIN.
app.post("/api/kakaverify/jamb-purchase", async (req, res) => {
  try {
    const b = req.body || {};
    const profileId = String(b.profileId ?? "").trim();
    const variationCode = String(b.variationCode ?? "utme-mock").trim();
    const phone = String(b.phone ?? "").trim();
    const customerName = String(b.customerName ?? "").trim();
    if (!profileId) return res.status(400).json({ error: "Provide a 10-digit JAMB Profile Code." });
    const result = await kakaverify.purchaseJambPin({ profileId, variationCode, phone, customerName });
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify jamb-purchase failed:", e);
    res.status(500).json({ error: "Could not purchase JAMB PIN from KakaVerify." });
  }
});

// Check JAMB purchase status.
app.get("/api/kakaverify/jamb-status", async (req, res) => {
  try {
    const { request_id, transref, limit } = req.query;
    const result = await kakaverify.fetchJambStatus({ requestId: request_id, transref, limit: Number(limit) || 20 });
    if (!result.ok) return res.status(result.reason === "not-configured" ? 400 : 502).json(result);
    res.json(result);
  } catch (e) {
    console.error("kakaverify jamb-status failed:", e);
    res.status(500).json({ error: "Could not fetch JAMB purchase status from KakaVerify." });
  }
});

// Uploaded result photos (public so <img> tags can load them).
app.use("/uploads", express.static(uploadsDir));

// Serve the built client when it exists (npm run build && npm start).
const dist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(dist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(dist, "index.html"), (err) => err && next());
});

// Unknown API paths answer with JSON, not the SPA's HTML.
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Unknown endpoint: ${req.method} ${req.path}` });
});

// Central error handler: anything a route's own try/catch missed (body
// parser errors, unexpected throws, rejected queries) becomes clean JSON
// instead of Express' default HTML error page.
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} ->`, err.message);
  if (res.headersSent) return;
  if (status === 413) return res.status(413).json({ error: "The request body is too large (max 4 MB)." });
  res
    .status(status)
    .json({ error: status >= 500 ? "Something went wrong on the server. Try again." : err.message });
});

// Background promise failures are logged, never silently swallowed (and
// never allowed to kill the process — on Vercel that would take every
// concurrent request down with it).
process.on("unhandledRejection", (reason) => console.error("unhandledRejection:", reason));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

// On Vercel this module is imported by api/index.js, which exports the app
// as the function handler; only listen when run as a local server.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Verify AI server listening on http://localhost:${PORT}`);
  });
}

export default app;
