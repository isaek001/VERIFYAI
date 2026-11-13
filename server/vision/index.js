// Vision dispatcher.
//
// readResultImage({ dataUrl, mimeType, examType }) is the single seam the
// API layer calls. It selects the engine from VISION_PROVIDER (config.js):
//
//   auto      -> Gemini first, automatic Tesseract fallback on failure
//   gemini    -> Gemini only
//   tesseract -> Tesseract only (local OCR, no key needed)
//   off       -> vision disabled
//
// Every path returns the same normalized shape:
//   ok: true   -> { source, sourceLabel, candidateName, examNumber,
//                   examYear, center, subjects: [{subject, grade}] }
//   ok: false  -> { source, reason, message }
//     reason: not-configured | provider-error | bad-response |
//             unreadable | network | disabled
import { config } from "../config.js";
import readWithGemini from "./gemini.js";
import readWithTesseract from "./tesseract.js";

const disabled = () => ({
  ok: false,
  source: "vision",
  reason: "disabled",
  message: "Vision extraction is disabled (VISION_PROVIDER=off).",
});

export default async function readResultImage(args = {}) {
  const mode = config.visionProvider;

  if (mode === "off") return disabled();

  if (mode === "tesseract") return readWithTesseract(args);

  // Gemini primary (direct or via auto).
  const primary = await readWithGemini(args);
  if (primary.ok) return primary;

  // gemini-only: surface the Gemini failure as-is.
  if (mode === "gemini") return primary;

  // auto: fall back to local Tesseract OCR.
  const fallback = await readWithTesseract(args);
  if (fallback.ok) {
    return { ...fallback, fallbackFrom: primary.reason };
  }

  // Both failed — report the primary reason (Gemini's), with a hint that
  // the local fallback also could not help.
  return {
    ok: false,
    source: primary.source || "vision",
    reason: primary.reason,
    message: `${primary.message} Local OCR fallback also failed: ${fallback.message}`,
  };
}

// Which engines are available right now (drives /api/verify/meta hints).
export function visionStatus() {
  return {
    mode: config.visionProvider,
    gemini: Boolean(config.geminiApiKey),
    tesseract: true,
  };
}
