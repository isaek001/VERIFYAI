// Kakaverify verification flow — orchestrates token purchase + official
// portal checking so the app can verify exam results end-to-end using only
// KakaVerify credentials (no direct WAEC/NECO institutional API keys needed).
//
// Flow:
//   1. POST KakaVerify /exam/purchase (or /waec/purchase) to obtain a
//      scratch-card PIN / token (wallet debited).
//   2. Use that PIN/token to query the official portal (WAECdirect or
//      NECO e-Verify) via portal.js.
//   3. Normalize the result into the same shape as the direct providers
//      ({ ok, candidateName, examNumber, examYear, center, subjects }).
//
// The returned object feeds directly into the existing comparison engine
// (compare.js) and PDF generator (client/src/lib/pdf.js).

import {
  purchaseExamToken,
  purchaseWaecPin,
} from "./kakaverify.js";
import { checkWaecDirect, checkNecoPortal, checkNabtebPortal } from "./portal.js";
import { config } from "../config.js";

// Pick the best exam type for a board when purchasing a token.
function tokenExamType(board) {
  if (board === "waec") return "waec";
  if (board === "neco") return "neco";
  if (board === "nabteb") return "nabteb";
  return board;
}

// Parse a purchased token string for WAEC scratch-card serial/PIN.
// KakaVerify returns tokens in various formats; try to split serial+pin.
function splitWaecToken(token) {
  const t = String(token || "").trim();
  // Common format: "SERIAL:PIN" or "SERIAL PIN" or two fields.
  if (t.includes(":")) {
    const [serial, pin] = t.split(":");
    return { serial: serial.trim(), pin: pin.trim() };
  }
  const parts = t.split(/\s+/);
  if (parts.length >= 2) {
    return { serial: parts[0].trim(), pin: parts[1].trim() };
  }
  // Single token — assume it is the PIN; serial may come from a separate field.
  return { serial: "", pin: t };
}

// Main entry: verify an exam result via the Kakaverify + portal path.
export async function verifyViaKakaverify({ examType, examNumber, examYear, examSubType = "SSCEINT", phoneNumber } = {}) {
  const board = String(examType || "").toLowerCase().trim();

  if (!board) {
    return { ok: false, source: "kakaverify", reason: "unknown-board", message: "Select an examination board (WAEC, NECO or NABTEB)." };
  }

  // NABTEB has no portal — Kakaverify cannot help here either.
  if (board === "nabteb") {
    return checkNabtebPortal();
  }

  if (!config.kakaverifyApiKey) {
    return { ok: false, source: "kakaverify", reason: "not-configured", message: "KakaVerify API key is not configured." };
  }

  // Step 1: Purchase a token/PIN from KakaVerify.
  let tokenResult;
  try {
    tokenResult = await purchaseExamToken({
      examType: tokenExamType(board),
      quantity: 1,
      phoneNumber,
    });
  } catch (e) {
    return { ok: false, source: "kakaverify", reason: "network", message: `KakaVerify token purchase failed: ${e.message}` };
  }

  if (!tokenResult.ok) {
    return {
      ok: false,
      source: "kakaverify",
      reason: tokenResult.reason || "purchase-failed",
      message: tokenResult.message || "Could not purchase an exam token from KakaVerify.",
    };
  }

  // Step 2: Use the purchased token to check the official portal.
  if (board === "waec") {
    // For WAEC we may need both serial and PIN. Try to split.
    const { serial, pin } = splitWaecToken(tokenResult.token || tokenResult.pin || tokenResult.serial);
    // If KakaVerify returned separate serial/pin fields, prefer those.
    const serialFinal = tokenResult.serial || serial;
    const pinFinal = tokenResult.pin || pin;
    const portalResult = await checkWaecDirect({
      examNumber,
      examYear,
      examType: "NOV/DEC",
      serial: serialFinal,
      pin: pinFinal,
    });
    if (!portalResult.ok) {
      return {
        ...portalResult,
        kakaverify: {
          token: tokenResult.token,
          serial: serialFinal,
          pin: pinFinal,
          requestId: tokenResult.requestId,
          transref: tokenResult.transref,
          amount: tokenResult.amount,
        },
      };
    }
    return {
      ...portalResult,
      kakaverify: {
        token: tokenResult.token,
        serial: serialFinal,
        pin: pinFinal,
        requestId: tokenResult.requestId,
        transref: tokenResult.transref,
        amount: tokenResult.amount,
      },
    };
  }

  if (board === "neco") {
    // NECO e-Verify needs token + payref. KakaVerify returns a token string;
    // the payref may be embedded or may be the same token. Use what we have.
    const token = tokenResult.token || tokenResult.pin || tokenResult.serial;
    const payref = tokenResult.transref || tokenResult.requestId || token;
    const portalResult = await checkNecoPortal({
      examNumber,
      examYear,
      examSubType,
      token,
      payref,
    });
    if (!portalResult.ok) {
      return {
        ...portalResult,
        kakaverify: {
          token,
          payref,
          requestId: tokenResult.requestId,
          transref: tokenResult.transref,
          amount: tokenResult.amount,
        },
      };
    }
    return {
      ...portalResult,
      kakaverify: {
        token,
        payref,
        requestId: tokenResult.requestId,
        transref: tokenResult.transref,
        amount: tokenResult.amount,
      },
    };
  }

  return { ok: false, source: "kakaverify", reason: "unknown-board", message: "Unsupported board for Kakaverify portal check." };
}

export default { verifyViaKakaverify };
