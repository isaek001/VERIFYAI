// NABTEB — no public result API exists.
//
// The only candidate (nabtebdemoapi.nabteb.gov.ng) has been offline for
// some time (the host no longer resolves). Return an explicit, stable
// "unavailable" outcome so the UI can tell the officer exactly why the
// official side of the comparison is missing.
export default async function fetchNabteb() {
  return {
    ok: false,
    source: "nabteb-official",
    reason: "unavailable",
    message:
      "NABTEB has no public result API. The photo will be recorded and checked manually during human review.",
  };
}
