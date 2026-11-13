// Generates a one-page verification certificate PDF for a single record.
// Returns a Blob (application/pdf) that the caller can download.
import { jsPDF } from "jspdf";

const COMPANY = "VERIFYAI";
const COMPANY_TAG = "Academic & Credential Verification";

export const generateVerificationPdf = (record) => {
  const {
    candidateId,
    candidateName,
    exam,
    result,
    status,
    createdAt,
    id,
  } = record;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = doc.internal.pageSize.getWidth(); // 210 mm
  const pageH = doc.internal.pageSize.getHeight(); // 297 mm
  const cx = pageW / 2;
  const green = [21, 122, 61];
  const dark = [22, 36, 28];
  const muted = [85, 104, 93];
  const line = [219, 231, 224];

  // ---------- Header band ----------
  doc.setFillColor(green[0], green[1], green[2]);
  doc.rect(0, 0, pageW, 46, "F");

  // Gold accent stripe under the green band
  doc.setFillColor(232, 200, 74);
  doc.rect(0, 46, pageW, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY, cx, 20, { align: "center" });

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 233, 225);
  doc.text(COMPANY_TAG, cx, 30, { align: "center" });

  doc.setFontSize(8.5);
  doc.text("Verification Certificate", cx, 40, { align: "center" });

  // ---------- Certificate title ----------
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text("Student Verification Certificate", cx, 66, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(
    "This is to certify that the candidate below has been verified and is cleared to move to the next stage.",
    cx,
    76,
    { align: "center" }
  );

  // ---------- Details table ----------
  const startY = 92;
  const rowH = 11;
  const labelX = 30;
  const valueX = 95;

  const rows = [
    ["Candidate Name", candidateName || "—"],
    ["Record / ID", candidateId || "—"],
    ["Examination", exam || "—"],
    ["Result", result || "—"],
    ["Status", status || "—"],
    ["Date Submitted", createdAt ? new Date(createdAt).toLocaleDateString("en-GB") : "—"],
  ];

  doc.setFontSize(8.5);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.setFont("helvetica", "bold");

  let y = startY;
  rows.forEach(([label, value]) => {
    // field divider line
    if (y > startY) {
      doc.setDrawColor(line[0], line[1], line[2]);
      doc.setLineWidth(0.4);
      doc.line(25, y - 3, pageW - 25, y - 3);
    }
    doc.text(label, labelX, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.text(String(value), valueX, y, { maxWidth: pageW - valueX - 25 });
    // reset to label style
    doc.setFont("helvetica", "bold");
    doc.setTextColor(muted[0], muted[1], muted[2]);
    y += rowH;
  });

  // ---------- Verification statement ----------
  const stmtY = y + 10;
  doc.setDrawColor(line[0], line[1], line[2]);
  doc.setLineWidth(0.4);
  doc.line(25, stmtY - 4, pageW - 25, stmtY - 4);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text("Verification Statement", 25, stmtY + 7);

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(muted[0], muted[1], muted[2]);
  const statement =
    `We confirm that ${candidateName || "the candidate"} (Record ID: ${
      candidateId || "—"
    }) has undergone document and result verification for "${exam ||
      "—"}" and the outcome is "${status || "—"}". The candidate is verified and may proceed to the next stage of their application.`;
  doc.text(statement, 25, stmtY + 18, { maxWidth: pageW - 50 });

  // ---------- Footer / signature ----------
  const footY = pageH - 40;
  doc.setDrawColor(line[0], line[1], line[2]);
  doc.setLineWidth(0.4);
  doc.line(25, footY, pageW - 25, footY);

  doc.setFontSize(8);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(`${COMPANY} — Secure Verification Platform`, 25, footY + 10);
  doc.text(`Certificate ID: VER-${id || candidateId || ""}`, 25, footY + 16);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-GB")}`,
    pageW - 25,
    footY + 10,
    { align: "right" }
  );

  // Signature line
  doc.setLineWidth(0.6);
  doc.line(pageW - 110, footY + 6, pageW - 30, footY + 6);
  doc.setFontSize(8);
  doc.text("Authorised Signatory", pageW - 70, footY + 11, { align: "center" });

  return doc.output("blob");
};
