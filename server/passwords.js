// Password hashing for the demo auth store.
//
// scrypt with a per-user random salt; verification is constant-time.
// When Supabase lands, replace this with Supabase Auth (GoTrue) — these
// two functions and the sessions map in db.js are the only touch points.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const actual = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
