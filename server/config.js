// Configuration.
//
// Loads server/.env (simple KEY=VALUE parser — no dependency needed) and
// exposes the values the provider/vision layers read. Values already set
// in the real environment always win over the file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnvFile();

const truthy = (v) => v === "1" || String(v).toLowerCase() === "true";

export const config = {
  // Vision (photo -> extraction): auto | gemini | tesseract | off
  //   auto      -> Gemini first, Tesseract fallback on failure
  //   tesseract -> local OCR only, no key required
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  visionProvider: (process.env.VISION_PROVIDER || "auto").toLowerCase(),

  // Official result providers
  provider: (process.env.RESULT_PROVIDER || "auto").toLowerCase(),
  waecApiSecret: process.env.WAEC_API_SECRET || "",
  waecSandbox: truthy(process.env.WAEC_SANDBOX),
  necoApiKey: process.env.NECO_API_KEY || "",
  necoToken: process.env.NECO_TOKEN || "",
  necoPayRef: process.env.NECO_PAYREF || "",

  // KakaVerify.ng (https://developers.kakaverify.ng) — exam token/PIN provider.
  kakaverifyApiKey: process.env.KAKAVERIFY_API_KEY || "",
  kakaverifyBaseUrl: (process.env.KAKAVERIFY_BASE_URL || "https://www.app.kakaverify.ng/auth/api/v1").replace(/\/+$/, ""),
  kakaverifyPhone: process.env.KAKAVERIFY_PHONE || "",
};

// Which real providers are fully configured (keys + tokens present).
export const configured = {
  waec: Boolean(config.waecApiSecret),
  neco: Boolean(config.necoApiKey && config.necoToken && config.necoPayRef),
  kakaverify: Boolean(config.kakaverifyApiKey),
};

export default config;
