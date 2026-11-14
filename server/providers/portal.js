// Portal checkers — use purchased scratch-card PINs to query the official
// WAEC and NECO result portals directly. These are only invoked when the
// Kakaverify path supplies a PIN; the direct WAEC/NECO API providers
// (waec.js, neco.js) remain the primary path when configured.
//
// WAECdirect: POST https://www.waecdirect.org/waecdirect/CheckResult.aspx
//   (form-encoded: ExamNumber, ExamYear, ExamType, serial, pin)
// NECO e-Verify: POST https://everify.neco.gov.ng/api_core/single
//   (JSON with token, payref, examno, exam_year, exam_type)

// ---------------------------------------------------------------------------
// WAECdirect scraper
// ---------------------------------------------------------------------------

const WAEC_BASE = "https://www.waecdirect.org";

// Parse the WAECdirect result page (HTML) into normalized fields.
function parseWaecHtml(html) {
  if (!html) return null;

  // Candidate name is usually in a table cell after "Candidate's Name" or
  // in an input with id containing "txtCandidateName". Try several patterns.
  let candidateName = "";
  const nameMatch =
    html.match(/Candidate's Name[:\s]*<[^>]*>([^<]+)</i) ||
    html.match(/id="[^"]*txtCandidateName[^"]*"[^>]*value="([^"]*)"/i) ||
    html.match(/Candidate\s*Name[:\s]*<[^>]*>([^<]+)</i);
  if (nameMatch) candidateName = nameMatch[1].trim();

  // Exam number
  let examNumber = "";
  const numMatch =
    html.match(/Candidate Number[:\s]*<[^>]*>([^<]+)</i) ||
    html.match(/Exam Number[:\s]*<[^>]*>([^<]+)</i) ||
    html.match(/id="[^"]*txtExamNo[^"]*"[^>]*value="([^"]*)"/i);
  if (numMatch) examNumber = numMatch[1].trim();

  // Center
  let center = "";
  const centerMatch =
    html.match(/Centre[:\s]*<[^>]*>([^<]+)</i) ||
    html.match(/id="[^"]*txtCentre[^"]*"[^>]*value="([^"]*)"/i);
  if (centerMatch) center = centerMatch[1].trim();

  // Exam type + year combined (e.g. "NOV/DEC WASSCE 2024")
  let examTypeYear = "";
  const typeMatch =
    html.match(/Exam Type[:\s]*<[^>]*>([^<]+)</i) ||
    html.match(/id="[^"]*txtExamType[^"]*"[^>]*value="([^"]*)"/i);
  if (typeMatch) examTypeYear = typeMatch[1].trim();

  // Subjects + grades: look for table rows with a subject name and a grade.
  // Typical pattern: <td>ENGLISH LANGUAGE</td> ... <td>A1</td>
  const subjects = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowM;
  while ((rowM = rowRe.exec(html)) !== null) {
    const row = rowM[1];
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellM;
    while ((cellM = cellRe.exec(row)) !== null) {
      cells.push(cellM[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
    }
    if (cells.length >= 2) {
      const subject = cells[0];
      const grade = cells[cells.length - 1];
      // Subject names are uppercase letters + spaces; grades are short codes.
      if (/^[A-Z][A-Z\s\-&/]{2,}$/.test(subject) && /^[A-F][1-9]?$|^A[1-9]$|^B[1-9]$|^C[1-9]$|^D[1-9]$|^E[1-9]$|^P[1-9]$|^W[1-9]$|^AG$|^AB$/i.test(grade)) {
        subjects.push({ subject, grade });
      }
    }
  }

  // Fallback: if no subject rows found, look for a JSON blob embedded in the page.
  if (subjects.length === 0) {
    const jsonMatch = html.match(/var\s+resultData\s*=\s*(\{[\s\S]*?\});/i);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        if (Array.isArray(data.subjects)) {
          for (const s of data.subjects) {
            if (s.subject && s.grade) subjects.push({ subject: String(s.subject), grade: String(s.grade) });
          }
        }
        if (data.candidateName) candidateName = String(data.candidateName);
        if (data.center) center = String(data.center);
      } catch {
        // ignore parse errors
      }
    }
  }

  return { candidateName, examNumber, center, examTypeYear, subjects };
}

// Check WAEC result using a purchased scratch card (serial + pin).
export async function checkWaecDirect({ examNumber, examYear, examType = "NOV/DEC", serial, pin }) {
  if (!serial || !pin) {
    return { ok: false, source: "waec-direct", reason: "missing-credentials", message: "WAEC scratch card serial and PIN are required." };
  }
  const form = new URLSearchParams();
  form.set("ExamNumber", String(examNumber || "").trim());
  form.set("ExamYear", String(examYear || "").trim());
  form.set("ExamType", String(examType || "").trim());
  form.set("serial", String(serial).trim());
  form.set("pin", String(pin).trim());

  let res;
  try {
    res = await fetch(`${WAEC_BASE}/waecdirect/CheckResult.aspx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    return { ok: false, source: "waec-direct", reason: "network", message: `Could not reach WAECdirect (${e.message}).` };
  }

  const html = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, source: "waec-direct", reason: "bad-response", message: `WAECdirect responded with HTTP ${res.status}.` };
  }

  const parsed = parseWaecHtml(html);
  if (!parsed || (!parsed.subjects.length && !parsed.candidateName)) {
    const errMatch = html.match(/error[^>]*>([^<]{10,})</i) || html.match(/Invalid[^<]{5,}/i);
    return {
      ok: false,
      source: "waec-direct",
      reason: "not-found",
      message: errMatch ? errMatch[0].trim().slice(0, 200) : "No WAEC result found for that exam number, year, and scratch card.",
    };
  }

  // Extract exam year from combined string if present.
  let year = String(examYear || "");
  const yMatch = parsed.examTypeYear.match(/(20\d{2})/);
  if (yMatch) year = yMatch[1];

  return {
    ok: true,
    source: "waec-direct",
    sourceLabel: "WAECdirect (scratch card)",
    candidateName: parsed.candidateName,
    examNumber: String(parsed.examNumber || examNumber),
    examYear: year,
    center: parsed.center,
    subjects: parsed.subjects,
    examTypeYear: parsed.examTypeYear,
  };
}

// ---------------------------------------------------------------------------
// NECO e-Verify portal check (uses a purchased token + payref from Kakaverify)
// ---------------------------------------------------------------------------

const NECO_BASE = "https://everify.neco.gov.ng/api_core";

export async function checkNecoPortal({ examNumber, examYear, examSubType = "SSCEINT", token, payref }) {
  if (!token || !payref) {
    return { ok: false, source: "neco-portal", reason: "missing-credentials", message: "NECO token and payref are required." };
  }
  let res;
  try {
    res = await fetch(`${NECO_BASE}/single`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      body: JSON.stringify({
        token: String(token).trim(),
        payref: String(payref).trim(),
        examno: String(examNumber || "").trim(),
        exam_year: String(examYear || "").trim(),
        exam_type: String(examSubType || "SSCEINT").trim(),
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    return { ok: false, source: "neco-portal", reason: "network", message: `Could not reach NECO e-Verify (${e.message}).` };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || (json && json.status && Number(json.status) >= 400)) {
    const msg = json?.error || json?.message || `NECO e-Verify responded with HTTP ${res.status}.`;
    const notFound = /not found|invalid/i.test(String(msg)) || res.status === 400;
    return { ok: false, source: "neco-portal", reason: notFound ? "not-found" : "bad-response", message: String(msg) };
  }

  const d = Array.isArray(json?.details) ? json.details[0] : json?.details ?? json?.data;
  if (!d) {
    return { ok: false, source: "neco-portal", reason: "bad-response", message: "Unexpected response from NECO e-Verify." };
  }

  const name =
    d.candidateName || d.candidate_name || d.name ||
    [d.surname, d.firstname, d.othername || d.othernames].filter(Boolean).join(" ").trim();

  const rawSubjects = d.subjects || d.results || d.grades || [];
  const subjects = (Array.isArray(rawSubjects) ? rawSubjects : [])
    .map((s) => ({ subject: String(s.subject || s.name || s.paper || ""), grade: String(s.grade ?? s.result ?? "") }))
    .filter((s) => s.subject);

  if (subjects.length === 0 && !name) {
    return { ok: false, source: "neco-portal", reason: "not-found", message: json?.message || "No NECO result found." };
  }

  return {
    ok: true,
    source: "neco-portal",
    sourceLabel: "NECO e-Verify (token)",
    candidateName: name || "",
    examNumber: String(d.examno || d.examNumber || d.exam_no || examNumber),
    examYear: String(d.exam_year || d.examYear || d.year || examYear),
    center: d.center || d.centre || "",
    subjects,
  };
}

// ---------------------------------------------------------------------------
// NABTEB — no public portal/API. Return explicit unavailable so the UI can
// tell the officer the official side of the comparison is missing.
// ---------------------------------------------------------------------------

export function checkNabtebPortal() {
  return {
    ok: false,
    source: "nabteb-portal",
    reason: "unavailable",
    message: "NABTEB has no public result API. The photo will be recorded and checked manually during human review.",
  };
}

export default {
  checkWaecDirect,
  checkNecoPortal,
  checkNabtebPortal,
};
