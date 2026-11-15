// One-off migration: move legacy disk photos into the database.
//
// Records created before image storage moved into Postgres point at
// /uploads/<file> URLs, which only work while express.static serves the
// local server/uploads/ folder — on Vercel they 404. This reads each local
// file, stores its bytes in records."imageData" and rewrites imageUrl to
// the permanent /api/uploads/<record id> route.
//
// Run once from the repo root:  node server/migrate-images.mjs
// (Photos that no longer exist on disk are reported and left untouched.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./config.js";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "uploads");

const raw = new URL(process.env.DATABASE_URL);
raw.searchParams.delete("sslmode");
const pool = new pg.Pool({
  connectionString: raw.toString(),
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const { rows } = await pool.query(
  `select id, "imageUrl" from public.records
   where "imageData" is null and "imageUrl" like '/uploads/%'
   order by "createdAt"`
);

if (!rows.length) {
  console.log("Nothing to migrate: every record already stores its photo bytes.");
} else {
  let moved = 0;
  let missing = 0;
  for (const row of rows) {
    const file = path.basename(row.imageUrl);
    const ext = path.extname(file).toLowerCase();
    const full = path.join(uploadsDir, file);
    if (!fs.existsSync(full)) {
      missing++;
      console.log(`  skip   ${row.id} — ${file} not found on disk`);
      continue;
    }
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${fs.readFileSync(full).toString("base64")}`;
    await pool.query(
      `update public.records
         set "imageData" = $1, "imageUrl" = $2
       where id = $3`,
      [dataUrl, `/api/uploads/${row.id}`, row.id]
    );
    moved++;
    console.log(`  moved  ${row.id} — ${file} (${(dataUrl.length / 1024).toFixed(0)} KB stored)`);
  }
  console.log(`\n${moved} photo(s) migrated, ${missing} missing on disk.`);
}

await pool.end();
