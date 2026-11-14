// Official-result dispatcher.
//
// fetchOfficialResult() is the pluggable seam: the rest of the app only
// ever calls this function and receives the normalized shape below.
//
//   ok: true   -> { source, sourceLabel, candidateName, examNumber,
//                   examYear, center, subjects: [{subject, grade}] }
//   ok: false  -> { source, reason, message }   // not-configured | unavailable |
//                                               // not-found | network | bad-response
//
// Selection follows RESULT_PROVIDER (config.js):
//   auto       -> real provider when configured, demo fixture otherwise
//   fixture    -> always the demo fixture
//   live       -> always the real provider (errors clearly when unconfigured)
//   kakaverify -> KakaVerify token purchase + official portal (costs money)
import { config, configured } from "../config.js";
import fetchWaec from "./waec.js";
import fetchNeco from "./neco.js";
import fetchNabteb from "./nabteb.js";
import fetchFixture from "./fixture.js";
import { verifyViaKakaverify } from "./kakaverify-flow.js";

const BOARDS = {
  waec: { fetch: fetchWaec, configured: () => configured.waec },
  neco: { fetch: fetchNeco, configured: () => configured.neco },
  nabteb: { fetch: fetchNabteb, configured: () => false },
};

export function supportedBoards() {
  return Object.keys(BOARDS);
}

export async function fetchOfficialResult({ examType, examNumber, examYear, examSubType, phoneNumber, nin, gender, serialNumber, pinCode } = {}) {
  const board = String(examType || "").toLowerCase().trim();

  // NABTEB first: its official results API needs no key and can check with a
  // purchased ePIN, so it works in every provider mode (Kakaverify only sells
  // NABTEB tokens — it has no result-check endpoint of its own).
  if (board === "nabteb") {
    return fetchNabteb({ examNumber, examYear, examType: board, examSubType, nin, gender, serialNumber, pinCode });
  }

  // KakaVerify path — strict opt-in via RESULT_PROVIDER=kakaverify.
  // It debits a real wallet balance on every verification, so 'auto' must
  // never reach it: auto falls back to the demo fixture instead.
  const useKakaverify = config.provider === "kakaverify";

  if (useKakaverify && configured.kakaverify) {
    return verifyViaKakaverify({ examType: board, examNumber, examYear, examSubType, phoneNumber });
  }

  const entry = BOARDS[board];
  if (!entry) {
    return { ok: false, source: board || "unknown", reason: "unknown-board", message: "Unknown examination board." };
  }

  const useFixture = config.provider === "fixture" || (config.provider !== "live" && !entry.configured());
  if (useFixture) return fetchFixture({ examType: board, examNumber, examYear });

  return entry.fetch({ examNumber, examYear, examSubType });
}
