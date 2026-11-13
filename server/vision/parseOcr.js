// OCR text -> structured extraction.
//
// Heuristic parser behind the Tesseract path: finds the candidate's name,
// exam number, year, centre and every subject/grade row in raw OCR output.
// Returns the same normalized shape as the Gemini reader so the comparison
// engine never has to care which engine produced it.
//
//   ok: true   -> { candidateName, examNumber, examYear, center,
//                   subjects: [{subject, grade}] }
//   ok: false  -> { reason, message }   // unreadable
//
// export default parseOcrText(text) -> normalized extraction (or failure).

// Longest first so "GENERAL MATHEMATICS" wins over "MATHEMATICS".
const SUBJECTS = [
  "LITERATURE IN ENGLISH",
  "CHRISTIAN RELIGIOUS STUDIES",
  "ISLAMIC RELIGIOUS STUDIES",
  "PHYSICAL AND HEALTH EDUCATION",
  "AGRICULTURAL SCIENCE",
  "GENERAL MATHEMATICS",
  "FURTHER MATHEMATICS",
  "FINANCIAL ACCOUNTING",
  "ELECTRICAL INSTALLATION",
  "BUILDING TECHNOLOGY",
  "HEALTH EDUCATION",
  "COMPUTER STUDY",
  "COMPUTER SCIENCE",
  "CIVIC EDUCATION",
  "BUSINESS STUDIES",
  "TECHNICAL DRAWING",
  "DATA PROCESSING",
  "ENGLISH LANGUAGE",
  "RELIGIOUS KNOWLEDGE",
  "HOME MANAGEMENT",
  "FOOD AND NUTRITION",
  "CLOTHING AND TEXTILE",
  "BOOK-KEEPING",
  "PHE",
  "CHEMISTRY",
  "PHYSICS",
  "BIOLOGY",
  "MATHEMATICS",
  "ECONOMICS",
  "GOVERNMENT",
  "HISTORY",
  "GEOGRAPHY",
  "COMMERCE",
  "AGRIC SCIENCE",
  "YORUBA",
  "IGBO",
  "HAUSA",
  "FRENCH",
  "MUSIC",
  "PAINTING AND DECORATION",
  "SHORTHAND",
  "TYPING",
];

// Sort copy by length desc so longer names match first.
const SUBJECTS_BY_LENGTH = [...SUBJECTS].sort((a, b) => b.length - a.length);

// Grades the three boards actually issue. Every recovered grade must land
// in this set — that guarantee is what stops an OCR guess from becoming a
// false "grade differs" escalation.
const VALID_GRADES = new Set(["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"]);

// OCR confusion for the digit position: 1 read as l/I, 6 read as e/G,
// 5 read as S. (Applied only when the result is a real grade.)
const DIGIT_FIX = { L: "1", I: "1", "|": "1", E: "6", G: "6", S: "5" };

// Accept a grade token only when it is (or, after a single confident OCR
// fix, becomes) a real grade. Anything else returns "" -> row skipped.
function asGrade(token) {
  // "€5" is a common JPEG-compression misread of "C5".
  const t = String(token || "")
    .toUpperCase()
    .replace(/€/g, "C")
    .replace(/[^A-Z0-9|]/g, "");
  if (VALID_GRADES.has(t)) return t;
  if (t.length === 2 && DIGIT_FIX[t[1]]) {
    const fixed = t[0] + DIGIT_FIX[t[1]];
    if (VALID_GRADES.has(fixed)) return fixed;
  }
  return "";
}

// Digit clearly a digit: "C6", "c4", "A 1".
const GRADE_STRICT = /(?:^|[^A-Za-z0-9])([A-Fa-f]\s?[1-9])(?=[^A-Za-z0-9]|$)/;
// The "digit" (or the letter) may be a character OCR confused:
// "Al", "ce", "CG", "cs" (=C5), "€5" (=C5).
const GRADE_LOOSE = /(?:^|[^A-Za-z0-9])([A-Fa-f€]\s?[1-9lLI|eEgGsS])(?=[^A-Za-z0-9]|$)/;

const cleanLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Labeled fields, tolerant of OCR noise (NO / NO. / NUM / # / zero-for-O).
const EXAM_NO_RE =
  /\b(?:EXAM(?:INATION)?|CANDIDATE|REG(?:ISTRATION)?|INDEX|SERIAL)\s*(?:NUMBER|NO\.?|NUM\.?|#)?\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-/]{3,20})\b/i;
const NAME_RE =
  /\b(?:CANDIDATE\s*NAME|FULL\s*NAME|CANDIDATE|NAME)\s*[:#.\-]?\s*((?:[A-Z][A-Z'\-]*\s+){1,4}[A-Z][A-Z'\-]*)\b/i;
const SURNAME_RE = /\bSURNAME\s*[:#.\-]?\s*([A-Z][A-Z'\-]+(?:\s+[A-Z'\-]+){0,4})\b/i;
const FIRSTNAME_RE = /\b(?:FIRST\s*NAME|GIVEN\s*NAME)\s*[:#.\-]?\s*([A-Z][A-Z'\-]+(?:\s+[A-Z'\-]+){0,4})\b/i;
const OTHERNAME_RE = /\b(?:OTHER\s*NAME|MIDDLE\s*NAME)\s*[:#.\-]?\s*([A-Z][A-Z'\-]+(?:\s+[A-Z'\-]+){0,4})\b/i;
const YEAR_LABELED_RE = /\b(?:EXAM(?:INATION)?\s*)?(?:YEAR|SESSION)\b[^0-9]{0,12}((?:19|20)\d{2})\b/i;
const YEAR_ANY_RE = /\b((?:19|20)\d{2})\b/;
const CENTRE_RE =
  /\b(?:CENTRE|CENTER)\s*(?:NO\.?|NUMBER|CODE)?\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9'&,.\- ]{2,60})\b/i;

// The centre regex must not swallow "CENTRE NUMBER: 1234" style labels.
const BAD_CENTRE_START = /^(OF|NO|NUMBER|CODE|FOR|NAME)\b/i;

function findSubject(line) {
  for (const subject of SUBJECTS_BY_LENGTH) {
    const idx = line.indexOf(subject);
    if (idx !== -1) return { subject, idx };
  }
  return null;
}

// Grade appearing after the subject on the same line (preferred), else
// anywhere on the line as a fallback. Both passes go through asGrade so an
// OCR guess can only ever become a real grade, never a made-up one.
function findGrade(line, afterIdx = 0) {
  const tail = line.slice(afterIdx);
  const inTail = GRADE_LOOSE.exec(tail) || GRADE_STRICT.exec(tail);
  if (inTail) {
    const g = asGrade(inTail[1]);
    if (g) return g;
  }
  const anywhere = GRADE_STRICT.exec(line);
  if (anywhere) {
    const g = asGrade(anywhere[1]);
    if (g) return g;
  }
  return "";
}

export default function parseOcrText(rawText) {
  const text = String(rawText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "");

  // Keep non-empty lines, upper-cased for matching (original kept for labels).
  const lines = text
    .split("\n")
    .map(cleanLine)
    .filter((l) => l.length > 0);

  const upper = lines.map((l) => l.toUpperCase());

  // --- candidate name --------------------------------------------------
  let candidateName = "";
  let surname = "";
  let firstname = "";
  let othername = "";

  for (const line of lines) {
    if (!candidateName) {
      const m = NAME_RE.exec(line);
      // Reject header words ("NAME GRADE") and "NAME OF CENTRE" style false positives.
      if (m && !/^(OF|THE|SCHOOL|CENTRE|CENTER|GRADE|SUBJECT|TOTAL|RESULT|NUMBER|NO|DATE)\b/i.test(m[1])) {
        candidateName = cleanLine(m[1]);
      }
    }
    if (!surname) {
      const m = SURNAME_RE.exec(line);
      if (m) surname = cleanLine(m[1]);
    }
    if (!firstname) {
      const m = FIRSTNAME_RE.exec(line);
      if (m) firstname = cleanLine(m[1]);
    }
    if (!othername) {
      const m = OTHERNAME_RE.exec(line);
      if (m) othername = cleanLine(m[1]);
    }
  }

  if (!candidateName && (surname || firstname)) {
    candidateName = [surname, firstname, othername].filter(Boolean).join(" ").trim();
  }

  // --- exam number ------------------------------------------------------
  let examNumber = "";
  for (const line of lines) {
    const m = EXAM_NO_RE.exec(line);
    if (m) {
      const raw = m[1].toUpperCase();
      // OCR often turns a zero into the letter O — fix only when it yields
      // a mostly-numeric token (NECO numbers may end in letters).
      const fixed = raw.replace(/O/g, "0");
      const value = /^\d+$/.test(fixed) && /\d{4,}/.test(fixed) ? fixed : raw;
      // A pure letter token is not an exam number (e.g. "EXAM NO. CANDIDATE").
      if (/[0-9]/.test(value)) {
        examNumber = value;
        break;
      }
    }
  }

  // Fallback: a standalone 8-14 digit token (WAEC/NECO numbers are numeric).
  if (!examNumber) {
    for (const line of upper) {
      const m = /\b(\d{8,14})\b/.exec(line);
      if (m) {
        examNumber = m[1];
        break;
      }
    }
  }

  // --- exam year --------------------------------------------------------
  let examYear = "";
  for (const line of lines) {
    const m = YEAR_LABELED_RE.exec(line);
    if (m) {
      examYear = m[1];
      break;
    }
  }
  if (!examYear) {
    for (const line of lines) {
      // Only accept a bare year on a line that is not dominated by digits
      // (so a 10-digit exam number line cannot leak its tail as a year).
      const m = YEAR_ANY_RE.exec(line);
      if (m && !/\d{6,}/.test(line.replace(m[1], ""))) {
        examYear = m[1];
        break;
      }
    }
  }

  // --- centre -----------------------------------------------------------
  let center = "";
  for (const line of lines) {
    const m = CENTRE_RE.exec(line);
    if (m && !BAD_CENTRE_START.test(m[1])) {
      center = cleanLine(m[1]).replace(/[:.\-]+$/, "").trim();
      break;
    }
  }

  // --- subjects + grades ------------------------------------------------
  const subjects = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = upper[i];
    const hit = findSubject(line);
    if (!hit) continue;

    const key = hit.subject;
    if (seen.has(key)) continue;

    let grade = findGrade(line, hit.idx + hit.subject.length);
    if (!grade) {
      // Two-column slips often put the grade on the next line.
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const next = upper[j];
        if (next.length > 14) break; // a real line, not a stray grade
        if (findSubject(next)) break; // another subject row
        const g = GRADE_LOOSE.exec(next) || GRADE_STRICT.exec(next);
        if (g) {
          const fixed = asGrade(g[1]);
          if (fixed) {
            grade = fixed;
            break;
          }
        }
      }
    }

    if (grade) {
      seen.add(key);
      subjects.push({ subject: hit.subject, grade });
    }
  }

  if (subjects.length === 0 && !candidateName && !examNumber) {
    return {
      ok: false,
      source: "tesseract",
      reason: "unreadable",
      message: "The photo could not be read as a result slip. Upload a clearer, well-lit photo.",
    };
  }

  return {
    ok: true,
    source: "tesseract",
    sourceLabel: "Tesseract OCR (local)",
    candidateName,
    examNumber,
    examYear,
    center,
    subjects,
  };
}
