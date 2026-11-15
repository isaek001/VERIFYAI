# Verify AI — Results Verification

A full-stack results-verification app: officers photograph a physical result
slip, the app reads it with OCR/AI, fetches the official record from the
board's provider, runs a field-by-field comparison, and routes the record for
an authorised human review decision.

* **Client** — React 18 + Vite (`client/`), lazy-loaded routes, light/dark
  theme, installable PWA (manifest + service worker).
* **Server** — Express 4 (`server/index.js`) exposed as a single Vercel
  serverless function (`api/index.js`).
* **Data** — Supabase Postgres (`server/db.js`); photos are stored as bytes in
  the `records` table and served by `GET /api/uploads/:id`.
* **Providers** — WAEC / NECO / NABTEB official lookups, KakaVerify wallet
  integration, Gemini vision with a local Tesseract fallback.

## Quick start

```bash
npm install && npm install --prefix server && npm install --prefix client
cp server/.env.example server/.env    # then fill in DATABASE_URL at minimum
npm run dev                           # Express :4000 + Vite :5174
```

The schema is created automatically on boot. Outside production a demo account
is seeded (`officer@fcahpt.gov.ng` / `Passw0rd!`) and the login page offers a
one-click demo fill.

Other scripts:

```bash
npm run build      # build the client into client/dist
npm start          # serve the built client + API from Express
npm test           # unit tests + API tests (see below)
```

## Environment variables

Set these in `server/.env` locally and as Vercel environment variables in
production (never commit `.env` — it is gitignored):

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Supabase Postgres connection string |
| `GEMINI_API_KEY` | for AI vision | Gemini photo reading (`VISION_PROVIDER=auto\|gemini`) |
| `GEMINI_MODEL` | no | defaults to `gemini-2.5-flash` |
| `VISION_PROVIDER` | no | `auto` (default), `gemini`, `tesseract` |
| `RESULT_PROVIDER` | no | `auto` (default), `live`, `fixture`, `kakaverify` |
| `WAEC_API_SECRET` / `WAEC_SANDBOX` | for WAEC | official WAEC confirmation API |
| `NECO_API_KEY` / `NECO_TOKEN` / `NECO_PAYREF` | for NECO | official NECO API |
| `NABTEB_API_BASE_URL` | no | defaults to the public NABTEB API |
| `KAKAVERIFY_API_KEY` / `KAKAVERIFY_BASE_URL` / `KAKAVERIFY_PHONE` | for KakaVerify | wallet + token purchases (costs money) |
| `ALLOW_DEMO_LOGIN` | no | `1` re-enables the demo account in production |
| `ALLOWED_EMAIL_DOMAINS` | no | comma list; restricts sign-up to those domains |
| `CORS_ORIGIN` | no | extra origins allowed to call the API cross-origin |

Production behaviour worth knowing:

* **Demo account is dev-only.** Production never seeds it and refuses its
  login unless `ALLOW_DEMO_LOGIN=1`.
* **Fixtures fail closed.** `RESULT_PROVIDER=auto` only falls back to the demo
  fixture outside production; in production an unconfigured board returns a
  clear `not-configured` error instead of fabricated results.
* **Sessions expire** after 7 days; expired tokens are rejected with `401`.
* **Throttles** exist for login, sign-up and verification (per process — a
  shared store such as Upstash/KV is needed for global limits).
* **Security headers** (nosniff, frame options, referrer policy, HSTS in
  production) are set; a full CSP still needs a review of the inline theme
  script and Google Fonts.

## Tests

```bash
npm run test:unit                 # comparison engine + OCR parser (no server)
TEST_BASE=http://localhost:4001 npm run test:api   # auth + verification APIs
npm test                          # everything (defaults to :4000)
```

`test:api` needs a running server; point `TEST_BASE` at it. The API tests
create and then delete their own records, so repeated runs leave no residue.

## Deploying to Vercel

1. Import the repository at <https://vercel.com/new>. `vercel.json` already
   wires the build (`client/dist`) and rewrites `/api/*` to the single
   function `api/index.js` (everything else serves the SPA).
2. Add the environment variables from the table above (copy the values from
   your local `server/.env`).
3. Deploy, then smoke-test `/api/health` (expects `"db": "up"`), a login, and
   a verification.

Notes:

* The function is configured with `maxDuration: 300` — `/api/verify` runs the
  provider and vision calls in parallel and can take 20–45 s.
* Request bodies are capped at 4 MB (Vercel's platform limit is 4.5 MB).
* Uploaded photos live in Postgres, so the read-only function filesystem is
  not a problem; local `server/uploads/` is dev-only and gitignored.

## PWA

`client/public/manifest.json` + `client/public/sw.js` make the app
installable. The service worker caches the app shell and static assets
(network-first for navigations, cache-first for hashed assets) and never
caches `/api/*`, so data is always fresh. It registers in production builds
only (`client/src/main.jsx`).

## Known gaps (production roadmap)

Prioritised leftovers that need product/infrastructure decisions:

1. **Password reset / email verification** — none yet (no mail provider).
2. **Roles & ownership** — every signed-in officer sees all records; no
   admin role, no per-record owner.
3. **Audit trail** — review decisions store one `reviewedBy`/`reviewNote`
   pair; a proper event log table is needed for compliance.
4. **Global rate limiting** — current throttles are per serverless instance.
5. **Content-Security-Policy** — needs a decision on the inline theme script
   and Google Fonts.
6. **Archive pagination/search** — server supports `?limit=`, but search and
   filters are client-side over the loaded set.
7. **Session storage** — tokens live in `localStorage`; moving to httpOnly
   cookies would remove the XSS token-theft surface.
8. **Secret hygiene** — rotate keys that ever sat in a plain `.env`, and purge
   the historical `server/uploads/*` photos from git history (they are
   untracked going forward but remain in old commits).
