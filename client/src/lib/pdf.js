// Generates a verification certificate PDF for a single record.
//
// The certificate carries three blocks the next stage needs on paper:
//   1. RECORD DETAIL       — the saved record itself. Records are saved from
//                            the uploaded document, so this block reflects
//                            what the officer submitted.
//   2. Differences         — the two records side by side: the official
//                            portal record vs the uploaded photo, one row per
//                            field, plus whether each row agrees.
//   3. Check findings      — what the automated check flagged.
//
// Layout is hand-rolled (no autotable) and paginates: `ensure()` opens a
// continuation page before any block runs past the footer reserve.
//
// Returns a Blob (application/pdf) that the caller can download.
import { jsPDF } from "jspdf";

const COMPANY = "VERIFYAI";
const COMPANY_TAG = "Academic & Credential Verification";

const M = 25; // side margin (mm)
const PAGE_W = 210;
const PAGE_H = 297;
const RIGHT = PAGE_W - M; // 185
const BOTTOM = PAGE_H - 50; // 247 — the signature block is reserved below this

const VERDICT_LABEL = {
  match: "Sources agree",
  mismatch: "Discrepancies found",
  incomplete: "Incomplete comparison",
  unavailable: "Official source unavailable",
};

const IDENTITY_STATUS = {
  match: "Match",
  differ: "Differs",
  missing: "Not on photo",
  unknown: "Not compared",
};

const SUBJECT_STATUS = {
  match: "Match",
  differ: "Differs",
  "missing-photo": "Not on photo",
  "missing-official": "Not official",
  unknown: "Not compared",
};

// Ink colour for a comparison status, so a gap reads at a glance.
const TONE = {
  match: [21, 122, 61],
  differ: [176, 42, 42],
  missing: [176, 122, 20],
  "missing-photo": [176, 122, 20],
  "missing-official": [176, 122, 20],
  unknown: [85, 104, 93],
};

const SEVERITY = {
  error: { label: "ERROR", color: [176, 42, 42] },
  warning: { label: "WARNING", color: [176, 122, 20] },
  info: { label: "INFO", color: [85, 104, 93] },
};

export const generateVerificationPdf = (record) => {
  const r = record || {};
  const comparison = r.comparison || null;
  const identity = Array.isArray(comparison?.identity) ? comparison.identity : [];
  const subjects = Array.isArray(comparison?.subjects) ? comparison.subjects : [];
  const status = String(r.status || "");
  const statusKey = status.toLowerCase();
  const verdict = r.verdict || comparison?.verdict || null;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const green = [21, 122, 61];
  const gold = [232, 200, 74];
  const dark = [22, 36, 28];
  const muted = [85, 104, 93];
  const line = [219, 231, 224];

  let y = 0;
  // Set only while the differences table is drawing: a page break inside it
  // must repeat the column header on the new page.
  let drawTableHeader = null;

  // Shrink until the string fits maxW so every cell stays on one line.
  const fit = (text, x, at, maxW, size = 9, min = 6) => {
    const s = String(text ?? "—");
    let fs = size;
    doc.setFontSize(fs);
    while (fs > min && doc.getTextWidth(s) > maxW) {
      fs -= 0.5;
      doc.setFontSize(fs);
    }
    doc.text(s, x, at);
  };

  const newPage = () => {
    doc.addPage();
    doc.setFillColor(green[0], green[1], green[2]);
    doc.rect(0, 0, PAGE_W, 15, "F");
    doc.setFillColor(gold[0], gold[1], gold[2]);
    doc.rect(0, 15, PAGE_W, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(COMPANY, M, 9.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(220, 233, 225);
    doc.text(`Record ${r.candidateId || r.id || ""}`, RIGHT, 9.5, { align: "right" });
    y = 28;
    if (drawTableHeader) drawTableHeader();
  };

  // Open a continuation page when `h` more millimetres would cross the
  // footer reserve.
  const ensure = (h) => {
    if (y + h > BOTTOM) newPage();
  };

  const sectionTitle = (text) => {
    ensure(20);
    doc.setFillColor(green[0], green[1], green[2]);
    doc.rect(M, y - 4.5, 2.2, 6, "F");
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(text, M + 5, y);
    y += 7.5;
  };

  // ---------- Header band ----------
  doc.setFillColor(green[0], green[1], green[2]);
  doc.rect(0, 0, PAGE_W, 46, "F");

  // Gold accent stripe under the green band
  doc.setFillColor(gold[0], gold[1], gold[2]);
  doc.rect(0, 46, PAGE_W, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(COMPANY, PAGE_W / 2, 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(220, 233, 225);
  doc.text(COMPANY_TAG, PAGE_W / 2, 30, { align: "center" });

  doc.setFontSize(8.5);
  doc.text("Verification Certificate", PAGE_W / 2, 40, { align: "center" });

  // ---------- Certificate title ----------
  // The claim has to match the verdict printed underneath it — a record that
  // was escalated must not certify that the candidate is cleared.
  const lede =
    statusKey === "verified"
      ? "This is to certify that the candidate below has been verified and is cleared to move to the next stage."
      : statusKey === "escalated"
        ? "This record was checked against the official source and raised for review. The differences are listed below."
        : "This record was checked against the official source and awaits authorised human review.";

  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Student Verification Certificate", PAGE_W / 2, 66, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  const ledeLines = doc.splitTextToSize(lede, RIGHT - M);
  ledeLines.forEach((ln, i) => doc.text(ln, PAGE_W / 2, 76 + i * 5, { align: "center" }));

  y = 76 + ledeLines.length * 5 + 12;

  // ---------- Record detail ----------
  ensure(34 + 26);
  sectionTitle("RECORD DETAIL");

  const detailPairs = [
    ["Candidate name", r.candidateName],
    ["Record / ID", r.candidateId],
    ["Examination", r.exam],
    ["Exam number", r.examNumber],
    ["Exam year", r.examYear],
    ["Result", r.result],
    ["Status", status],
    ["Comparison", verdict ? VERDICT_LABEL[verdict] || verdict : ""],
    ["Date submitted", r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB") : ""],
    ["Reviewed by", r.reviewedBy],
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");

  // Two label/value columns keep the block to five rows.
  const detailCols = [
    { lx: M, vx: M + 32, vw: 41 },
    { lx: 104, vx: 136, vw: RIGHT - 136 },
  ];

  for (let i = 0; i < detailPairs.length; i += 2) {
    ensure(13);
    if (i + 2 < detailPairs.length) {
      doc.setDrawColor(line[0], line[1], line[2]);
      doc.setLineWidth(0.4);
      doc.line(M, y + 6, RIGHT, y + 6);
    }
    detailPairs.slice(i, i + 2).forEach(([label, value], k) => {
      const c = detailCols[k];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text(String(label).toUpperCase(), c.lx, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(dark[0], dark[1], dark[2]);
      fit(value, c.vx, y, c.vw, 9, 6.5);
    });
    y += 12;
  }

  // ---------- Differences between the two records ----------
  const officialLabel = (r.official && r.official.sourceLabel) || "Official portal record";
  const photoLabel = (r.extracted && r.extracted.sourceLabel) || "Uploaded result photo";

  const colX = [M, 70, 115, 155];
  const colW = [45, 45, 40, 30];
  const HEAD_H = 8;
  const ROW_H = 7;
  const GROUP_H = 6;

  const tableHeader = () => {
    doc.setFillColor(green[0], green[1], green[2]);
    doc.rect(M, y, RIGHT - M, HEAD_H, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    ["FIELD", "OFFICIAL RECORD", "UPLOADED PHOTO", "RESULT"].forEach((h, i) => {
      doc.text(h, colX[i] + 2.5, y + 5.4);
    });
    y += HEAD_H;
  };

  const groupRow = (label) => {
    ensure(GROUP_H + ROW_H);
    doc.setFillColor(238, 243, 240);
    doc.rect(M, y, RIGHT - M, GROUP_H, "F");
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(label, M + 2.5, y + 4.3);
    y += GROUP_H;
  };

  const cellRow = (field, officialValue, photoValue, key, label) => {
    ensure(ROW_H); // may paginate — the table header is redrawn by newPage()
    doc.setTextColor(dark[0], dark[1], dark[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    fit(field, colX[0] + 2.5, y + 4.8, colW[0] - 5, 8, 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    fit(officialValue || "—", colX[1] + 2.5, y + 4.8, colW[1] - 5, 8, 5.5);
    fit(photoValue || "—", colX[2] + 2.5, y + 4.8, colW[2] - 5, 8, 5.5);

    const tone = TONE[key] || muted;
    doc.setTextColor(tone[0], tone[1], tone[2]);
    doc.setFont("helvetica", key === "match" ? "normal" : "bold");
    doc.setFontSize(8);
    doc.text(label, colX[3] + 2.5, y + 4.8);

    doc.setDrawColor(line[0], line[1], line[2]);
    doc.setLineWidth(0.3);
    doc.line(M, y + ROW_H, RIGHT, y + ROW_H);
    y += ROW_H;
  };

  if (identity.length || subjects.length) {
    // One block: heading + caption + first table rows, so a page break never
    // strands the caption away from its table.
    ensure(34 + 24 + HEAD_H + GROUP_H + ROW_H * 2);
    sectionTitle("DIFFERENCES BETWEEN THE TWO RECORDS");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    const caption = `Two records are compared below — ${officialLabel} against ${photoLabel}. Each row shows both values and whether they agree.`;
    const capLines = doc.splitTextToSize(caption, RIGHT - M);
    capLines.forEach((ln, i) => doc.text(ln, M, y + i * 4.5));
    y += capLines.length * 4.5 + 5;

    drawTableHeader = tableHeader;
    tableHeader();

    if (identity.length) {
      groupRow("CANDIDATE DETAILS");
      identity.forEach((row) =>
        cellRow(row.field, row.official, row.photo, row.status, IDENTITY_STATUS[row.status] || row.status)
      );
    }
    if (subjects.length) {
      groupRow("SUBJECTS");
      subjects.forEach((row) =>
        cellRow(row.subject, row.officialGrade, row.photoGrade, row.status, SUBJECT_STATUS[row.status] || row.status)
      );
    }
    drawTableHeader = null;
  } else {
    ensure(34 + 16);
    sectionTitle("DIFFERENCES BETWEEN THE TWO RECORDS");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("No field-by-field comparison was recorded for this record.", M, y);
    y += 9;
  }

  // ---------- Check findings ----------
  const findings = Array.isArray(r.findings) ? r.findings : [];
  ensure(34 + (findings.length ? 26 : 14));
  sectionTitle("CHECK FINDINGS");

  if (!findings.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text("No automated findings were recorded for this record.", M, y);
    y += 9;
  } else {
    for (const f of findings) {
      const sev = SEVERITY[f.severity] || SEVERITY.info;
      const message = String(f.message || "");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(message, RIGHT - M - 17);
      const blockH = Math.max(lines.length * 4.6, 5) + 4.5;
      ensure(blockH);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(sev.color[0], sev.color[1], sev.color[2]);
      doc.text(sev.label, M, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(dark[0], dark[1], dark[2]);
      lines.forEach((ln, i) => doc.text(ln, M + 17, y + i * 4.6));
      y += blockH;
    }
  }

  // ---------- Verification statement ----------
  const name = r.candidateName || "the candidate";
  const cid = r.candidateId || r.id || "—";
  const exam = r.exam || "—";
  const statement =
    statusKey === "verified"
      ? `We confirm that ${name} (Record ID: ${cid}) has undergone document and result verification for "${exam}" and the outcome is "${status}". The candidate is verified and may proceed to the next stage of their application.`
      : statusKey === "escalated"
        ? `We confirm that ${name} (Record ID: ${cid}) has undergone document and result verification for "${exam}". The comparison found the discrepancies listed above and the record is escalated for authorised review.`
        : `We confirm that ${name} (Record ID: ${cid}) has undergone document and result verification for "${exam}". The record is pending authorised human review; the comparison output is listed above.`;

  // Measure first, then reserve the whole block in one go — a break between
  // the heading and its paragraph would strand the heading on its own.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const stLines = doc.splitTextToSize(statement, RIGHT - M);
  ensure(11 + 8 + stLines.length * 5 + 6);

  doc.setDrawColor(line[0], line[1], line[2]);
  doc.setLineWidth(0.4);
  doc.line(M, y, RIGHT, y);
  y += 11;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.text("Verification Statement", M, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  stLines.forEach((ln, i) => doc.text(ln, M, y + i * 5));
  y += stLines.length * 5;

  // ---------- Footer / signature ----------
  const footY = Math.max(PAGE_H - 40, y + 16);
  doc.setDrawColor(line[0], line[1], line[2]);
  doc.setLineWidth(0.4);
  doc.line(M, footY, RIGHT, footY);

  doc.setFontSize(8);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text(`${COMPANY} — Secure Verification Platform`, M, footY + 10);
  doc.text(`Certificate ID: VER-${r.id || r.candidateId || ""}`, M, footY + 16);
  doc.text(`Generated ${new Date().toLocaleDateString("en-GB")}`, RIGHT, footY + 10, {
    align: "right",
  });

  // Signature line
  doc.setLineWidth(0.6);
  doc.line(100, footY + 6, 180, footY + 6);
  doc.setFontSize(8);
  doc.text("Authorised Signatory", 140, footY + 11, { align: "center" });

  return doc.output("blob");
};
