// WAEC Digital Certificate Confirmation API (official).
// Docs: https://docs.waec.org — POST /certificate/confirm
// Requires an institution X-DigiCert-Secret; a free sandbox exists at
// api.smartdocument.org (WAEC_SANDBOX=1).
import { config } from "../config.js";

const BASE = config.waecSandbox
  ? "https://api.smartdocument.org/api/v1/external"
  : "https://api.waec.org/api/v1/external";

export default async function fetchWaec({ examNumber, examYear }) {
  const source = "waec-official";
  if (!config.waecApiSecret) {
    return { ok: false, source, reason: "not-configured", message: "WAEC API secret key is not configured." };
  }

  let res;
  try {
    res = await fetch(`${BASE}/certificate/confirm`, {
      method: "POST",
      headers: {
        "X-DigiCert-Secret": config.waecApiSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        certificates: [{ country: "NG", candidate_number: examNumber, year: examYear }],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return { ok: false, source, reason: "network", message: `Could not reach the WAEC API (${e.message}).` };
  }

  if (!res.ok) {
    return { ok: false, source, reason: "bad-response", message: `WAEC API responded with HTTP ${res.status}.` };
  }

  const json = await res.json().catch(() => null);
  const entry = Array.isArray(json?.data) ? json.data[0] : json?.data;
  if (!entry) {
    return { ok: false, source, reason: "bad-response", message: "Unexpected response from the WAEC API." };
  }

  const cert = entry.result?.certificate;
  if (!cert) {
    return {
      ok: false,
      source,
      reason: "not-found",
      message: entry.message || "No WAEC certificate found for that candidate number and year.",
    };
  }

  const name = [cert.surname, cert.firstname, cert.othernames].filter(Boolean).join(" ").trim();

  return {
    ok: true,
    source,
    sourceLabel: config.waecSandbox ? "WAEC API (sandbox)" : "WAEC Digital Certificate API",
    candidateName: name,
    examNumber: String(cert.candidate_number || examNumber),
    examYear: String(cert.year || examYear),
    center: cert.center || "",
    subjects: (Array.isArray(cert.results) ? cert.results : [])
      .filter((r) => r && r.subject)
      .map((r) => ({ subject: String(r.subject), grade: String(r.grade ?? "") })),
  };
}
