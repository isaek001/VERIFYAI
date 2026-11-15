// Exam-verification API test — run: node test-verify.mjs
// Needs a running server; point TEST_BASE at it (default :4000).
const BASE = process.env.TEST_BASE || "http://localhost:4000";
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

async function call(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

// 1x1 transparent PNG — enough for the image path (validation only cares
// that it decodes as PNG/JPG/WEBP base64).
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const login = async () => {
  const r = await call("/api/auth/login", {
    method: "POST",
    body: { email: "officer@fcahpt.gov.ng", password: "Passw0rd!" },
  });
  return r.data?.token;
};

const VALID = {
  examType: "waec",
  examNumber: "4251212055",
  examYear: "2024",
  examSubType: "SSCEINT",
  image: TINY_PNG,
};

console.log("\n1. auth guard");
{
  const r = await call("/api/verify", { method: "POST", body: VALID });
  check("401 without token", r.status === 401, String(r.status));
}

const token = await login();
check("login works", Boolean(token));
if (!token) {
  console.log("\nCannot continue without a session.");
  process.exit(1);
}

console.log("\n2. validation");
{
  const cases = [
    ["missing board", { ...VALID, examType: "" }, "board"],
    ["unknown board", { ...VALID, examType: "jamb" }, "board"],
    ["short number", { ...VALID, examNumber: "12" }, "number"],
    ["bad year", { ...VALID, examYear: "24" }, "year"],
    ["missing image", { ...VALID, image: "" }, "image"],
    ["non-image payload", { ...VALID, image: "data:text/plain;base64,aGk=" }, "image"],
  ];
  for (const [label, body, kind] of cases) {
    const r = await call("/api/verify", { method: "POST", token, body });
    check(`${label} -> 400`, r.status === 400, String(r.status));
    check(`${label} -> message`, Boolean(r.data?.error), JSON.stringify(r.data));
    if (kind === "year") check(`${label} mentions year`, /year/i.test(r.data?.error || ""));
    if (kind === "image") check(`${label} mentions photo/image`, /photo|image/i.test(r.data?.error || ""));
  }
}

console.log("\n3. happy path (WAEC) returns a full comparison");
{
  const r = await call("/api/verify", { method: "POST", token, body: VALID });
  check("200", r.status === 200, String(r.status));
  const d = r.data || {};
  check("official payload", Boolean(d.official && typeof d.official.ok === "boolean"), JSON.stringify(d.official));
  check("extracted payload", Boolean(d.extracted && typeof d.extracted.ok === "boolean"), JSON.stringify(d.extracted));
  check("comparison verdict", ["match", "mismatch", "incomplete", "unavailable"].includes(d.comparison?.verdict), d.comparison?.verdict);
  check("findings shape", Array.isArray(d.comparison?.findings) && d.comparison.findings.every((f) => f.severity && f.message));
  check("identity rows", Array.isArray(d.comparison?.identity) && d.comparison.identity.length === 3);
  check("subject rows array", Array.isArray(d.comparison?.subjects));
  check("summary string", typeof d.summary === "string" && d.summary.length > 0, d.summary);
  check("status mapping", ["Escalated", "Pending review"].includes(d.status), d.status);
  check("board echoed", d.board === "waec", d.board);
  check(
    "mismatch escalates",
    d.comparison.verdict !== "mismatch" || d.status === "Escalated",
    `${d.comparison?.verdict} -> ${d.status}`
  );
  check("demo fixture labelled", d.official.source !== "live" || typeof d.official.sourceLabel === "string");
}

console.log("\n4. NECO accepts its subtype, NABTEB reports unavailable");
{
  const neco = await call("/api/verify", {
    method: "POST",
    token,
    body: { ...VALID, examType: "neco", examSubType: "SSCEEXT" },
  });
  check("neco 200", neco.status === 200, String(neco.status));
  check("neco verdict valid", ["match", "mismatch", "incomplete", "unavailable"].includes(neco.data?.comparison?.verdict));

  const nabteb = await call("/api/verify", {
    method: "POST",
    token,
    body: { ...VALID, examType: "nabteb", examNumber: "NAB/2024/0011" },
  });
  check("nabteb 200", nabteb.status === 200, String(nabteb.status));
  check("nabteb unavailable", nabteb.data?.comparison?.verdict === "unavailable", nabteb.data?.comparison?.verdict);
  check("nabteb pending", nabteb.data?.status === "Pending review", nabteb.data?.status);
  // The exact wording depends on the network: an unreachable API says
  // "no public result API", a reachable one says "no result found" —
  // either way the official record is unavailable and must be explained.
  check(
    "nabteb explains the missing official record",
    /no public result API|no result found/i.test(nabteb.data?.official?.message || ""),
    nabteb.data?.official?.message
  );
}

console.log("\n5. save record with the photo, then read it back");
let createdId = null;
{
  // Re-run a verification to get payloads to save.
  const v = await call("/api/verify", { method: "POST", token, body: VALID });
  const d = v.data;
  const save = await call("/api/records", {
    method: "POST",
    token,
    body: {
      candidateId: VALID.examNumber,
      candidateName: d.official?.ok ? d.official.candidateName : "",
      exam: "WAEC WASSCE · 2024",
      result: d.summary,
      findings: d.comparison.findings,
      status: d.status,
      examType: d.board,
      examNumber: VALID.examNumber,
      examYear: VALID.examYear,
      examSubType: "SSCEINT",
      official: d.official,
      extracted: d.extracted,
      comparison: d.comparison,
      verdict: d.comparison.verdict,
      image: TINY_PNG,
    },
  });
  check("201 created", save.status === 201, String(save.status));
  const rec = save.data?.record;
  createdId = rec?.id || null;
  check("record id", Boolean(rec?.id));
  check("imageUrl points at the stored photo", /^\/api\/uploads\/rec-.+/.test(rec?.imageUrl || ""), rec?.imageUrl);
  check("verdict stored", rec?.verdict === d.comparison.verdict, rec?.verdict);
  check("examNumber stored", rec?.examNumber === VALID.examNumber, rec?.examNumber);
  check("comparison stored", Array.isArray(rec?.comparison?.subjects));
  check("status matches verdict mapping", rec?.status === (d.comparison.verdict === "mismatch" ? "Escalated" : "Pending review"), rec?.status);
  check("photo bytes not echoed in the response", !("imageData" in rec), JSON.stringify(Object.keys(rec || {})));

  if (rec?.imageUrl) {
    const img = await fetch(`${BASE}${rec.imageUrl}`);
    check("uploaded photo is served (200)", img.status === 200, String(img.status));
    check("served as image", (img.headers.get("content-type") || "").startsWith("image/"), img.headers.get("content-type"));
  }

  const list = await call("/api/records", { token });
  const rows = list.data?.records || [];
  check("record appears in archive", rows.some?.((r) => r.id === rec?.id));
  check("list rows never include photo bytes", rows.every?.((r) => !("imageData" in r)));
}

console.log("\n6. verify meta stays public-ish and shaped");
{
  const r = await call("/api/verify/meta", { token });
  check("200", r.status === 200, String(r.status));
  check("boards listed", Array.isArray(r.data?.boards) && r.data.boards.includes("waec"), JSON.stringify(r.data));
}

console.log("\n7. cleanup — remove the record this run created");
{
  if (createdId) {
    const d = await call(`/api/records/${createdId}`, { method: "DELETE", token });
    check("created record deleted", d.status === 200, String(d.status));
    const list = await call("/api/records", { token });
    check("gone from the archive", !(list.data?.records || []).some((r) => r.id === createdId));
  } else {
    console.log("  skip  no record was created");
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
