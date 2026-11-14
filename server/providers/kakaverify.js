// KakaVerify.ng API provider (https://developers.kakaverify.ng).
//
// KakaVerify sells WAEC scratch cards, NECO tokens, JAMB PINs, etc. This
// provider handles token/PIN purchasing and wallet queries so the rest of
// the app can obtain the credentials needed to check official board portals.
//
// Base endpoint: https://www.app.kakaverify.ng/auth/api/v1
// Auth:          Authorization: Bearer <API_KEY>
// Billing:       Wallet-based (debit on purchase).

import { config } from "../config.js";

const BASE = config.kakaverifyBaseUrl;

function headers() {
  return {
    Authorization: `Bearer ${config.kakaverifyApiKey}`,
    "Content-Type": "application/json",
  };
}

async function call(path, { method = "POST", body = null, timeoutMs = 20000 } = {}) {
  if (!config.kakaverifyApiKey) {
    return { ok: false, reason: "not-configured", message: "KakaVerify API key is not configured." };
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { ok: false, reason: "network", message: `Could not reach KakaVerify (${e.message}).` };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.message || json?.error || `KakaVerify responded with HTTP ${res.status}.`;
    const notFound = res.status === 404 || /not found|invalid/i.test(String(msg));
    return { ok: false, reason: notFound ? "not-found" : "bad-response", status: res.status, message: String(msg), body: json };
  }
  return { ok: true, status: res.status, body: json };
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export async function fetchWalletBalance() {
  const r = await call("/wallet/balance", { method: "GET" });
  if (!r.ok) return r;
  const b = r.body?.data ?? r.body;
  return {
    ok: true,
    source: "kakaverify",
    sourceLabel: "KakaVerify Wallet",
    mainBalance: b?.main_balance ?? b?.mainBalance ?? b?.balance ?? null,
    referralBalance: b?.referral_balance ?? b?.referralBalance ?? null,
    currency: b?.currency || "NGN",
    raw: r.body,
  };
}

export async function fetchWalletHistory({ limit = 50 } = {}) {
  const r = await call(`/wallet/history?limit=${encodeURIComponent(limit)}`, { method: "GET" });
  if (!r.ok) return r;
  return { ok: true, source: "kakaverify", records: r.body?.data ?? r.body ?? [], raw: r.body };
}

// ---------------------------------------------------------------------------
// Exam tokens / PINs
// ---------------------------------------------------------------------------

// POST /exam/purchase — buy WAEC scratch card, NECO token, JAMB PIN, etc.
// exam_type: waec | neco | nabteb | waec_nysc | nbais
export async function purchaseExamToken({ examType, quantity = 1, phoneNumber }) {
  const phone = String(phoneNumber || config.kakaverifyPhone || "").trim();
  if (!phone) {
    return { ok: false, reason: "missing-phone", message: "A recipient phone number is required to receive the token." };
  }
  const r = await call("/exam/purchase", {
    body: {
      exam_type: String(examType || "").toLowerCase().trim(),
      quantity: Math.max(1, Math.min(100, Number(quantity) || 1)),
      phone_number: phone,
    },
  });
  if (!r.ok) return r;
  const d = r.body?.data ?? r.body;
  return {
    ok: true,
    source: "kakaverify",
    sourceLabel: "KakaVerify Exam Token",
    examType: String(examType || "").toLowerCase().trim(),
    quantity: Number(quantity) || 1,
    phoneNumber: phone,
    token: d?.token || d?.pin || d?.serial || null,
    serial: d?.serial || null,
    pin: d?.pin || null,
    requestId: d?.request_id || d?.requestId || d?.id || null,
    transref: d?.transref || d?.trans_ref || null,
    amount: d?.amount ?? d?.price ?? null,
    message: d?.message || null,
    raw: r.body,
  };
}

// POST /waec/purchase — buy a WAEC Registration PIN (WASSCE Private Candidates).
export async function purchaseWaecPin({ phone, variationCode = "waec-registraion" } = {}) {
  const p = String(phone || config.kakaverifyPhone || "").trim();
  if (!p) {
    return { ok: false, reason: "missing-phone", message: "A phone number is required to receive the WAEC PIN." };
  }
  const r = await call("/waec/purchase", {
    body: { phone: p, variation_code: variationCode },
  });
  if (!r.ok) return r;
  const d = r.body?.data ?? r.body;
  return {
    ok: true,
    source: "kakaverify",
    sourceLabel: "KakaVerify WAEC PIN",
    phone: p,
    variationCode,
    pin: d?.pin || d?.token || d?.serial || null,
    serial: d?.serial || null,
    requestId: d?.request_id || d?.requestId || d?.id || null,
    transref: d?.transref || d?.trans_ref || null,
    amount: d?.amount ?? d?.price ?? null,
    message: d?.message || null,
    raw: r.body,
  };
}

// GET /waec/packages — list active WAEC ePIN packages and prices.
export async function fetchWaecPackages() {
  const r = await call("/waec/packages", { method: "GET" });
  if (!r.ok) return r;
  return { ok: true, source: "kakaverify", packages: r.body?.data ?? r.body ?? [], raw: r.body };
}

// GET /waec/status — check vending status of WAEC ePIN orders.
export async function fetchWaecStatus({ requestId, transref, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (requestId) params.set("request_id", String(requestId));
  if (transref) params.set("transref", String(transref));
  params.set("limit", String(limit));
  const r = await call(`/waec/status?${params.toString()}`, { method: "GET" });
  if (!r.ok) return r;
  return { ok: true, source: "kakaverify", status: r.body?.data ?? r.body ?? [], raw: r.body };
}

// GET /jamb/packages — list active JAMB packages.
export async function fetchJambPackages() {
  const r = await call("/jamb/packages", { method: "GET" });
  if (!r.ok) return r;
  return { ok: true, source: "kakaverify", packages: r.body?.data ?? r.body ?? [], raw: r.body };
}

// POST /jamb/verify — verify a 10-digit JAMB Profile Code and get the name.
export async function verifyJambProfile({ profileId, variationCode = "utme-mock" }) {
  const r = await call("/jamb/verify", {
    body: { profile_id: String(profileId || "").trim(), variation_code: variationCode },
  });
  if (!r.ok) return r;
  const d = r.body?.data ?? r.body;
  return {
    ok: true,
    source: "kakaverify",
    sourceLabel: "KakaVerify JAMB Profile",
    profileId: String(profileId || "").trim(),
    variationCode,
    candidateName: d?.candidate_name || d?.candidateName || d?.name || "",
    raw: r.body,
  };
}

// POST /jamb/purchase — purchase a JAMB ePIN for a profile code.
export async function purchaseJambPin({ profileId, variationCode = "utme-mock", phone, customerName = "" }) {
  const p = String(phone || config.kakaverifyPhone || "").trim();
  if (!p) {
    return { ok: false, reason: "missing-phone", message: "A phone number is required to receive the JAMB PIN." };
  }
  const body = { profile_id: String(profileId || "").trim(), variation_code: variationCode, phone: p };
  if (customerName) body.customer_name = String(customerName);
  const r = await call("/jamb/purchase", { body });
  if (!r.ok) return r;
  const d = r.body?.data ?? r.body;
  return {
    ok: true,
    source: "kakaverify",
    sourceLabel: "KakaVerify JAMB PIN",
    profileId: String(profileId || "").trim(),
    variationCode,
    phone: p,
    pin: d?.pin || d?.token || d?.epin || null,
    requestId: d?.request_id || d?.requestId || d?.id || null,
    transref: d?.transref || d?.trans_ref || null,
    amount: d?.amount ?? d?.price ?? null,
    message: d?.message || null,
    raw: r.body,
  };
}

// GET /jamb/status — check JAMB purchase status.
export async function fetchJambStatus({ requestId, transref, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (requestId) params.set("request_id", String(requestId));
  if (transref) params.set("transref", String(transref));
  params.set("limit", String(limit));
  const r = await call(`/jamb/status?${params.toString()}`, { method: "GET" });
  if (!r.ok) return r;
  return { ok: true, source: "kakaverify", status: r.body?.data ?? r.body ?? [], raw: r.body };
}

// ---------------------------------------------------------------------------
// Convenience: buy a token for the given board and return it in a shape the
// rest of the verification flow can consume directly.
// ---------------------------------------------------------------------------

export async function purchaseBoardToken({ examType, examNumber, examYear, phoneNumber } = {}) {
  const board = String(examType || "").toLowerCase().trim();
  const tokenResult = await purchaseExamToken({ examType: board, quantity: 1, phoneNumber });
  if (!tokenResult.ok) return tokenResult;
  return {
    ...tokenResult,
    examNumber: String(examNumber || "").trim(),
    examYear: String(examYear || "").trim(),
    board,
  };
}

export default {
  fetchWalletBalance,
  fetchWalletHistory,
  purchaseExamToken,
  purchaseWaecPin,
  fetchWaecPackages,
  fetchWaecStatus,
  fetchJambPackages,
  verifyJambProfile,
  purchaseJambPin,
  fetchJambStatus,
  purchaseBoardToken,
};
