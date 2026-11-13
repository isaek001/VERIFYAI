// Comparison engine.
//
// Takes the official record (provider), the photo extraction (vision) and
// the officer's request details, and produces a field-by-field comparison
// plus findings in the app's existing { severity, message } shape so the
// findings list, record modal and archive badges keep working unchanged.
//
// Verdicts:
//   match       -> every compared field agrees            (status: Pending review)
//   mismatch    -> at least one field disagrees           (status: Escalated)
//   incomplete  -> parts could not be read or compared    (status: Pending review)
//   unavailable -> official record could not be fetched   (status: Pending review)

// Upper-case, strip punctuation/extra spacing: "CHR. Rel. Studies" -> "CHR REL STUDIES".
const clean = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

// Grades: ignore spaces/punctuation so "A 1" === "A1".
const normGrade = (g) => String(g ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Subject aliases so slips that print a variant still line up.
const SUBJECT_ALIASES = {
  "GENERAL MATHEMATICS": "MATHEMATICS",
  "ENGLISH LANGUAGE": "ENGLISH",
  "LITERATURE IN ENGLISH": "LITERATURE",
  "ENGLISH LITERATURE": "LITERATURE",
  "CHRISTIAN RELIGIOUS STUDIES": "CHRISTIAN RELIGIOUS STUDIES",
  "CHR REL STUDIES": "CHRISTIAN RELIGIOUS STUDIES",
  "CHRISTIAN REL STUDIES": "CHRISTIAN RELIGIOUS STUDIES",
  "CRS": "CHRISTIAN RELIGIOUS STUDIES",
  "ISLAMIC RELIGIOUS STUDIES": "ISLAMIC RELIGIOUS STUDIES",
  "ISR REL STUDIES": "ISLAMIC RELIGIOUS STUDIES",
  "ISLAMIC REL STUDIES": "ISLAMIC RELIGIOUS STUDIES",
  "IRS": "ISLAMIC RELIGIOUS STUDIES",
  "AGRICULTURAL SCIENCE": "AGRICULTURAL SCIENCE",
  "AGRIC SCIENCE": "AGRICULTURAL SCIENCE",
  "AGRICULTURE": "AGRICULTURAL SCIENCE",
  "COMPUTER STUDY": "COMPUTER SCIENCE",
  "COMPUTER STUDIES": "COMPUTER SCIENCE",
  "ECONOMICS ": "ECONOMICS",
};

function subjectKey(s) {
  const c = clean(s);
  return SUBJECT_ALIASES[c] || c;
}

function nameTokens(n) {
  return clean(n).split(" ").filter(Boolean);
}

// Levenshtein distance, capped (we only care about small distances).
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// One name token agrees with another: exact match, or a single misread
// letter in a long token ("ABDULLAHI" vs "ABDALLAHI" — OCR/vision letter
// confusion, not a different person). Short tokens must match exactly.
function tokensAgree(x, y) {
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 6) return false;
  return editDistance(x, y) <= 1;
}

// Order-insensitive name agreement: "JOHN AKEEM ADAMU" === "ADAMU AKEEM JOHN".
// Returns null when either side is missing (caller treats it as "unknown").
function namesAgree(a, b) {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (!A.length || !B.length) return null;
  const shared = A.filter((t) => B.some((u) => tokensAgree(t, u))).length;
  return shared >= Math.min(A.length, B.length);
}

function displayName(list, key) {
  const row = list.find((r) => subjectKey(r.subject) === key);
  return row ? row.subject : key;
}

// --- main ---------------------------------------------------------------
export function runComparison({ official, extracted, request = {} } = {}) {
  const findings = [];
  const identity = [];
  const subjects = [];

  const noCounts = { matched: 0, differed: 0, missing: 0 };

  // 1. No official record -> nothing to compare against.
  if (!official || !official.ok) {
    findings.push({
      severity: "warning",
      message: `Official record unavailable — ${official?.message || "the result could not be fetched."}`,
    });
    if (extracted && extracted.ok) {
      findings.push({
        severity: "warning",
        message: "The uploaded photo was read, but there is no official record to compare it with. Check the original document manually.",
      });
    } else {
      findings.push({
        severity: "warning",
        message: `Uploaded photo not compared — ${extracted?.message || "no extraction was returned."}`,
      });
    }
    return { verdict: "unavailable", identity, subjects, counts: noCounts, findings };
  }

  // 2. Official ok but the photo could not be read.
  if (!extracted || !extracted.ok) {
    findings.push({
      severity: "warning",
      message: `Uploaded photo could not be compared — ${extracted?.message || "no extraction was returned."}`,
    });
    findings.push({
      severity: "warning",
      message: "Only the official record was captured. Compare the original document manually during review.",
    });
    identity.push(
      { field: "Exam number", official: official.examNumber || "", photo: "", status: "unknown" },
      { field: "Candidate name", official: official.candidateName || "", photo: "", status: "unknown" },
      { field: "Exam year", official: official.examYear || "", photo: "", status: "unknown" }
    );
    for (const s of official.subjects || []) {
      subjects.push({ subject: s.subject, officialGrade: s.grade, photoGrade: "", status: "unknown" });
    }
    return { verdict: "incomplete", identity, subjects, counts: noCounts, findings };
  }

  // 3. Candidate details: official vs photo.
  const identityFields = [
    { label: "Exam number", official: official.examNumber || "", photo: extracted.examNumber || "" },
    { label: "Candidate name", official: official.candidateName || "", photo: extracted.candidateName || "" },
    { label: "Exam year", official: official.examYear || "", photo: extracted.examYear || "" },
  ];

  let identityDiffered = 0;
  let identityMissing = 0;

  for (const f of identityFields) {
    let status;
    if (!f.photo && !f.official) {
      status = "unknown";
    } else if (!f.photo || !f.official) {
      status = "missing";
    } else if (f.label === "Candidate name") {
      status = namesAgree(f.official, f.photo) ? "match" : "differ";
    } else {
      status = clean(f.official) === clean(f.photo) ? "match" : "differ";
    }
    identity.push({ field: f.label, official: f.official, photo: f.photo, status });

    if (status === "differ") {
      identityDiffered += 1;
      findings.push({
        severity: "error",
        message: `${f.label} differs — official record shows "${f.official}" but the photo shows "${f.photo}".`,
      });
    } else if (status === "missing") {
      identityMissing += 1;
      findings.push({
        severity: "warning",
        message: `${f.label} could not be read from the photo (official record: "${f.official}").`,
      });
    }
  }

  // 4. Subjects, matched by normalized key on both sides.
  const officialByKey = new Map();
  for (const s of official.subjects || []) {
    const key = subjectKey(s.subject);
    if (key && !officialByKey.has(key)) officialByKey.set(key, s);
  }
  const photoByKey = new Map();
  for (const s of extracted.subjects || []) {
    const key = subjectKey(s.subject);
    if (key && !photoByKey.has(key)) photoByKey.set(key, s);
  }

  const counts = { matched: 0, differed: 0, missing: 0 };

  for (const [key, s] of officialByKey) {
    const p = photoByKey.get(key);
    if (!p) {
      counts.missing += 1;
      subjects.push({ subject: s.subject, officialGrade: s.grade, photoGrade: "", status: "missing-photo" });
      findings.push({
        severity: "warning",
        message: `"${s.subject}" is on the official record but was not visible in the photo.`,
      });
      continue;
    }
    const agree = normGrade(s.grade) === normGrade(p.grade);
    subjects.push({
      subject: displayName(official.subjects, key),
      officialGrade: s.grade,
      photoGrade: p.grade,
      status: agree ? "match" : "differ",
    });
    if (agree) {
      counts.matched += 1;
    } else {
      counts.differed += 1;
      findings.push({
        severity: "error",
        message: `Grade differs for "${s.subject}" — official record shows ${s.grade || "?"} but the photo shows ${p.grade || "?"}.`,
      });
    }
  }

  // Subjects printed on the photo that the official record does not contain.
  for (const [key, p] of photoByKey) {
    if (officialByKey.has(key)) continue;
    counts.differed += 1;
    subjects.push({ subject: p.subject, officialGrade: "", photoGrade: p.grade, status: "missing-official" });
    findings.push({
      severity: "error",
      message: `"${p.subject}" appears on the photo but not in the official record.`,
    });
  }

  // 5. Verdict.
  let verdict;
  if (counts.differed > 0 || identityDiffered > 0) {
    verdict = "mismatch";
    findings.unshift({
      severity: "error",
      message: "The uploaded photo does not match the official record. This verification has been escalated.",
    });
  } else if (counts.missing > 0 || identityMissing > 0 || counts.matched === 0) {
    verdict = "incomplete";
    if (counts.matched === 0) {
      findings.push({ severity: "warning", message: "No subject grades could be compared between the two sources." });
    }
    findings.push({
      severity: "info",
      message: `${counts.matched} of ${(official.subjects || []).length} subject grades agreed; the remaining fields need manual confirmation.`,
    });
  } else {
    verdict = "match";
    findings.push({
      severity: "info",
      message: `All ${counts.matched} subject grades and the candidate details agree between the official record and the uploaded photo.`,
    });
  }

  return { verdict, identity, subjects, counts, findings };
}

// Short human summary used as the record's "result" cell.
export function summarizeComparison(comparison) {
  if (!comparison) return "Comparison not available";
  const { verdict, counts } = comparison;
  const total = counts.matched + counts.differed + counts.missing;
  if (verdict === "unavailable") return "Official source unavailable";
  if (total === 0) return "No subjects compared";
  const parts = [`${total} subject${total === 1 ? "" : "s"}`];
  if (counts.matched) parts.push(`${counts.matched} matched`);
  if (counts.differed) parts.push(`${counts.differed} differ${counts.differed === 1 ? "s" : ""}`);
  if (counts.missing) parts.push(`${counts.missing} unclear`);
  return parts.join(" · ");
}
