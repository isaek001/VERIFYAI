// Data layer.
//
// Currently an in-memory store so the app runs with zero configuration.
// To switch to Supabase later:
//   1. npm install @supabase/supabase-js
//   2. set SUPABASE_URL and SUPABASE_SERVICE_KEY in server/.env
//   3. implement the record + user/session functions below with the
//      supabase client (auth can move to Supabase Auth / GoTrue —
//      passwords.js and the sessions map here are the only touch points).
// The REST of the app only talks to these functions, so nothing else changes.
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./passwords.js";

const records = [];

function listRecords() {
  return [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getRecord(id) {
  return records.find((r) => r.id === id) || null;
}

function createRecord(data) {
  const record = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    candidateId: String(data.candidateId ?? "").trim(),
    candidateName: String(data.candidateName ?? "").trim(),
    exam: String(data.exam ?? "").trim(),
    result: String(data.result ?? "").trim(),
    findings: Array.isArray(data.findings) ? data.findings : [],
    sourceText: String(data.sourceText ?? "").slice(0, 8000),
    status: data.status || "Pending review",
    // --- Exam-verification flow (New verification page) -----------------
    examType: String(data.examType ?? "").trim(),
    examNumber: String(data.examNumber ?? "").trim(),
    examYear: String(data.examYear ?? "").trim(),
    examSubType: String(data.examSubType ?? "").trim(),
    imageUrl: data.imageUrl || null,
    official: data.official || null,
    extracted: data.extracted || null,
    comparison: data.comparison || null,
    verdict: data.verdict || data.comparison?.verdict || null,
    // --------------------------------------------------------------------
    createdAt: new Date().toISOString(),
    reviewedBy: null,
    reviewNote: "",
  };
  records.unshift(record);
  return record;
}

function updateRecord(id, patch) {
  const record = getRecord(id);
  if (!record) return null;
  if (patch.status) record.status = patch.status;
  if (patch.reviewedBy !== undefined) record.reviewedBy = patch.reviewedBy;
  if (patch.reviewNote !== undefined) record.reviewNote = patch.reviewNote;
  return record;
}

// --- Users & sessions -------------------------------------------------
// Same story as records: in-memory today, Supabase Auth later. Passwords
// never leave this layer — see passwords.js for the hashing.

const users = [];
const sessions = new Map(); // token -> userId

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function findUserByEmail(email) {
  const needle = String(email ?? "").trim().toLowerCase();
  return users.find((u) => u.email === needle) || null;
}

function findUserById(id) {
  return users.find((u) => u.id === id) || null;
}

function createUser({ name, email, password }) {
  const user = {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name ?? "").trim(),
    email: String(email ?? "").trim().toLowerCase(),
    ...hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  return publicUser(user);
}

function verifyUserPassword(user, password) {
  return verifyPassword(password, user.salt, user.hash);
}

function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, userId);
  return token;
}

function getSessionUser(token) {
  if (!token) return null;
  return publicUser(findUserById(sessions.get(token)));
}

function deleteSession(token) {
  if (token) sessions.delete(token);
}

// Demo account so the app is usable immediately after sign-up pages land.
function seedDemoAccount() {
  if (findUserByEmail("officer@nvri.gov.ng")) return;
  createUser({ name: "Verification Officer", email: "officer@nvri.gov.ng", password: "Passw0rd!" });
}
seedDemoAccount();

export default {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  findUserByEmail,
  findUserById,
  createUser,
  verifyUserPassword,
  createSession,
  getSessionUser,
  deleteSession,
  publicUser,
};
