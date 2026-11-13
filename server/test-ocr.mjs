// OCR parser unit tests — run: node test-ocr.mjs
// Pure logic on sample OCR text, no server or network needed.
import parseOcrText from "./vision/parseOcr.js";

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

const SLIP = `THE WEST AFRICAN EXAMINATIONS COUNCIL
WASSCE (INTERNAL) 2024
CANDIDATE NAME: OKONKWO ADEBAYO JOHN
EXAM NUMBER: 4251212055
CENTRE: FEDERAL GOVERNMENT COLLEGE ENUGU

SUBJECT                GRADE
ENGLISH LANGUAGE       C6
GENERAL MATHEMATICS    A1
PHYSICS                B3
CHEMISTRY              C4
BIOLOGY                C5
ECONOMICS              D7`;

console.log("\n1. full slip parses every field");
{
  const r = parseOcrText(SLIP);
  check("ok", r.ok === true, JSON.stringify(r));
  check("name", r.candidateName === "OKONKWO ADEBAYO JOHN", r.candidateName);
  check("exam number", r.examNumber === "4251212055", r.examNumber);
  check("year", r.examYear === "2024", r.examYear);
  check("centre", r.center === "FEDERAL GOVERNMENT COLLEGE ENUGU", r.center);
  check("6 subjects", r.subjects.length === 6, String(r.subjects.length));
  check(
    "grades correct",
    r.subjects.find((s) => s.subject === "GENERAL MATHEMATICS")?.grade === "A1" &&
      r.subjects.find((s) => s.subject === "ENGLISH LANGUAGE")?.grade === "C6" &&
      r.subjects.find((s) => s.subject === "ECONOMICS")?.grade === "D7"
  );
  check("source tesseract", r.source === "tesseract");
}

console.log("\n2. grade on the following line (two-column slip)");
{
  const r = parseOcrText(`CANDIDATE NAME: ADAMU AKEEM JOHN
EXAM NO 4251212055
ENGLISH LANGUAGE
C6
MATHEMATICS
A1`);
  check("ok", r.ok === true, JSON.stringify(r));
  check("2 subjects", r.subjects.length === 2, String(r.subjects.length));
  check(
    "grades picked up",
    r.subjects.find((s) => s.subject === "ENGLISH LANGUAGE")?.grade === "C6" &&
      r.subjects.find((s) => s.subject === "MATHEMATICS")?.grade === "A1",
    JSON.stringify(r.subjects)
  );
}

console.log("\n3. header words are not mistaken for a name");
{
  const r = parseOcrText(`NAME                GRADE
ENGLISH LANGUAGE    C6
NAME OF CENTRE: MAIN HALL`);
  check("no name invented", !r.candidateName, r.candidateName);
  check("subject still found", r.subjects.length === 1, String(r.subjects.length));
}

console.log("\n4. OCR zero-for-O mangling in the exam number");
{
  const r = parseOcrText(`EXAM NUMBER: 4251212O55
ENGLISH LANGUAGE C6`);
  check("zero restored", r.examNumber === "4251212055", r.examNumber);
}

console.log("\n5. labeled year beats a bare year");
{
  const r = parseOcrText(`EXAM YEAR: 2023
SESSION 2023/2024
ENGLISH LANGUAGE C6`);
  check("labeled year", r.examYear === "2023", r.examYear);
}

console.log("\n6. exam-number line cannot leak a year");
{
  const r = parseOcrText(`EXAM NUMBER: 4251212055
ENGLISH LANGUAGE C6`);
  check("no bogus year", r.examYear === "", r.examYear);
}

console.log("\n7. surname + firstname lines compose a name");
{
  const r = parseOcrText(`SURNAME: OKONKWO
FIRST NAME: ADEBAYO
OTHER NAME: JOHN
EXAM NUMBER: 4251212055
ENGLISH LANGUAGE C6`);
  check("composed name", r.candidateName === "OKONKWO ADEBAYO JOHN", r.candidateName);
}

console.log("\n8. NECO-style alphanumeric number keeps its letters");
{
  const r = parseOcrText(`CANDIDATE NUMBER: 50123456AB
ENGLISH LANGUAGE C6`);
  check("letters kept", r.examNumber === "50123456AB", r.examNumber);
}

console.log("\n9. garbage text is reported unreadable");
{
  const r = parseOcrText("lorem ipsum dolor sit amet\nnothing to see here\n12345");
  check("unreadable", r.ok === false && r.reason === "unreadable", JSON.stringify(r));
  check("has message", typeof r.message === "string" && r.message.length > 0);
}

console.log("\n10. empty input is unreadable, never throws");
{
  const r = parseOcrText("");
  check("unreadable", r.ok === false && r.reason === "unreadable", JSON.stringify(r));
}

console.log("\n11. subjects are deduped when a slip repeats a row");
{
  const r = parseOcrText(`ENGLISH LANGUAGE C6
ENGLISH LANGUAGE C6
MATHEMATICS A1`);
  check("2 unique subjects", r.subjects.length === 2, JSON.stringify(r.subjects));
}

console.log("\n12. OCR-mangled grades recover only to real grades");
{
  // "C6" read as "ce", "A1" read as "Al" — both recoverable.
  const r = parseOcrText(`ENGLISH LANGUAGE ce
GENERAL MATHEMATICS Al
PHYSICS B3
CHEMISTRY c4`);
  check("4 subjects", r.subjects.length === 4, JSON.stringify(r.subjects));
  check(
    "mangled grades recovered",
    r.subjects.find((s) => s.subject === "ENGLISH LANGUAGE")?.grade === "C6" &&
      r.subjects.find((s) => s.subject === "GENERAL MATHEMATICS")?.grade === "A1" &&
      r.subjects.find((s) => s.subject === "CHEMISTRY")?.grade === "C4",
    JSON.stringify(r.subjects)
  );

  // Garbage that would become a fake grade must NOT be accepted — a wrong
  // grade here would escalate an innocent candidate.
  const bad = parseOcrText(`ENGLISH LANGUAGE xy
PHYSICS Z9
CHEMISTRY Q7`);
  check("garbage grades never invented", (bad.subjects || []).length === 0, JSON.stringify(bad.subjects));
  check("unreadable when nothing else found", bad.ok === false && bad.reason === "unreadable", JSON.stringify(bad));
}

console.log("\n13. JPEG-compression OCR confusions (5->s, C->euro) recover");
{
  // After the client's JPEG re-encode, Tesseract reads "C5" as "cs" and
  // "€5". Both must recover to C5 — but only because C5 is a real grade.
  const r = parseOcrText(`ENGLISH LANGUAGE cs
ECONOMICS €5
PHYSICS B3`);
  check("3 subjects", r.subjects.length === 3, JSON.stringify(r.subjects));
  check(
    "cs and euro-5 both recover to C5",
    r.subjects.find((s) => s.subject === "ENGLISH LANGUAGE")?.grade === "C5" &&
      r.subjects.find((s) => s.subject === "ECONOMICS")?.grade === "C5" &&
      r.subjects.find((s) => s.subject === "PHYSICS")?.grade === "B3",
    JSON.stringify(r.subjects)
  );

  // The S->5 fix must not invent grades: A5/B5/D5/E5/F5 are not real.
  const notReal = parseOcrText(`PHYSICS as
CHEMISTRY bs
BIOLOGY ds`);
  check("S-fix only yields real grades", (notReal.subjects || []).length === 0, JSON.stringify(notReal.subjects));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
