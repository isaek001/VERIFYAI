// Generates the PWA icon set (pure Node — no image dependencies).
//
// Output (into client/public/icons/):
//   icon-192.png            192x192  any purpose
//   icon-512.png            512x512  any purpose
//   icon-maskable-512.png   512x512  maskable (checkmark inside safe zone)
//   apple-touch-icon.png    180x180  iOS home screen
//   favicon-32.png           32x32   browser tab
//
// Design: full-bleed brand-green vertical gradient with a bold white
// checkmark (rounded caps). Full bleed = correct for maskable AND for
// iOS, which rejects transparency behind the home-screen icon.
//
// Run: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "client", "public", "icons");

const SS = 4; // supersampling factor for anti-aliasing
const TOP = [23, 135, 72]; // #178748
const BOTTOM = [14, 92, 47]; // #0e5c2f

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing ---------------------------------------------------------------

// Distance from point p to segment ab (for thick, round-capped strokes).
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Renders `size` px icon (full-bleed gradient + white checkmark).
// checkScale shrinks the checkmark (for the maskable safe zone).
function renderIcon(size, checkScale = 1) {
  const S = size * SS;
  const canvas = Buffer.alloc(S * S * 3);

  // Checkmark geometry in unit coords (y down), scaled about the centre.
  const cx = 0.51;
  const cy = 0.515;
  const pts = [
    [0.3, 0.53],
    [0.45, 0.68],
    [0.72, 0.35],
  ].map(([x, y]) => [cx + (x - cx) * checkScale, cy + (y - cy) * checkScale]);
  const halfW = (0.066 * checkScale * size) / size; // half thickness in unit px
  const a = pts[0];
  const b = pts[1];
  const c = pts[2];

  for (let y = 0; y < S; y++) {
    const gy = y / (S - 1);
    const gr = TOP[0] + (BOTTOM[0] - TOP[0]) * gy;
    const gg = TOP[1] + (BOTTOM[1] - TOP[1]) * gy;
    const gb = TOP[2] + (BOTTOM[2] - TOP[2]) * gy;
    for (let x = 0; x < S; x++) {
      const ux = x / S + 0.5 / S; // unit coords of pixel centre
      const uy = y / S + 0.5 / S;
      const d = Math.min(
        distToSeg(ux, uy, a[0], a[1], b[0], b[1]),
        distToSeg(ux, uy, b[0], b[1], c[0], c[1])
      );
      const on = d <= halfW;
      const i = (y * S + x) * 3;
      if (on) {
        canvas[i] = 255;
        canvas[i + 1] = 255;
        canvas[i + 2] = 255;
      } else {
        canvas[i] = gr;
        canvas[i + 1] = gg;
        canvas[i + 2] = gb;
      }
    }
  }

  // Box-downsample the supersampled canvas.
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 3;
          r += canvas[i];
          g += canvas[i + 1];
          bl += canvas[i + 2];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(bl / n);
    }
  }
  return encodePNG(size, size, out);
}

// --- Generate --------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  ["icon-maskable-512.png", 512, 0.76], // smaller check = safe zone
  ["apple-touch-icon.png", 180, 1],
  ["favicon-32.png", 32, 1],
];
for (const [name, size, scale] of targets) {
  const png = renderIcon(size, scale);
  writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}
