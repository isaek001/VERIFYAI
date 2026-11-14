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

app.use(cors());
app.use(express.json({ limit: "12mb" }));

// Uploaded result photos live on disk (swap for Supabase Storage later).
// Public on purpose: <img> tags cannot send a bearer token.
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,(.+)$/;

function saveUploadedImage(dataUrl) {
  const m = IMAGE_DATA_URL.exec(dataUrl);
  if (!m) return { error: "Upload a PNG, JPG or WEBP image." };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0) return { error: "The uploaded image is empty." };
  if (buf.length > 8 * 1024 * 1024) return { error: "The image is too large (max 8 MB)." };
  const ext = m[1] === "jpeg" || m[1] === "jpg" ? "jpg" : m[1];
  const name = `upl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return { imageUrl: `/uploads/${name}` };
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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "verify-ai" });
});

// --- Auth -------------------------------------------------------------
// Sessions are bearer tokens held in the client's localStorage and a
// server-side map (swap for Supabase Auth later, see db.js).

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function requireAuth(req, res, next) {
  const user = db.getSessionUser(tokenFrom(req));
  if (!user) return res.status(401).json({ error: "Sign in to continue." });
  req.user = user;
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Naive per-email throttle so a script can't brute-force the demo login.
const loginFails = new Map(); // email -> { count, firstAt }
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

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

app.post("/api/auth/signup", (req, res) => {
  const body = req.body || {};
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!name) return res.status(400).json({ error: "Enter your full name." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (db.findUserByEmail(email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const user = db.createUser({ name, email, password });
  const token = db.createSession(user.id);
  res.status(201).json({ token, user });
});

app.post("/api/auth/login", (req, res) => {
  const body = req.body || {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ error: "Enter your email and password." });
  }
  if (loginLocked(email)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  const user = db.findUserByEmail(email);
  if (!user || !db.verifyUserPassword(user, password)) {
    noteLoginFail(email);
    return res.status(401).json({ error: "Email or password is incorrect." });
  }

  loginFails.delete(email);
  res.json({ token: db.createSession(user.id), user: db.publicUser(user) });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  db.deleteSession(tokenFrom(req));
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Everything below needs a signed-in user.
app.use("/api/analyze", requireAuth);
app.use("/api/records", requireAuth);
app.use("/api/verify", requireAuth);

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
    const examSubTypeRaw = String(b.examSubType ?? "").toUpperCase().trim();
    const examSubType = NECO_SUBTYPES.has(examSubTypeRaw) ? examSubTypeRaw : "SSCEINT";
    const image = typeof b.image === "string" ? b.image : "";

    const errors = [];
    if (!BOARDS.has(examType)) errors.push("Select an examination board (WAEC, NECO or NABTEB).");
    if (examNumber.length < 4) errors.push("Enter the student's exam number.");
    if ((examType === "waec" || examType === "neco") && !/^\d{4}$/.test(examYear)) {
      errors.push("Enter the four-digit examination year.");
    }
    const mimeMatch = IMAGE_DATA_URL.exec(image);
    if (!mimeMatch) errors.push("Upload a photo of the physical result (PNG, JPG or WEBP).");
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const mimeType = `image/${mimeMatch[1] === "jpg" ? "jpeg" : mimeMatch[1]}`;

    const [official, extracted] = await Promise.all([
      fetchOfficialResult({ examType, examNumber, examYear, examSubType }),
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

app.get("/api/records", (_req, res) => {
  res.json({ records: db.listRecords() });
});

app.post("/api/records", (req, res) => {
  const body = req.body || {};

  // Verification record: photo + official/extracted/comparison payloads.
  if (typeof body.image === "string" && body.image.startsWith("data:image/")) {
    if (!String(body.examNumber ?? "").trim() || !String(body.exam ?? "").trim()) {
      return res.status(400).json({ error: "Exam number and examination are required." });
    }
    const saved = saveUploadedImage(body.image);
    if (saved.error) return res.status(400).json({ error: saved.error });
    const { image, ...rest } = body;
    return res.status(201).json({ record: db.createRecord({ ...rest, imageUrl: saved.imageUrl }) });
  }

  // Original manual-entry flow.
  const candidateId = String(body.candidateId ?? "").trim();
  const exam = String(body.exam ?? "").trim();
  const result = String(body.result ?? "").trim();
  if (!candidateId || !exam || !result) {
    return res.status(400).json({ error: "Candidate / record ID, examination and result are required." });
  }
  res.status(201).json({ record: db.createRecord(body) });
});

app.put("/api/records/:id", (req, res) => {
  const record = db.updateRecord(req.params.id, req.body || {});
  if (!record) return res.status(404).json({ error: "Record not found" });
  res.json({ record });
});

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

app.listen(PORT, () => {
  console.log(`Verify AI server listening on http://localhost:${PORT}`);
});
