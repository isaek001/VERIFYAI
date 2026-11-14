import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../api.js";
import IntakeForm from "../components/intake/IntakeForm.jsx";
import ComparisonResults from "../components/intake/ComparisonResults.jsx";
import GuidanceCards from "../components/intake/GuidanceCards.jsx";

const EMPTY_FORM = {
  examType: "waec",
  examNumber: "",
  examYear: "",
  examSubType: "SSCEINT",
  nin: "",
  serialNumber: "",
  pinCode: "",
};

const BOARD_LABEL = { waec: "WAEC WASSCE", neco: "NECO SSCE", nabteb: "NABTEB" };

const VERDICT_TOAST = {
  match: "Comparison complete — both sources agree. Review before saving.",
  mismatch: "Comparison found discrepancies — review the differences below.",
  incomplete: "Comparison finished, but some fields need manual confirmation.",
  unavailable: "The official source is unavailable — only the photo was captured.",
};

// Dynamic validation: only fields the officer has touched (or that blocked
// a submit) show errors; every error clears as soon as the field changes.
function validate(form, image) {
  const errors = {};
  const number = form.examNumber.trim();
  if (!number) errors.examNumber = "Enter the student's exam number.";
  else if (number.length < 4) errors.examNumber = "Exam numbers have at least 4 characters.";
  if (!/^\d{4}$/.test(form.examYear.trim())) {
    errors.examYear = "Enter the four-digit examination year, e.g. 2024.";
  }
  if (!image) errors.image = "Upload a photo of the physical result.";
  return errors;
}

const mimeOf = (dataUrl) => {
  const m = /^data:([^;,]+)/.exec(dataUrl || "");
  return m ? m[1] : "image/jpeg";
};

export default function NewVerification() {
  const { onToast, onRecordCreated, onNavigate } = useOutletContext();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fileName, setFileName] = useState("");
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const setField = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((errs) => (errs[key] ? { ...errs, [key]: undefined } : errs));
  };

  const clearForm = () => {
    setForm(EMPTY_FORM);
    setFileName("");
    setImage(null);
    setResult(null);
    setErrors({});
  };

  const handleImage = (dataUrl) => {
    setImage(dataUrl);
    setFileName((name) => name || "result-photo.jpg");
    setErrors((errs) => (errs.image ? { ...errs, image: undefined } : errs));
  };

  const runVerify = async () => {
    const found = validate(form, image);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      onToast("Fix the highlighted fields, then try again.");
      return;
    }

    setBusy(true);
    try {
      const data = await api.verify({
        examType: form.examType,
        examNumber: form.examNumber.trim(),
        examYear: form.examYear.trim(),
        examSubType: form.examType === "nabteb" && form.examSubType === "SSCEINT" ? "MJ" : form.examSubType,
        nin: form.nin.trim(),
        serialNumber: form.serialNumber.trim(),
        pinCode: form.pinCode.trim(),
        image,
        mimeType: mimeOf(image),
      });
      setResult(data);
      onToast(VERDICT_TOAST[data.comparison.verdict] || VERDICT_TOAST.incomplete);
    } catch (e) {
      onToast(e.message || "Verification is unavailable right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    const { official, extracted, comparison, summary, status } = result;
    const examNumber = form.examNumber.trim();

    const yearSuffix = form.examYear.trim() ? ` · ${form.examYear.trim()}` : "";
    const subtypeSuffix = form.examType === "neco" ? ` (${form.examSubType === "SSCEEXT" ? "External" : "Internal"})` : "";
    const examLabel = `${BOARD_LABEL[form.examType]}${subtypeSuffix}${yearSuffix}`;

    const candidateName = official?.ok
      ? official.candidateName
      : extracted?.ok
        ? extracted.candidateName
        : "";

    setBusy(true);
    try {
      await api.createRecord({
        candidateId: examNumber,
        candidateName,
        exam: examLabel,
        result: summary,
        findings: comparison.findings,
        sourceText: "",
        status,
        examType: form.examType,
        examNumber,
        examYear: form.examYear.trim(),
        examSubType: form.examSubType,
        official,
        extracted,
        comparison,
        verdict: comparison.verdict,
        image,
      });
      onToast(
        status === "Escalated"
          ? "Record saved and escalated for further attention."
          : "Record submitted for authorised human review."
      );
      clearForm();
      onRecordCreated();
      onNavigate("/archive");
    } catch (e) {
      onToast(e.message || "Could not save this record. Check the service connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">WORKSPACE / INTAKE</div>
          <h1>New results verification</h1>
          <p className="lede">Enter the student's exam number and upload their physical result for comparison.</p>
        </div>
        <div className="step-pill">
          <span>01</span> Capture details
        </div>
      </div>

      <IntakeForm
        form={form}
        setField={setField}
        errors={errors}
        fileName={fileName}
        onFileName={setFileName}
        onImage={handleImage}
        onToast={onToast}
        onClear={clearForm}
        onRun={runVerify}
        busy={busy}
      />

      {result && <ComparisonResults result={result} busy={busy} onSave={save} />}

      <GuidanceCards analysisDone={!!result} />
    </>
  );
}
