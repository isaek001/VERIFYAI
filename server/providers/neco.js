// NECO e-Verify API (official).
// Docs: https://everify.neco.gov.ng/inc/e-Verify-api-doc.pdf — POST /single
// Needs an institution API key plus a purchased verification token (RRR)
// and its payment reference (NECO_API_KEY / NECO_TOKEN / NECO_PAYREF).
import { config } from "../config.js";

const BASE = "https://everify.neco.gov.ng/api_core";

// The public docs show a loosely-structured `details` payload; map it
// defensively so minor field-name differences don't break the comparison.
function mapDetails(details, fallback) {
  const d = Array.isArray(details) ? details[0] : details;
  if (!d || typeof d !== "object") return null;

  const name =
    d.candidateName ||
    d.candidate_name ||
    d.name ||
    [d.surname, d.firstname, d.othername || d.othernames].filter(Boolean).join(" ").trim();

  const rawSubjects = d.subjects || d.results || d.grades || [];
  const subjects = (Array.isArray(rawSubjects) ? rawSubjects : [])
    .map((s) => ({
      subject: String(s.subject || s.name || s.paper || ""),
      grade: String(s.grade ?? s.result ?? ""),
    }))
    .filter((s) => s.subject);

  return {
    candidateName: name || "",
    examNumber: String(d.examno || d.examNumber || d.exam_no || fallback.examNumber),
    examYear: String(d.exam_year || d.examYear || d.year || fallback.examYear),
    center: d.center || d.centre || "",
    subjects,
  };
}

export default async function fetchNeco({ examNumber, examYear, examSubType }) {
  const source = "neco-official";
  if (!config.necoApiKey || !config.necoToken || !config.necoPayRef) {
    return {
      ok: false,
      source,
      reason: "not-configured",
      message: "NECO e-Verify credentials (key, token, payref) are not configured.",
    };
  }

  let res;
  try {
    res = await fetch(`${BASE}/single`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.necoApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: config.necoToken,
        payref: config.necoPayRef,
        examno: examNumber,
        exam_year: examYear,
        exam_type: examSubType || "SSCEINT",
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return { ok: false, source, reason: "network", message: `Could not reach the NECO e-Verify API (${e.message}).` };
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || (json && json.status && Number(json.status) >= 400)) {
    const msg = json?.error || json?.message || `NECO e-Verify responded with HTTP ${res.status}.`;
    const notFound = /not found|invalid/i.test(String(msg)) || res.status === 400;
    return { ok: false, source, reason: notFound ? "not-found" : "bad-response", message: String(msg) };
  }

  const mapped = mapDetails(json?.details ?? json?.data, { examNumber, examYear });
  if (!mapped) {
    return { ok: false, source, reason: "bad-response", message: "Unexpected response from the NECO e-Verify API." };
  }
  if (mapped.subjects.length === 0 && !mapped.candidateName) {
    return {
      ok: false,
      source,
      reason: "not-found",
      message: json?.message || "No NECO result found for that examination number and year.",
    };
  }

  return {
    ok: true,
    source,
    sourceLabel: "NECO e-Verify API",
    ...mapped,
  };
}
