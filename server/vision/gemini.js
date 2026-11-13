// Photo -> structured result data, via the Gemini API (vision).
//
// readResultImage() is the seam: given the uploaded photo as a data URL it
// returns either a normalized extraction or a clear failure reason.
//
//   ok: true   -> { source, sourceLabel, candidateName, examNumber, examYear,
//                   center, subjects: [{subject, grade}] }
//   ok: false  -> { reason, message }   // not-configured | provider-error |
//                                       // bad-response | unreadable | network
import { config } from "../config.js";

function promptFor(examType) {
  const board = String(examType || "").toUpperCase();
  return `You are given a photo of a Nigerian ${board} examination result slip.
Read the image carefully and respond with JSON only, using exactly this shape:
{"candidateName":"","examNumber":"","examYear":"","center":"","subjects":[{"subject":"","grade":""}],"readable":true}

Rules:
- candidateName: the candidate's full name exactly as printed on the slip.
- examNumber: the candidate's examination / registration number exactly as printed.
- examYear: the four-digit examination year if visible, otherwise "".
- center: the examination centre name if visible, otherwise "".
- subjects: every subject printed on the slip with its grade exactly as shown (for example A1, B2, C6, D7, F9). Write subject names in UPPER CASE.
- readable: false when the image is not a result slip or the text cannot be read.
- Never invent or guess values. Use "" for anything you cannot read clearly.
- Output raw JSON only — no markdown, no commentary.`;
}

function stripFences(text) {
  const t = String(text).trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : t;
}

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

export default async function readResultImage({ dataUrl, mimeType, examType } = {}) {
  if (config.visionProvider === "off") {
    return { ok: false, source: "vision", reason: "not-configured", message: "Vision extraction is disabled." };
  }
  if (!config.geminiApiKey) {
    return { ok: false, source: "vision", reason: "not-configured", message: "Gemini API key is not configured." };
  }

  const base64 = String(dataUrl || "").replace(/^data:[^,]+,/, "");
  if (!base64) {
    return { ok: false, source: "vision", reason: "bad-response", message: "The uploaded image could not be decoded." };
  }

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: promptFor(examType) },
                { inline_data: { mime_type: mimeType || "image/jpeg", data: base64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(45000),
      }
    );
  } catch (e) {
    return { ok: false, source: "vision", reason: "network", message: `Could not reach the Gemini API (${e.message}).` };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let apiMessage = "";
    try {
      apiMessage = JSON.parse(detail)?.error?.message || "";
    } catch {
      /* non-JSON error body */
    }
    return {
      ok: false,
      source: "vision",
      reason: "provider-error",
      message: `Gemini API responded with HTTP ${res.status}${apiMessage ? `: ${apiMessage}` : "."}`,
    };
  }

  const json = await res.json().catch(() => null);
  const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("");
  if (!text) {
    const block = json?.promptFeedback?.blockReason;
    return {
      ok: false,
      source: "vision",
      reason: "bad-response",
      message: block ? `The image request was blocked (${block}).` : "The Gemini API returned no content.",
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    return { ok: false, source: "vision", reason: "bad-response", message: "Could not read the Gemini response." };
  }

  const subjects = (Array.isArray(parsed.subjects) ? parsed.subjects : [])
    .filter((s) => s && s.subject)
    .map((s) => ({ subject: str(s.subject), grade: str(s.grade) }));

  const candidateName = str(parsed.candidateName);
  const examNumber = str(parsed.examNumber);

  if (parsed.readable === false || (subjects.length === 0 && !candidateName && !examNumber)) {
    return {
      ok: false,
      source: "vision",
      reason: "unreadable",
      message: "The photo could not be read as a result slip. Upload a clearer, well-lit photo.",
    };
  }

  return {
    ok: true,
    source: "gemini",
    sourceLabel: `Gemini vision (${config.geminiModel})`,
    candidateName,
    examNumber,
    examYear: str(parsed.examYear),
    center: str(parsed.center),
    subjects,
  };
}
