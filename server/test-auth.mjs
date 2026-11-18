// Auth API test — run: node test-auth.mjs
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
const newUser = { name: "Test Officer", email: `test${stamp}@fcahpt.gov.ng`, password: "Secret123!" };

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
  const r3 = await call("/api/auth/signup", { method: "POST", body: { name: "A B", email: `x${stamp}@fcahpt.gov.ng`, password: "short" } });
  check("short password -> 400", r3.status === 400, `got ${r3.status}`);
}

console.log("\n4. signup creates a pending account (no session until approved)");
let token = null;
let userId = null;
{
  const r = await call("/api/auth/signup", { method: "POST", body: newUser });
  check("signup 201", r.status === 201, `got ${r.status} ${JSON.stringify(r.data)}`);
  check("no token until approved", !r.data?.token, `token: ${r.data?.token}`);
  check(
    "account created as pending",
    r.data?.pending === true && r.data?.user?.status === "pending",
    JSON.stringify(r.data)
  );
  check("user has no password fields", r.data?.user && !("hash" in r.data.user) && !("salt" in r.data.user));
  check("user email normalized", r.data?.user?.email === newUser.email.toLowerCase());
  userId = r.data?.user?.id;

  // The password is right, but a pending account may not sign in yet.
  const blocked = await call("/api/auth/login", { method: "POST", body: newUser });
  check("pending login -> 403", blocked.status === 403, `got ${blocked.status}`);

  // The admin (seeded demo account) approves the sign-up — promoting it
  // to admin so the rest of the suite can exercise every route.
  const admin = await call("/api/auth/login", {
    method: "POST",
    body: { email: "officer@fcahpt.gov.ng", password: "Passw0rd!" },
  });
  check("admin login 200", admin.status === 200, `got ${admin.status}`);
  const approve = await call(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "POST",
    token: admin.data?.token,
    body: { status: "active", role: "admin" },
  });
  check(
    "admin approves the sign-up",
    approve.status === 200 && approve.data?.user?.status === "active",
    `got ${approve.status} ${JSON.stringify(approve.data)}`
  );

  const ok = await call("/api/auth/login", { method: "POST", body: newUser });
  check("approved login -> 200 + token", ok.status === 200 && typeof ok.data?.token === "string", `got ${ok.status}`);
  check("login returns the role", ok.data?.user?.role === "admin", ok.data?.user?.role);
  token = ok.data?.token;
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
  const r = await call("/api/auth/login", { method: "POST", body: { email: "officer@fcahpt.gov.ng", password: "Passw0rd!" } });
  check("demo login 200", r.status === 200, `got ${r.status}`);
  check("demo user name", r.data?.user?.name === "Verification Officer");
}

console.log("\n8. protected routes accept a valid token");
{
  const a = await call("/api/analyze", { method: "POST", token, body: { candidateId: "FCAHPT/2026/T1", candidateName: "A B", exam: "PCR", result: "Negative" } });
  check("analyze 200", a.status === 200 && Array.isArray(a.data?.findings), `got ${a.status}`);
  const g = await call("/api/records", { token });
  check("GET records 200", g.status === 200 && Array.isArray(g.data?.records), `got ${g.status}`);
  const p = await call("/api/records", { method: "POST", token, body: { candidateId: `T-${stamp}`, exam: "PCR", result: "Negative" } });
  check("POST record 201", p.status === 201, `got ${p.status}`);
  const recId = p.data?.record?.id;
  const u = await call(`/api/records/${recId}`, { method: "PUT", token, body: { status: "Verified", reviewedBy: "Test Officer" } });
  check("PUT record 200 + patch applied", u.status === 200 && u.data?.record?.status === "Verified", `got ${u.status}`);
  check("reviewer attributed to the token's user", u.data?.record?.reviewedBy === "Test Officer", u.data?.record?.reviewedBy);

  // Invalid statuses are rejected, and the record this run created is
  // removed again so repeated runs leave no residue behind.
  const bad = await call(`/api/records/${recId}`, { method: "PUT", token, body: { status: "Totally Fake" } });
  check("unknown status -> 400", bad.status === 400, `got ${bad.status}`);
  const del = await call(`/api/records/${recId}`, { method: "DELETE", token });
  check("DELETE record 200 (cleanup)", del.status === 200, `got ${del.status}`);
}

console.log("\n9. role-based access (the two seeded officer accounts)");
{
  // Verifying officer: verification workspace, read/create records, no
  // review decisions, no admin area.
  const v = await call("/api/auth/login", {
    method: "POST",
    body: { email: "isaacyakubu5@gmail.com", password: "12345678" },
  });
  check("verifying officer login 200", v.status === 200, `got ${v.status}`);
  check("verifying officer role", v.data?.user?.role === "verifying", v.data?.user?.role);
  const vt = v.data?.token;

  const g = await call("/api/records", { token: vt });
  check("verifying reads records", g.status === 200, `got ${g.status}`);
  const an = await call("/api/analyze", { method: "POST", token: vt, body: { candidateId: "X", exam: "e", result: "r" } });
  check("verifying can analyze", an.status === 200, `got ${an.status}`);
  const p = await call("/api/records", {
    method: "POST",
    token: vt,
    body: { candidateId: `RBAC-${stamp}`, exam: "PCR", result: "Negative" },
  });
  check("verifying creates records", p.status === 201, `got ${p.status}`);
  const u = await call(`/api/records/${p.data?.record?.id}`, {
    method: "PUT",
    token: vt,
    body: { status: "Verified" },
  });
  check("verifying cannot review records -> 403", u.status === 403, `got ${u.status}`);
  const au = await call("/api/admin/users", { token: vt });
  check("verifying cannot manage users -> 403", au.status === 403, `got ${au.status}`);
  const kv = await call("/api/kakaverify/balance", { token: vt });
  check("verifying cannot reach the wallet -> 403", kv.status === 403, `got ${kv.status}`);
  // Remove the record this check created (admin token from section 4).
  const del = await call(`/api/records/${p.data?.record?.id}`, { method: "DELETE", token });
  check("cleanup RBAC record", del.status === 200, `got ${del.status}`);

  // Records officer: read-only Reports access, nothing else.
  const r = await call("/api/auth/login", {
    method: "POST",
    body: { email: "isaacyakubu54@gmail.com", password: "12345678" },
  });
  check("records officer login 200", r.status === 200, `got ${r.status}`);
  check("records officer role", r.data?.user?.role === "records", r.data?.user?.role);
  const rt = r.data?.token;
  const rg = await call("/api/records", { token: rt });
  check("records officer reads records", rg.status === 200, `got ${rg.status}`);
  const rp = await call("/api/records", {
    method: "POST",
    token: rt,
    body: { candidateId: `RBAC-${stamp}`, exam: "PCR", result: "Negative" },
  });
  check("records officer cannot create records -> 403", rp.status === 403, `got ${rp.status}`);
  const rv = await call("/api/verify", {
    method: "POST",
    token: rt,
    body: { examType: "waec", examNumber: "1234", examYear: "2024", image: "data:image/png;base64,AAAA" },
  });
  check("records officer cannot verify -> 403", rv.status === 403, `got ${rv.status}`);
  const ra = await call("/api/admin/users", { token: rt });
  check("records officer cannot manage users -> 403", ra.status === 403, `got ${ra.status}`);
}

console.log("\n10. password change (every role may edit only this)");
{
  const r = await call("/api/auth/password", {
    method: "POST",
    token,
    body: { currentPassword: newUser.password, newPassword: "NewSecret42!" },
  });
  check("change password 200", r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  const wrong = await call("/api/auth/password", {
    method: "POST",
    token,
    body: { currentPassword: "not-it-at-all", newPassword: "Another42!!" },
  });
  check("wrong current password -> 400", wrong.status === 400, `got ${wrong.status}`);
  const short = await call("/api/auth/password", {
    method: "POST",
    token,
    body: { currentPassword: "NewSecret42!", newPassword: "short" },
  });
  check("short new password -> 400", short.status === 400, `got ${short.status}`);
  const anon = await call("/api/auth/password", {
    method: "POST",
    body: { currentPassword: "x", newPassword: "longenough" },
  });
  check("password change requires a session -> 401", anon.status === 401, `got ${anon.status}`);
  const loginNew = await call("/api/auth/login", { method: "POST", body: { email: newUser.email, password: "NewSecret42!" } });
  check("login with the new password", loginNew.status === 200, `got ${loginNew.status}`);
}

console.log("\n11. logout invalidates the token");
{
  const r = await call("/api/auth/logout", { method: "POST", token });
  check("logout 200", r.status === 200, `got ${r.status}`);
  const me = await call("/api/auth/me", { token });
  check("token dead after logout -> 401", me.status === 401, `got ${me.status}`);
  const g = await call("/api/records", { token });
  check("records reject dead token -> 401", g.status === 401, `got ${g.status}`);
}

console.log("\n12. garbage tokens rejected");
{
  const r = await call("/api/auth/me", { token: "not-a-real-token" });
  check("bad token -> 401", r.status === 401, `got ${r.status}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
