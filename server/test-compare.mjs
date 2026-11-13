// Comparison engine unit tests — run: node test-compare.mjs
// Pure logic, no server or network needed.
import { runComparison, summarizeComparison } from "./compare.js";

let pass = 0;
let fail = 0;

function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const OFFICIAL = {
  ok: true,
  source: "fixture",
  candidateName: "JOHN AKEEM ADAMU",
  examNumber: "4251212055",
  examYear: "2024",
  center: "TEST CENTRE",
  subjects: [
    { subject: "GENERAL MATHEMATICS", grade: "A1" },
    { subject: "ENGLISH LANGUAGE", grade: "C6" },
    { subject: "PHYSICS", grade: "B3" },
  ],
};

const PHOTO = {
  ok: true,
  source: "gemini",
  candidateName: "AKEEM ADAMU JOHN",
  examNumber: "4251212055",
  examYear: "2024",
  center: "",
  subjects: [
    { subject: "MATHEMATICS", grade: "A1" },
    { subject: "ENGLISH", grade: "C6" },
    { subject: "PHYSICS", grade: "B3" },
  ],
};

console.log("\n1. full agreement -> match");
{
  const c = runComparison({ official: OFFICIAL, extracted: PHOTO });
  check("verdict match", c.verdict === "match", `got ${c.verdict}`);
  check("3 subjects matched", c.counts.matched === 3 && c.counts.differed === 0 && c.counts.missing === 0, JSON.stringify(c.counts));
  check("identity all match", c.identity.every((r) => r.status === "match"), JSON.stringify(c.identity.map((r) => r.status)));
  check("closing info finding", c.findings.some((f) => f.severity === "info"));
  check("no error findings", !c.findings.some((f) => f.severity === "error"));
}

console.log("\n2. subject aliases and grade formats normalize");
{
  const official = { ...OFFICIAL, subjects: [{ subject: "GENERAL MATHEMATICS", grade: "A 1" }, { subject: "CHR. REL. STUDIES", grade: "C6" }] };
  const photo = { ...PHOTO, subjects: [{ subject: "MATHEMATICS", grade: "A1" }, { subject: "CRS", grade: "c6" }] };
  const c = runComparison({ official, extracted: photo });
  check("aliases + grades match", c.verdict === "match" && c.counts.matched === 2, `${c.verdict} ${JSON.stringify(c.counts)}`);
}

console.log("\n3. name order is irrelevant, a different name is a mismatch");
{
  const c = runComparison({ official: OFFICIAL, extracted: { ...PHOTO, candidateName: "MUSA IBRAHIM" } });
  check("verdict mismatch", c.verdict === "mismatch", `got ${c.verdict}`);
  check("name differ flagged", c.identity.find((r) => r.field === "Candidate name")?.status === "differ");
  check("error finding mentions name", c.findings.some((f) => f.severity === "error" && /Candidate name differs/.test(f.message)));
  check("top finding is escalation", /escalated/i.test(c.findings[0].message));
}

console.log("\n3b. a single misread letter in a long name token still agrees");
{
  // Vision/OCR letter confusion on a long token ("ABDULLAHI" -> "ABDALLAHI")
  // must not escalate an otherwise identical candidate.
  const official = { ...OFFICIAL, candidateName: "HALIMA YUSUF ABDULLAHI" };
  const c = runComparison({ official, extracted: { ...PHOTO, candidateName: "HALIMA YUSUF ABDALLAHI" } });
  check("verdict not mismatch", c.verdict !== "mismatch", `got ${c.verdict}`);
  check("name row matches", c.identity.find((r) => r.field === "Candidate name")?.status === "match");

  // But a genuinely different person still escalates.
  const different = runComparison({ official, extracted: { ...PHOTO, candidateName: "MUSA IBRAHIM" } });
  check("different name still mismatches", different.verdict === "mismatch", `got ${different.verdict}`);

  // Two-letter change in a long token is not tolerated.
  const twoOff = runComparison({ official, extracted: { ...PHOTO, candidateName: "HALIMA YUSUF ABDULLOHE" } });
  check("two-letter change still differs", twoOff.identity.find((r) => r.field === "Candidate name")?.status === "differ");

  // Short tokens must match exactly (a 1-letter change is a different name).
  const shortOff = runComparison({ official: OFFICIAL, extracted: { ...PHOTO, candidateName: "AKEEM ADAMU JOHNN" } });
  check("short token change still differs", shortOff.identity.find((r) => r.field === "Candidate name")?.status === "differ");
}

console.log("\n4. a differing grade escalates");
{
  const photo = { ...PHOTO, subjects: PHOTO.subjects.map((s) => (s.subject === "PHYSICS" ? { ...s, grade: "F9" } : s)) };
  const c = runComparison({ official: OFFICIAL, extracted: photo });
  check("verdict mismatch", c.verdict === "mismatch", `got ${c.verdict}`);
  check("1 differed", c.counts.differed === 1, JSON.stringify(c.counts));
  check("grade error message", c.findings.some((f) => /Grade differs for "PHYSICS"/.test(f.message)));
}

console.log("\n5. subject hidden on the photo -> incomplete");
{
  const photo = { ...PHOTO, subjects: PHOTO.subjects.slice(0, 2) };
  const c = runComparison({ official: OFFICIAL, extracted: photo });
  check("verdict incomplete", c.verdict === "incomplete", `got ${c.verdict}`);
  check("1 missing", c.counts.missing === 1 && c.counts.matched === 2, JSON.stringify(c.counts));
  check("missing warning", c.findings.some((f) => f.severity === "warning" && /not visible in the photo/.test(f.message)));
}

console.log("\n6. subject not in the official record -> mismatch");
{
  const photo = { ...PHOTO, subjects: [...PHOTO.subjects, { subject: "FURTHER MATHEMATICS", grade: "B3" }] };
  const c = runComparison({ official: OFFICIAL, extracted: photo });
  check("verdict mismatch", c.verdict === "mismatch", `got ${c.verdict}`);
  check("unexpected-subject error", c.findings.some((f) => /appears on the photo but not in the official record/.test(f.message)));
}

console.log("\n7. exam number differs -> mismatch");
{
  const c = runComparison({ official: OFFICIAL, extracted: { ...PHOTO, examNumber: "9999999999" } });
  check("verdict mismatch", c.verdict === "mismatch", `got ${c.verdict}`);
  check("exam number row differs", c.identity.find((r) => r.field === "Exam number")?.status === "differ");
}

console.log("\n8. official record unavailable");
{
  const c = runComparison({
    official: { ok: false, source: "nabteb-official", reason: "unavailable", message: "NABTEB has no public result API." },
    extracted: PHOTO,
  });
  check("verdict unavailable", c.verdict === "unavailable", `got ${c.verdict}`);
  check("warning finding", c.findings.some((f) => f.severity === "warning" && /Official record unavailable/.test(f.message)));
  check("no subject rows", c.subjects.length === 0);
}

console.log("\n9. photo unreadable -> incomplete, official rows still shown");
{
  const c = runComparison({
    official: OFFICIAL,
    extracted: { ok: false, source: "vision", reason: "unreadable", message: "The photo could not be read as a result slip." },
  });
  check("verdict incomplete", c.verdict === "incomplete", `got ${c.verdict}`);
  check("3 official rows kept", c.subjects.length === 3 && c.subjects.every((r) => r.status === "unknown"));
  check("photo warning", c.findings.some((f) => /Uploaded photo could not be compared/.test(f.message)));
}

console.log("\n10. summary strings");
{
  const m = runComparison({ official: OFFICIAL, extracted: PHOTO });
  check("match summary", summarizeComparison(m) === "3 subjects · 3 matched", summarizeComparison(m));
  const u = runComparison({ official: { ok: false, message: "x" }, extracted: PHOTO });
  check("unavailable summary", summarizeComparison(u) === "Official source unavailable", summarizeComparison(u));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
