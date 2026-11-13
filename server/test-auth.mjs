// Auth API test — run: node test-auth.mjs
const BASE = "http://localhost:4000";
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
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

const stamp = Date.now();
const newUser = { name: "Test Officer", email: `test${stamp}@nvri.gov.ng`, password: "Secret123!" };

console.log("\n1. health stays open");
{
  const r = await call("/api/health");
  check("health 200 without token", r.status === 200 && r.data.ok === true);
}

console.log("\n2. protected routes reject anonymous requests");
{
  const a = await call("/api/analyze", { method: "POST", body: { candidateId: "X", exam: "e", result: "r" } });
  check("analyze 401", a.status === 401, `got ${a.status}`);
  const g = await call("/api/records");
  check("GET records 401", g.status === 401, `got ${g.status}`);
  const p = await call("/api/records", { method: "POST", body: { candidateId: "X", exam: "e", result: "r" } });
  check("POST records 401", p.status === 401, `got ${p.status}`);
  const u = await call("/api/records/rec-1", { method: "PUT", body: { status: "Verified" } });
  check("PUT record 401", u.status === 401, `got ${u.status}`);
  const me = await call("/api/auth/me");
  check("me 401 without token", me.status === 401, `got ${me.status}`);
}

console.log("\n3. signup validation");
{
  const r1 = await call("/api/auth/signup", { method: "POST", body: { name: "", email: "a@b.co", password: "longenough" } });
  check("missing name -> 400", r1.status === 400, `got ${r1.status}`);
  const r2 = await call("/api/auth/signup", { method: "POST", body: { name: "A B", email: "not-an-email", password: "longenough" } });
  check("bad email -> 400", r2.status === 400, `got ${r2.status}`);
  const r3 = await call("/api/auth/signup", { method: "POST", body: { name: "A B", email: `x${stamp}@nvri.gov.ng`, password: "short" } });
  check("short password -> 400", r3.status === 400, `got ${r3.status}`);
}

console.log("\n4. signup succeeds and returns a session");
let token = null;
let userId = null;
{
  const r = await call("/api/auth/signup", { method: "POST", body: newUser });
  check("signup 201", r.status === 201, `got ${r.status} ${JSON.stringify(r.data)}`);
  check("token returned", typeof r.data?.token === "string" && r.data.token.length >= 32);
  check("user has no password fields", r.data?.user && !("hash" in r.data.user) && !("salt" in r.data.user));
  check("user email normalized", r.data?.user?.email === newUser.email.toLowerCase());
  token = r.data?.token;
  userId = r.data?.user?.id;
}

console.log("\n5. duplicate signup rejected");
{
  const r = await call("/api/auth/signup", { method: "POST", body: newUser });
  check("duplicate -> 409", r.status === 409, `got ${r.status}`);
}

console.log("\n6. login flows");
{
  const bad = await call("/api/auth/login", { method: "POST", body: { email: newUser.email, password: "WrongPass9!" } });
  check("wrong password -> 401", bad.status === 401, `got ${bad.status}`);
  const missing = await call("/api/auth/login", { method: "POST", body: {} });
  check("empty body -> 400", missing.status === 400, `got ${missing.status}`);
  const ok = await call("/api/auth/login", { method: "POST", body: { email: newUser.email, password: newUser.password } });
  check("correct login -> 200 + token", ok.status === 200 && typeof ok.data?.token === "string", `got ${ok.status}`);
  check("login token works on /me", (await call("/api/auth/me", { token: ok.data?.token })).data?.user?.id === userId);
}

console.log("\n7. demo account works");
{
  const r = await call("/api/auth/login", { method: "POST", body: { email: "officer@nvri.gov.ng", password: "Passw0rd!" } });
  check("demo login 200", r.status === 200, `got ${r.status}`);
  check("demo user name", r.data?.user?.name === "Verification Officer");
}

console.log("\n8. protected routes accept a valid token");
{
  const a = await call("/api/analyze", { method: "POST", token, body: { candidateId: "NVRI/2026/T1", candidateName: "A B", exam: "PCR", result: "Negative" } });
  check("analyze 200", a.status === 200 && Array.isArray(a.data?.findings), `got ${a.status}`);
  const g = await call("/api/records", { token });
  check("GET records 200", g.status === 200 && Array.isArray(g.data?.records), `got ${g.status}`);
  const p = await call("/api/records", { method: "POST", token, body: { candidateId: `T-${stamp}`, exam: "PCR", result: "Negative" } });
  check("POST record 201", p.status === 201, `got ${p.status}`);
  const recId = p.data?.record?.id;
  const u = await call(`/api/records/${recId}`, { method: "PUT", token, body: { status: "Verified", reviewedBy: "Test Officer" } });
  check("PUT record 200 + patch applied", u.status === 200 && u.data?.record?.status === "Verified", `got ${u.status}`);
}

console.log("\n9. logout invalidates the token");
{
  const r = await call("/api/auth/logout", { method: "POST", token });
  check("logout 200", r.status === 200, `got ${r.status}`);
  const me = await call("/api/auth/me", { token });
  check("token dead after logout -> 401", me.status === 401, `got ${me.status}`);
  const g = await call("/api/records", { token });
  check("records reject dead token -> 401", g.status === 401, `got ${g.status}`);
}

console.log("\n10. garbage tokens rejected");
{
  const r = await call("/api/auth/me", { token: "not-a-real-token" });
  check("bad token -> 401", r.status === 401, `got ${r.status}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
