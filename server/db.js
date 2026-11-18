// Data layer — Supabase (PostgreSQL).
//
// Every function keeps the exact signature the rest of the app already
// uses; only the storage changed (in-memory -> Postgres). Data functions
// are async now, so call sites in index.js await them.
//
// Credentials live in server/.env as DATABASE_URL (gitignored). On boot
// the three tables are created if missing (and, outside production, the
// demo account is seeded), so a fresh Supabase project needs no manual SQL.
import "./config.js"; // loads server/.env before DATABASE_URL is read
import { randomBytes } from "node:crypto";
import pg from "pg";
import { hashPassword, verifyPassword } from "./passwords.js";

const DATABASE_URL = process.env.DATABASE_URL || "";
if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing from server/.env.");
  console.error("Add your Supabase Postgres connection string:");
  console.error("DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres");
  console.error("The server keeps booting; data routes return 500 until it is set.");
  console.error("(No process.exit here: on Vercel that would kill every invocation, even /api/health.)");
}

const { Pool } = pg;

// Supabase terminates TLS with a certificate Node does not chain-trust by
// default, so encrypt without verifying the chain (Supabase's standard
// recipe for direct connections). Strip sslmode so the explicit option wins.
let url = null;
try {
  url = DATABASE_URL ? new URL(DATABASE_URL) : null;
} catch {
  console.error("DATABASE_URL is not a valid URL — data routes will fail until it is fixed.");
}
if (url) url.searchParams.delete("sslmode");

const pool = url
  ? new Pool({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
      max: 10,
    })
  : new Pool({ max: 5 }); // no URL: per-query errors instead of a dead process
pool.on("error", (err) => console.error("Postgres pool error:", err.message));

// --- Schema (idempotent — safe on every boot) ----------------------------
const SCHEMA = `
create table if not exists public.users (
  id          text primary key,
  name        text not null,
  email       text not null unique,
  hash        text not null,
  salt        text not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.records (
  id              text primary key,
  "candidateId"   text not null default '',
  "candidateName" text not null default '',
  exam            text not null default '',
  result          text not null default '',
  findings        jsonb not null default '[]'::jsonb,
  "sourceText"    text not null default '',
  status          text not null default 'Pending review',
  "examType"      text not null default '',
  "examNumber"    text not null default '',
  "examYear"      text not null default '',
  "examSubType"   text not null default '',
  "imageUrl"      text,
  "imageData"     text,
  official        jsonb,
  extracted       jsonb,
  comparison      jsonb,
  verdict         text,
  "createdAt"     timestamptz not null default now(),
  "reviewedBy"    text,
  "reviewNote"    text not null default ''
);

create table if not exists public.sessions (
  token       text primary key,
  "userId"    text not null references public.users (id) on delete cascade,
  "createdAt" timestamptz not null default now()
);

-- Session expiry (added later; idempotent for existing installs). Rows
-- created before the column existed get one full window from first boot —
-- after that createSession always stamps its own expiry.
alter table public.sessions add column if not exists "expiresAt" timestamptz;
update public.sessions set "expiresAt" = now() + interval '7 days' where "expiresAt" is null;

-- Role-based access control (added later; idempotent for existing
-- installs). Every account that predates the approval flow was created by
-- the operator, so existing rows default to admin/active — sign-ups from
-- the public page explicitly get an officer role and status 'pending'.
alter table public.users add column if not exists role   text not null default 'admin';
alter table public.users add column if not exists status text not null default 'active';

create index if not exists records_created_at_idx on public.records ("createdAt" desc);

-- Photo bytes column for databases created before image storage moved
-- from disk into the database (idempotent for existing installs).
alter table public.records add column if not exists "imageData" text;

-- Row Level Security: only this server touches the tables (it connects as
-- the table owner, which bypasses RLS). The publishable/anon key gets
-- nothing through PostgREST unless a policy says so; we open the door to
-- Supabase's service_role only, for future use.
do $$
declare t text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach t in array array['users', 'records', 'sessions'] loop
      execute format('alter table public.%I enable row level security', t);
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t
          and policyname = 'service_role full access'
      ) then
        execute format(
          'create policy "service_role full access" on public.%I for all to service_role using (true) with check (true)',
          t
        );
      end if;
    end loop;
  end if;
end $$;
`;

// --- Records --------------------------------------------------------------
// JSON columns (findings/official/extracted/comparison) round-trip through
// pg as plain JS values.

async function listRecords(limit = 1000) {
  // Everything except imageData: photo bytes would balloon list responses
  // (Vercel caps them at 4.5 MB) — the client loads them via imageUrl.
  // The LIMIT keeps that cap safe as the table grows.
  const n = Number(limit) > 0 ? Math.floor(Number(limit)) : 1000;
  const { rows } = await pool.query(
    `select id, "candidateId", "candidateName", exam, result, findings, "sourceText",
            status, "examType", "examNumber", "examYear", "examSubType", "imageUrl",
            official, extracted, comparison, verdict, "createdAt", "reviewedBy", "reviewNote"
     from public.records order by "createdAt" desc limit $1`,
    [n]
  );
  return rows;
}

async function deleteRecord(id) {
  const { rows } = await pool.query('delete from public.records where id = $1 returning id', [id]);
  return rows.length > 0;
}

// Cheap reachability probe for /api/health.
async function ping() {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

async function getRecordImage(id) {
  const { rows } = await pool.query('select "imageData" from public.records where id = $1', [id]);
  return rows[0]?.imageData || null;
}

async function getRecord(id) {
  const { rows } = await pool.query("select * from public.records where id = $1", [id]);
  return rows[0] || null;
}

async function createRecord(data) {
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const imageData = typeof data.imageData === "string" ? data.imageData : null;
  const record = {
    id,
    candidateId: String(data.candidateId ?? "").trim(),
    candidateName: String(data.candidateName ?? "").trim(),
    exam: String(data.exam ?? "").trim(),
    result: String(data.result ?? "").trim(),
    findings: Array.isArray(data.findings) ? data.findings : [],
    sourceText: String(data.sourceText ?? "").slice(0, 8000),
    status: data.status || "Pending review",
    // --- Exam-verification flow (New verification page) -----------------
    examType: String(data.examType ?? "").trim(),
    examNumber: String(data.examNumber ?? "").trim(),
    examYear: String(data.examYear ?? "").trim(),
    examSubType: String(data.examSubType ?? "").trim(),
    // Photos are stored as bytes (imageData) and served by GET /api/uploads/:id.
    imageData,
    imageUrl: data.imageUrl || (imageData ? `/api/uploads/${id}` : null),
    official: data.official || null,
    extracted: data.extracted || null,
    comparison: data.comparison || null,
    verdict: data.verdict || data.comparison?.verdict || null,
    // --------------------------------------------------------------------
    createdAt: new Date().toISOString(),
    reviewedBy: null,
    reviewNote: "",
  };

  // pg serializes JS arrays as Postgres array literals, not JSON, so the
  // jsonb columns must be stringified explicitly.
  const json = (v) => (v == null ? null : JSON.stringify(v));

  await pool.query(
    `insert into public.records (
       id, "candidateId", "candidateName", exam, result, findings, "sourceText",
       status, "examType", "examNumber", "examYear", "examSubType", "imageUrl", "imageData",
       official, extracted, comparison, verdict, "createdAt", "reviewedBy", "reviewNote"
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      record.id,
      record.candidateId,
      record.candidateName,
      record.exam,
      record.result,
      json(record.findings),
      record.sourceText,
      record.status,
      record.examType,
      record.examNumber,
      record.examYear,
      record.examSubType,
      record.imageUrl,
      record.imageData,
      json(record.official),
      json(record.extracted),
      json(record.comparison),
      record.verdict,
      record.createdAt,
      record.reviewedBy,
      record.reviewNote,
    ]
  );
  // The photo was just uploaded by the caller — no need to echo it back.
  delete record.imageData;
  return record;
}

async function updateRecord(id, patch) {
  const sets = [];
  const vals = [];
  const add = (col, val) => {
    vals.push(val);
    sets.push(`"${col}" = $${vals.length}`);
  };
  if (patch.status) add("status", patch.status);
  if (patch.reviewedBy !== undefined) add("reviewedBy", patch.reviewedBy);
  if (patch.reviewNote !== undefined) add("reviewNote", patch.reviewNote);
  if (!sets.length) return getRecord(id);

  vals.push(id);
  const { rows } = await pool.query(
    `update public.records set ${sets.join(", ")} where id = $${vals.length} returning *`,
    vals
  );
  // Never hand photo bytes to callers; they fetch them via /api/uploads/:id.
  if (rows[0]) delete rows[0].imageData;
  return rows[0] || null;
}

// --- Users & sessions -----------------------------------------------------
// Passwords never leave this layer — see passwords.js for the hashing.

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    // Legacy rows (and callers that never set them) are treated as
    // full-access admins — the server enforces the real values anyway.
    role: user.role || "admin",
    status: user.status || "active",
    createdAt: user.createdAt,
  };
}

async function findUserByEmail(email) {
  const needle = String(email ?? "").trim().toLowerCase();
  const { rows } = await pool.query("select * from public.users where email = $1", [needle]);
  return rows[0] || null;
}

async function findUserById(id) {
  if (!id) return null;
  const { rows } = await pool.query("select * from public.users where id = $1", [id]);
  return rows[0] || null;
}

// Account types and lifecycle states (shared by signup + admin routes).
const ROLES = new Set(["admin", "verifying", "records"]);
const STATUSES = new Set(["pending", "active", "suspended"]);

async function createUser({ name, email, password, role, status }) {
  const id = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailNorm = String(email ?? "").trim().toLowerCase();
  const { salt, hash } = hashPassword(password);
  // Safe defaults for internal callers (seeds): anything created outside
  // the signup flow is an active admin unless the caller says otherwise.
  // index.js validates the signup's role before it gets here.
  const userRole = ROLES.has(role) ? role : "admin";
  const userStatus = STATUSES.has(status) ? status : "active";
  const { rows } = await pool.query(
    `insert into public.users (id, name, email, hash, salt, role, status, "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, now()) returning *`,
    [id, String(name ?? "").trim(), emailNorm, hash, salt, userRole, userStatus]
  );
  return publicUser(rows[0]);
}

// --- Admin: account directory & access control ---------------------------

// Pending sign-ups sort first so the approval queue leads the list.
async function listUsers() {
  const { rows } = await pool.query(
    `select id, name, email, role, status, "createdAt"
     from public.users
     order by (case status when 'pending' then 0 else 1 end), "createdAt" desc`
  );
  return rows;
}

// Signup bootstrap: a system with no administrator yet (fresh
// deployment) makes the first account the admin — everyone else waits
// for approval like any other sign-up.
async function countAdmins() {
  const { rows } = await pool.query("select count(*)::int as n from public.users where role = 'admin'");
  return rows[0]?.n ?? 0;
}

// Apply a role and/or status change. Values are validated by the caller
// (index.js) — this only builds the update.
async function updateUserAccess(id, patch) {
  const sets = [];
  const vals = [];
  if (patch.role !== undefined) {
    vals.push(patch.role);
    sets.push(`role = $${vals.length}`);
  }
  if (patch.status !== undefined) {
    vals.push(patch.status);
    sets.push(`status = $${vals.length}`);
  }
  if (!sets.length) return findUserById(id);
  vals.push(id);
  const { rows } = await pool.query(
    `update public.users set ${sets.join(", ")} where id = $${vals.length} returning *`,
    vals
  );
  return rows[0] ? publicUser(rows[0]) : null;
}

// Rotate an account's password (hashing happens in passwords.js).
async function setUserPassword(id, password) {
  const { salt, hash } = hashPassword(password);
  const { rows } = await pool.query(
    "update public.users set hash = $1, salt = $2 where id = $3 returning id",
    [hash, salt, id]
  );
  return rows.length > 0;
}

function verifyUserPassword(user, password) {
  if (!user) return false;
  return verifyPassword(password, user.salt, user.hash);
}

const SESSION_TTL_DAYS = 7;

async function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  // Opportunistic cleanup so expired sessions do not accumulate.
  await pool.query(
    'delete from public.sessions where "expiresAt" is not null and "expiresAt" <= now()'
  );
  await pool.query(
    `insert into public.sessions (token, "userId", "expiresAt")
     values ($1, $2, now() + interval '${SESSION_TTL_DAYS} days')`,
    [token, userId]
  );
  return token;
}

async function getSessionUser(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.* from public.sessions s
     join public.users u on u.id = s."userId"
     where s.token = $1
       and (s."expiresAt" is null or s."expiresAt" > now())`,
    [token]
  );
  return publicUser(rows[0] || null);
}

async function deleteSession(token) {
  if (token) await pool.query("delete from public.sessions where token = $1", [token]);
}

// Demo account so a fresh checkout is usable immediately. A development
// convenience only: production only seeds it when ALLOW_DEMO_LOGIN=1, and
// index.js refuses the demo login on production deployments otherwise.
const DEMO_EMAIL = "officer@fcahpt.gov.ng";
const LEGACY_DEMO_EMAIL = "officer@nvri.gov.ng"; // pre-rename row

async function seedDemoAccount() {
  if (await findUserByEmail(DEMO_EMAIL)) return;
  const legacy = await findUserByEmail(LEGACY_DEMO_EMAIL);
  if (legacy) {
    // Rename in place — keeps the account (and its sessions) intact.
    await pool.query("update public.users set email = $1 where id = $2", [DEMO_EMAIL, legacy.id]);
    return;
  }
  await createUser({
    name: "Verification Officer",
    email: DEMO_EMAIL,
    password: "Passw0rd!",
  });
}

// The two duty accounts that ship with the system: a verifying officer
// and a records officer, both pre-approved (active) — the operator's own
// accounts. Sign-ups from the public page start pending and are approved
// by an admin from the User accounts screen.
const OFFICER_ACCOUNTS = [
  { name: "Verifying Officer", email: "isaacyakubu5@gmail.com", password: "12345678", role: "verifying" },
  { name: "Records Officer", email: "isaacyakubu54@gmail.com", password: "12345678", role: "records" },
];

async function seedOfficerAccounts() {
  for (const account of OFFICER_ACCOUNTS) {
    if (await findUserByEmail(account.email)) continue; // never touches an existing row
    await createUser({ ...account, status: "active" });
  }
}

// Boot: create schema + seed. Failures are logged, never fatal — a
// process.exit here would kill every Vercel invocation (even /api/health)
// and a transient Supabase hiccup should not brick the whole app.
try {
  await pool.query(SCHEMA);
} catch (e) {
  console.error("Could not initialise the Supabase database:", e.message);
}
const isProduction = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
if (!isProduction || process.env.ALLOW_DEMO_LOGIN === "1") {
  try {
    await seedDemoAccount();
  } catch (e) {
    console.error("Demo account seed failed:", e.message);
  }
}
// Officer accounts are the product's default logins, so they seed in
// production too (idempotent: an existing row is never modified).
try {
  await seedOfficerAccounts();
} catch (e) {
  console.error("Officer account seed failed:", e.message);
}

export default {
  listRecords,
  getRecord,
  getRecordImage,
  deleteRecord,
  ping,
  createRecord,
  updateRecord,
  findUserByEmail,
  findUserById,
  createUser,
  listUsers,
  countAdmins,
  updateUserAccess,
  setUserPassword,
  verifyUserPassword,
  createSession,
  getSessionUser,
  deleteSession,
  publicUser,
};
