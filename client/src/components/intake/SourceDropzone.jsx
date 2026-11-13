import { useRef } from "react";
import { Icon, icons } from "../Icon.jsx";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "text/plain"];
const MAX_EDGE = 1280;

// Reads an image file and downscales it so the payload stays small.
async function prepareImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function SourceDropzone({
  fileName,
  onFileName,
  onImage,
  onText,
  onToast,
  imagesOnly = false,
  title = "Upload result document or image",
  hint = "PNG, JPG, WEBP or TXT · image OCR supported",
}) {
  const inputRef = useRef(null);

  const accept = imagesOnly ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,text/plain";
  const types = imagesOnly ? ["image/png", "image/jpeg", "image/webp"] : ACCEPTED_TYPES;

  const handleFile = async (file) => {
    if (!file) return;
    if (!types.includes(file.type)) {
      onToast(imagesOnly ? "Use a PNG, JPG or WEBP photo of the result." : "Use a PNG, JPG, WEBP image or a plain text file.");
      return;
    }
    onFileName(file.name);
    if (!imagesOnly && file.type === "text/plain") {
      onText(await file.text());
      return;
    }
    try {
      onImage(await prepareImage(file));
    } catch {
      onToast("Could not prepare this image. Try a clearer JPG or PNG.");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className="dropzone"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
    >
      <div className="drop-icon">
        <Icon d={icons.upload} size={20} />
      </div>
      <strong>{title}</strong>
      <span>{hint}</span>
      <span className="browse">Browse files</span>
      {fileName && <span className="file-name">{fileName}</span>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => handleFile(e.target.files?.[0])}
        hidden
      />
    </div>
  );
}
