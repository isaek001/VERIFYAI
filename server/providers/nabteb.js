// NABTEB official result provider.
//
// Connects to the same backend the official student portal uses
// (https://student.nabteb.gov.ng/exams/results -> https://api.nabteb.gov.ng).
//
// Endpoints (verified live):
//   GET  /api/results/availability   ?candidateNumber&examYear&examTypeCode[&nin]
//        -> { available: boolean, message? }
//   POST /api/results/check-free     { candidateNumber, examYear, examTypeCode, nin?, gender? }
//        -> 200 result object | 404 (no result / allowance used)
//   POST /api/results/check-with-pin { candidateNumber, examYear, examTypeCode,
//                                      serialNumber, pinCode, nin?, gender? }
//        -> 200 result object | 404 (bad pin or no result)
//
// Result object shape (from the portal's own ResultChecker bundle):
//   { candidateName, candidateNumber, examYear, centerName, centerCode,
//     tradeName, tradeCode, score, admissionStatus, maxUsage, cardUseCount,
//     subjects: [{ name, grade }] }   (subjects may arrive as a JSON string)
//
// Normalized output matches the other providers:
//   ok: true  -> { source, sourceLabel, candidateName, examNumber, examYear,
//                  center, subjects: [{ subject, grade }] }
//   ok: false -> { source, reason, message }

import { config } from "../config.js";

const BASE = config.nabtebApiBaseUrl;

// examTypeCode values used by the portal: NCEE | MJ (May/June) | ND (Nov/Dec).
function normalizeExamTypeCode(examType, examSubType) {
  const sub = String(examSubType || "").toUpperCase().trim();
  if (sub === "NCEE" || sub === "MJ" || sub === "ND") return sub;
  const t = String(examType || "").toUpperCase();
  if (t.includes("NCEE")) return "NCEE";
  if (t.includes("NOV") || t.includes("DEC")) return "ND";
  if (t.includes("MAY") || t.includes("JUNE")) return "MJ";
  return "MJ";
}

async function call(path, { method = "GET", body = null, timeoutMs = 25000, retries = 2 } = {}) {
  let res;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastErr = null;
      break;
    } catch (e) {
      // Transient DNS/TLS resets happen on this route — retry once or twice.
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (lastErr || !res) {
    return { ok: false, reason: "network", message: `Could not reach the NABTEB results API (${lastErr?.message}).` };
  }

  // 404 from these routes is a business answer: "no result found" /
  // "allowance exhausted" / "invalid pin" — the route itself exists.
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    let msg = "";
    try {
      const j = JSON.parse(text);
      msg = j.message || j.error || "";
    } catch { /* empty body */ }
    return { ok: false, reason: "not-found", message: msg || "No NABTEB result found for the provided details." };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.message || json?.error || `NABTEB responded with HTTP ${res.status}.`;
    return { ok: false, reason: "bad-response", status: res.status, message: String(msg) };
  }
  return { ok: true, body: json };
}

// Subjects may arrive as an array or as a JSON-encoded string.
function normalizeSubjects(raw) {
  let list = raw;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => ({
      subject: String(s.name || s.subject || s.paper || "").trim(),
      grade: String(s.grade ?? s.result ?? s.score ?? "").trim(),
    }))
    .filter((s) => s.subject);
}

function toNormalized(d, examNumber, examYear, examTypeCode) {
  const name =
    d.candidateName || d.fullName || d.name ||
    [d.surname, d.firstname, d.othername || d.othernames].filter(Boolean).join(" ").trim();

  const subjects = normalizeSubjects(d.subjects);
  if (!name && subjects.length === 0) return null;

  return {
    ok: true,
    source: "nabteb-official",
    sourceLabel: "NABTEB official API",
    candidateName: name || "",
    examNumber: String(d.candidateNumber || d.examNo || examNumber || ""),
    examYear: String(d.examYear || examYear || ""),
    center: d.centerName || d.centre || "",
    centerCode: d.centerCode || "",
    tradeName: d.tradeName || "",
    score: d.score ?? null,
    admissionStatus: d.admissionStatus || "",
    examTypeCode: String(d.examTypeCode || examTypeCode || "").toUpperCase(),
    subjects,
  };
}

// GET /api/results/availability — cheap pre-check before spending an allowance.
export async function fetchNabtebAvailability({ examNumber, examYear, examType, examSubType, nin } = {}) {
  const examTypeCode = normalizeExamTypeCode(examType, examSubType);
  const params = new URLSearchParams({
    candidateNumber: String(examNumber || "").trim(),
    examYear: String(examYear || "").trim(),
    examTypeCode,
  });
  if (nin) params.set("nin", String(nin).trim());

  const r = await call(`/api/results/availability?${params.toString()}`);
  if (!r.ok) return r;
  return {
    ok: true,
    source: "nabteb-official",
    available: Boolean(r.body?.available),
    message: r.body?.message || "",
    raw: r.body,
  };
}

// POST /api/results/check-free — uses the candidate's free check allowance.
export async function checkNabtebFree({ examNumber, examYear, examType, examSubType, nin, gender } = {}) {
  const examNumberClean = String(examNumber || "").trim();
  const year = String(examYear || "").trim();
  if (!examNumberClean || !year) {
    return { ok: false, source: "nabteb-official", reason: "missing-credentials", message: "Candidate number and exam year are required." };
  }
  const examTypeCode = normalizeExamTypeCode(examType, examSubType);
  const body = { candidateNumber: examNumberClean, examYear: year, examTypeCode };
  if (nin) body.nin = String(nin).trim();
  if (gender) body.gender = String(gender).trim();

  const r = await call("/api/results/check-free", { method: "POST", body });
  if (!r.ok) return { ...r, source: "nabteb-official" };

  const d = r.body?.result || r.body?.data || r.body;
  const normalized = toNormalized(d || {}, examNumberClean, year, examTypeCode);
  if (!normalized) {
    return { ok: false, source: "nabteb-official", reason: "not-found", message: "No NABTEB result found for the provided details." };
  }
  return { ...normalized, checkMode: "free", raw: r.body };
}

// POST /api/results/check-with-pin — checks with a purchased ePIN.
export async function checkNabtebWithPin({ examNumber, examYear, examType, examSubType, serialNumber, pinCode, nin, gender } = {}) {
  const examNumberClean = String(examNumber || "").trim();
  const year = String(examYear || "").trim();
  const serial = String(serialNumber || "").trim();
  const pin = String(pinCode || "").trim();
  if (!examNumberClean || !year) {
    return { ok: false, source: "nabteb-official", reason: "missing-credentials", message: "Candidate number and exam year are required." };
  }
  if (!serial || !pin) {
    return { ok: false, source: "nabteb-official", reason: "missing-credentials", message: "ePIN serial number and PIN code are required." };
  }
  const examTypeCode = normalizeExamTypeCode(examType, examSubType);
  const body = {
    candidateNumber: examNumberClean,
    examYear: year,
    examTypeCode,
    serialNumber: serial,
    pinCode: pin,
  };
  if (nin) body.nin = String(nin).trim();
  if (gender) body.gender = String(gender).trim();

  const r = await call("/api/results/check-with-pin", { method: "POST", body });
  if (!r.ok) return { ...r, source: "nabteb-official" };

  const d = r.body?.result || r.body?.data || r.body;
  const normalized = toNormalized(d || {}, examNumberClean, year, examTypeCode);
  if (!normalized) {
    return { ok: false, source: "nabteb-official", reason: "not-found", message: "No NABTEB result found for the provided details." };
  }
  return { ...normalized, checkMode: "pin", raw: r.body };
}

// Default entry used by the dispatcher: try the free allowance first, then
// fall back to an ePIN if one was supplied by the caller.
export default async function fetchNabteb({ examNumber, examYear, examType, examSubType, nin, gender, serialNumber, pinCode } = {}) {
  if (serialNumber && pinCode) {
    return checkNabtebWithPin({ examNumber, examYear, examType, examSubType, serialNumber, pinCode, nin, gender });
  }
  const free = await checkNabtebFree({ examNumber, examYear, examType, examSubType, nin, gender });
  if (free.ok) return free;
  // Free allowance exhausted or no free result — surface the reason so the
  // UI can prompt for an ePIN purchase (Kakaverify or the portal's Remita flow).
  if (free.reason === "not-found") return free;
  return free;
}
