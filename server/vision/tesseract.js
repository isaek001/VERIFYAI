// Photo -> raw text, via Tesseract OCR (local, no key, no quota).
//
// ocrImage() is the seam: given the uploaded photo as a data URL it returns
// the recognized text. The worker is created once and reused across calls
// (first run downloads the English traineddata and caches it).
//
// The structured extraction from this text lives in parseOcr.js.
import { createWorker } from "tesseract.js";
import parseOcrText from "./parseOcr.js";

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, { logger: () => {} }).catch((e) => {
      workerPromise = null; // allow a retry on the next call
      throw e;
    });
  }
  return workerPromise;
}

// Run OCR and parse the text into the normalized extraction shape.
// Never throws: returns { ok:false, reason, message } on failure so the
// vision dispatcher can report a clean reason.
export default async function readWithTesseract({ dataUrl } = {}) {
  const base64 = String(dataUrl || "").replace(/^data:[^,]+,/, "");
  if (!base64) {
    return { ok: false, source: "tesseract", reason: "bad-response", message: "The uploaded image could not be decoded." };
  }

  let text = "";
  try {
    const worker = await getWorker();
    // OCR must not hang a request forever: Tesseract can stall on a bad
    // image, and Vercel functions have a hard wall-clock limit.
    const recognize = worker.recognize(`data:image/png;base64,${base64}`);
    const timeout = new Promise((_, reject) => {
      const t = setTimeout(() => reject(new Error("OCR timed out after 60s")), 60000);
      if (t.unref) t.unref();
    });
    const { data } = await Promise.race([recognize, timeout]);
    text = data?.text || "";
  } catch (e) {
    return {
      ok: false,
      source: "tesseract",
      reason: "provider-error",
      message: `Tesseract OCR failed (${e.message || e}).`,
    };
  }

  if (!text.trim()) {
    return {
      ok: false,
      source: "tesseract",
      reason: "unreadable",
      message: "No text could be recognized in the photo. Upload a clearer, well-lit image.",
    };
  }

  // parseOcrText already returns { ok:false, reason:"unreadable" } when the
  // text contains no result-slip fields at all.
  return parseOcrText(text);
}
