// Data layer — Supabase (PostgreSQL).
//
// Every function keeps the exact signature the rest of the app already
// uses; only the storage changed (in-memory -> Postgres). Data functions
// are async now, so call sites in index.js await them.
//
// Credentials live in server/.env as DATABASE_URL (gitignored). On boot
// the three tables are created if missing and the demo account is seeded,
// so a fresh Supabase project needs no manual SQL.
import "./config.js"; // loads server/.env before DATABASE_URL is read
import { randomBytes } from "node:crypto";
import pg from "pg";
import { hashPassword, verifyPassword } from "./passwords.js";

const DATABASE_URL = process.env.DATABASE_URL || "";
if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing from server/.env.");
  console.error("Add your Supabase Postgres connection string:");
  console.error("DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres");
  process.exit(1);
}

const { Pool } = pg;

// Supabase terminates TLS with a certificate Node does not chain-trust by
// default, so encrypt without verifying the chain (Supabase's standard
// recipe for direct connections). Strip sslmode so the explicit option wins.
const url = new URL(DATABASE_URL);
url.searchParams.delete("sslmode");

const pool = new Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  max: 10,
});
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

create index if not exists records_created_at_idx on public.records ("createdAt" desc);

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

async function listRecords() {
  const { rows } = await pool.query(
    'select * from public.records order by "createdAt" desc'
  );
  return rows;
}

async function getRecord(id) {
  const { rows } = await pool.query("select * from public.records where id = $1", [id]);
  return rows[0] || null;
}

async function createRecord(data) {
  const record = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    imageUrl: data.imageUrl || null,
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
       status, "examType", "examNumber", "examYear", "examSubType", "imageUrl",
       official, extracted, comparison, verdict, "createdAt", "reviewedBy", "reviewNote"
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
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
      json(record.official),
      json(record.extracted),
      json(record.comparison),
      record.verdict,
      record.createdAt,
      record.reviewedBy,
      record.reviewNote,
    ]
  );
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
  return rows[0] || null;
}

// --- Users & sessions -----------------------------------------------------
// Passwords never leave this layer — see passwords.js for the hashing.

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
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

async function createUser({ name, email, password }) {
  const id = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailNorm = String(email ?? "").trim().toLowerCase();
  const { salt, hash } = hashPassword(password);
  const { rows } = await pool.query(
    `insert into public.users (id, name, email, hash, salt, "createdAt")
     values ($1, $2, $3, $4, $5, now()) returning *`,
    [id, String(name ?? "").trim(), emailNorm, hash, salt]
  );
  return publicUser(rows[0]);
}

function verifyUserPassword(user, password) {
  if (!user) return false;
  return verifyPassword(password, user.salt, user.hash);
}

async function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    'insert into public.sessions (token, "userId") values ($1, $2)',
    [token, userId]
  );
  return token;
}

async function getSessionUser(token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.* from public.sessions s
     join public.users u on u.id = s."userId"
     where s.token = $1`,
    [token]
  );
  return publicUser(rows[0] || null);
}

async function deleteSession(token) {
  if (token) await pool.query("delete from public.sessions where token = $1", [token]);
}

// Demo account so the app is usable immediately after sign-up pages land.
async function seedDemoAccount() {
  if (await findUserByEmail("officer@nvri.gov.ng")) return;
  await createUser({
    name: "Verification Officer",
    email: "officer@nvri.gov.ng",
    password: "Passw0rd!",
  });
}

// Boot: create schema + seed, then fail fast with a clear message if the
// database is unreachable (the server would be unusable anyway).
try {
  await pool.query(SCHEMA);
  await seedDemoAccount();
} catch (e) {
  console.error("Could not initialise the Supabase database:", e.message);
  process.exit(1);
}

export default {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  findUserByEmail,
  findUserById,
  createUser,
  verifyUserPassword,
  createSession,
  getSessionUser,
  deleteSession,
  publicUser,
};
