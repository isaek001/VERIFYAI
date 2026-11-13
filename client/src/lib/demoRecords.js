// Fallback records used only when the records API is unreachable.
export const DEMO_RECORDS = [
  {
    id: "demo-001",
    candidateId: "DEMO-2026-001",
    candidateName: "Ada Example",
    exam: "National Skills Assessment",
    result: "78",
    status: "Pending review",
    findings: [{ severity: "info", message: "Sample record — compare with the source document." }],
    createdAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
  },
  {
    id: "demo-002",
    candidateId: "DEMO-2026-002",
    candidateName: "Tunde Sample",
    exam: "Technical Certification",
    result: "A",
    status: "Verified",
    findings: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    reviewedBy: "Demo Officer",
  },
  {
    id: "demo-003",
    candidateId: "DEMO-2026-003",
    candidateName: "Grace Placeholder",
    exam: "National Skills Assessment",
    result: "—",
    status: "Escalated",
    findings: [{ severity: "warning", message: "Result value is missing in this demonstration record." }],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 21).toISOString(),
  },
];
