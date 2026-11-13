import { Icon, icons } from "../Icon.jsx";
import SourceDropzone from "./SourceDropzone.jsx";
import { WarnBox } from "../Notice.jsx";

const BOARDS = [
  { value: "waec", label: "WAEC" },
  { value: "neco", label: "NECO" },
  { value: "nabteb", label: "NABTEB" },
];

const NECO_SUBTYPES = [
  { value: "SSCEINT", label: "Internal" },
  { value: "SSCEEXT", label: "External" },
];

function Field({ label, required, placeholder, value, onChange, error, hint, inputMode, maxLength }) {
  return (
    <label className="field">
      <span className="field-label">
        {label} {required && <em>*</em>}
      </span>
      <input
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? "true" : undefined}
      />
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

function Segments({ legend, required, name, options, value, onChange }) {
  return (
    <fieldset className="field segments-field">
      <legend className="field-label">
        {legend} {required && <em>*</em>}
      </legend>
      <div className="segment-row">
        {options.map((o) => (
          <label key={o.value} className={`segment ${value === o.value ? "on" : ""}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={onChange} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function IntakeForm({
  form,
  setField,
  errors = {},
  fileName,
  onFileName,
  onImage,
  onToast,
  onClear,
  onRun,
  busy,
}) {
  const needsYear = form.examType === "waec" || form.examType === "neco";

  return (
    <div className="panel form-panel">
      <div className="panel-head">
        <div>
          <h2>Student and examination details</h2>
          <p className="muted">Enter the exam number exactly as printed, then upload the physical result.</p>
        </div>
        <Icon d={icons.file} size={22} className="panel-head-icon" />
      </div>

      <div className="field-grid">
        <Segments
          legend="Examination board"
          required
          name="examType"
          options={BOARDS}
          value={form.examType}
          onChange={setField("examType")}
        />
        {form.examType === "neco" && (
          <Segments
            legend="Exam type"
            name="examSubType"
            options={NECO_SUBTYPES}
            value={form.examSubType}
            onChange={setField("examSubType")}
          />
        )}
        <Field
          label="Student exam number"
          required
          placeholder={form.examType === "neco" ? "e.g. 1234567890AB" : "e.g. 4251212055"}
          value={form.examNumber}
          onChange={setField("examNumber")}
          error={errors.examNumber}
          hint={!errors.examNumber ? "The number printed on the result slip." : undefined}
        />
        <Field
          label="Examination year"
          required={needsYear}
          placeholder="e.g. 2024"
          value={form.examYear}
          onChange={setField("examYear")}
          error={errors.examYear}
          hint={!errors.examYear && needsYear ? "Needed to query the official record." : undefined}
          inputMode="numeric"
          maxLength={4}
        />
      </div>

      {form.examType === "nabteb" && (
        <WarnBox>NABTEB has no public result API — the official comparison source is unavailable and every NABTEB record goes to manual review.</WarnBox>
      )}

      <div className="field-label group-label">
        PHYSICAL RESULT <span className="optional">Required</span>
      </div>
      <SourceDropzone
        imagesOnly
        title="Upload a photo of the physical result"
        hint="PNG, JPG or WEBP · well lit, all subjects visible"
        fileName={fileName}
        onFileName={onFileName}
        onImage={onImage}
        onToast={onToast}
      />
      {errors.image && <span className="field-error drop-error">{errors.image}</span>}

      <div className="form-actions">
        <button className="btn ghost" onClick={onClear}>
          Clear form
        </button>
        <button className="btn primary" onClick={onRun} disabled={busy}>
          <Icon d={icons.sparkles} size={16} /> {busy ? "Comparing..." : "Fetch official result & compare"}
        </button>
      </div>
    </div>
  );
}
