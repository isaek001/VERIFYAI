// Demo fixture provider.
//
// Used when no real provider is configured (RESULT_PROVIDER=auto) or when
// RESULT_PROVIDER=fixture. Produces a deterministic "official" result from
// the exam number, so the same number always returns the same record —
// clearly labelled as a fixture everywhere it surfaces in the UI.

const NAMES = [
  "OKONKWO ADEBAYO JOHN",
  "AISHA MOHAMMED BALA",
  "EMEKA OBINNA NWOSU",
  "FUNMILAYO ADEOLA BAKARE",
  "HALIMA YUSUF ABDULLAHI",
  "CHINEDU PETER EZE",
  "GRACE TEMITOPE ADEYEMI",
  "MUSA IBRAHIM DANJUMA",
];

const SUBJECTS = {
  waec: [
    "ENGLISH LANGUAGE",
    "GENERAL MATHEMATICS",
    "PHYSICS",
    "CHEMISTRY",
    "BIOLOGY",
    "ECONOMICS",
    "GOVERNMENT",
    "CHRISTIAN RELIGIOUS STUDIES",
  ],
  neco: [
    "ENGLISH LANGUAGE",
    "GENERAL MATHEMATICS",
    "PHYSICS",
    "CHEMISTRY",
    "BIOLOGY",
    "ECONOMICS",
    "CIVIC EDUCATION",
    "LITERATURE IN ENGLISH",
  ],
  nabteb: [
    "ENGLISH LANGUAGE",
    "MATHEMATICS",
    "PHYSICS",
    "CHEMISTRY",
    "TECHNICAL DRAWING",
    "ELECTRONICS",
    "WORKSHOP SCIENCE",
    "BUSINESS MANAGEMENT",
  ],
};

const GRADES = ["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8"];

// Deterministic 32-bit string hash (FNV-1a) so the same exam number always
// yields the same fixture candidate.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export default function fetchFixture({ examType, examNumber, examYear }) {
  const board = String(examType || "waec").toLowerCase();
  const h = hash(`${board}:${examNumber}`);
  const subjects = (SUBJECTS[board] || SUBJECTS.waec).map((subject, i) => ({
    subject,
    grade: GRADES[(h >>> (i % 8)) % GRADES.length] || "C6",
  }));

  return {
    ok: true,
    source: "fixture",
    sourceLabel: "Demo fixture — no live provider configured",
    demo: true,
    candidateName: NAMES[h % NAMES.length],
    examNumber: String(examNumber || ""),
    examYear: String(examYear || ""),
    center: `DEMO EXAMINATION CENTRE ${String.fromCharCode(65 + (h % 26))}${(h % 90) + 10}`,
    subjects,
  };
}
