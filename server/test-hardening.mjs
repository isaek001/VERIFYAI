// Hardening / deployment smoke test — run: node test-hardening.mjs
// Needs a running server; point TEST_BASE at it (default :4000).
// Covers the production-safety behaviours: security headers, JSON errors,
// body-limit mapping, CORS allowlist, KakaVerify auth, PWA statics.
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

console.log("\n1. health + security headers");
{
  const res = await fetch(`${BASE}/api/health`);
  const data = await res.json().catch(() => null);
  check("health 200", res.status === 200, String(res.status));
  check("ok + db status field", data?.ok === true && ["up", "down"].includes(data?.db), JSON.stringify(data));
  check("X-Content-Type-Options: nosniff", res.headers.get("x-content-type-options") === "nosniff");
  check("X-Frame-Options: DENY", res.headers.get("x-frame-options") === "DENY");
  check("Referrer-Policy set", Boolean(res.headers.get("referrer-policy")));
  check("Permissions-Policy set", Boolean(res.headers.get("permissions-policy")));
}

console.log("\n2. unknown API endpoint answers JSON 404");
{
  const res = await fetch(`${BASE}/api/definitely-not-a-route`);
  check("404", res.status === 404, String(res.status));
  const data = await res.json().catch(() => null);
  check("JSON error body", Boolean(data?.error), JSON.stringify(data));
}

console.log("\n3. oversized body maps to a JSON 413");
{
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "a@b.co", password: "x".repeat(5 * 1024 * 1024) }),
  });
  check("413 over the 4 MB limit", res.status === 413, String(res.status));
  const data = await res.json().catch(() => null);
  check("friendly JSON message", /too large/i.test(data?.error || ""), JSON.stringify(data));
}

console.log("\n4. CORS allowlist");
{
  const evil = await fetch(`${BASE}/api/health`, { headers: { Origin: "https://evil.example" } });
  check(
    "unknown origin gets no CORS header",
    !evil.headers.get("access-control-allow-origin"),
    String(evil.headers.get("access-control-allow-origin"))
  );
  const dev = await fetch(`${BASE}/api/health`, { headers: { Origin: "http://localhost:5174" } });
  check(
    "dev origin allowed",
    dev.headers.get("access-control-allow-origin") === "http://localhost:5174",
    String(dev.headers.get("access-control-allow-origin"))
  );
}

console.log("\n5. KakaVerify money endpoints require a session");
{
  const b = await fetch(`${BASE}/api/kakaverify/balance`);
  check("balance 401 anonymous", b.status === 401, String(b.status));
  const h = await fetch(`${BASE}/api/kakaverify/history`);
  check("history 401 anonymous", h.status === 401, String(h.status));
  const p = await fetch(`${BASE}/api/kakaverify/purchase-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ examType: "waec" }),
  });
  check("purchase-token 401 anonymous", p.status === 401, String(p.status));
  const j = await fetch(`${BASE}/api/kakaverify/jamb-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId: "1234567890" }),
  });
  check("jamb-purchase 401 anonymous", j.status === 401, String(j.status));
}

console.log("\n6. PWA statics are served");
{
  const m = await fetch(`${BASE}/manifest.json`);
  check("manifest 200 + JSON", m.status === 200 && (m.headers.get("content-type") || "").includes("json"), `${m.status} ${m.headers.get("content-type")}`);
  const sw = await fetch(`${BASE}/sw.js`);
  check("service worker 200", sw.status === 200 && (sw.headers.get("content-type") || "").includes("javascript"), `${sw.status} ${sw.headers.get("content-type")}`);
  const icon = await fetch(`${BASE}/icons/icon-192.png`);
  check("app icon 200", icon.status === 200, String(icon.status));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
