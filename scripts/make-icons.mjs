// Renders the jelly-blob app icons with no dependencies: a per-pixel shader plus a
// hand-rolled PNG encoder (zlib). Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/public/icons");
mkdirSync(out, { recursive: true });

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const INK = hex("#1B1638"), PLUM = hex("#3A2A6B"), LAGOON = hex("#38D6B8"), DEEP = [28, 143, 134], MINT = [153, 255, 232];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
const smooth = (t) => t * t * (3 - 2 * t);

// Coordinates are in a 64-unit box (same drawing as the favicon).
const inEllipse = (x, y, cx, cy, rx, ry, rot = 0) => {
  const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dy = y - cy;
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
};
// Blob: dome on top, flat-ish rounded base. Width 40, from y=20 to y=52.
const inBlob = (x, y) => {
  if (y > 52 || y < 20) return false;
  if (y <= 46) return inEllipse(x, y, 32, 46, 20, 26); // upper dome
  const r = 6; // rounded lower corners
  const dx = Math.max(0, Math.abs(x - 32) - (20 - r));
  return dx * dx + Math.max(0, y - (52 - r)) ** 2 <= r * r && Math.abs(x - 32) <= 20;
};

// scale: how much of the canvas the 64-unit drawing fills. Maskable keeps it in the safe zone.
function render(size, { maskable }) {
  const scale = maskable ? 0.62 : 0.86;
  const px = Buffer.alloc(size * size * 4);
  const SS = 3;
  for (let py = 0; py < size; py++) for (let pxl = 0; pxl < size; pxl++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (pxl + (sx + 0.5) / SS) / size, v = (py + (sy + 0.5) / SS) / size;
      // Background: rounded tile (regular) or full bleed (maskable).
      let alpha = 1;
      if (!maskable) {
        const cr = 0.22, dx = Math.max(0, Math.abs(u - 0.5) - (0.5 - cr)), dy = Math.max(0, Math.abs(v - 0.5) - (0.5 - cr));
        alpha = dx * dx + dy * dy <= cr * cr ? 1 : 0;
      }
      if (!alpha) continue;
      let col = mix(INK, PLUM, Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.35) * 1.4) * 0.8);
      // Into 64-space.
      const x = 32 + (u - 0.5) * 64 / scale, y = 32 + (v - 0.5) * 64 / scale;
      // soft glow under the blob
      col = mix(col, LAGOON, Math.max(0, 1 - Math.hypot(x - 32, (y - 50) * 1.6) / 30) * 0.18);
      if (inBlob(x, y)) {
        const t = Math.hypot(x - 24, y - 30) / 34;
        col = t < 0.55 ? mix(MINT, LAGOON, t / 0.55) : mix(LAGOON, DEEP, (t - 0.55) / 0.45);
        if (inEllipse(x, y, 25, 38, 4, 5.5) || inEllipse(x, y, 39, 38, 4, 5.5)) col = INK;
        if (Math.hypot(x - 26.4, y - 36) <= 1.6 || Math.hypot(x - 40.4, y - 36) <= 1.6) col = [255, 255, 255];
        if (inEllipse(x, y, 24, 28, 5, 2.6, -25 * Math.PI / 180)) col = mix(col, [255, 255, 255], 0.5);
      }
      r += col[0]; g += col[1]; b += col[2]; a += 1;
    }
    const i = (py * size + pxl) * 4, n = SS * SS;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
    px[i + 3] = Math.round((a / n) * 255);
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const jobs = [
  ["icon-192.png", 192, false], ["icon-512.png", 512, false],
  ["maskable-192.png", 192, true], ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
];
for (const [name, size, maskable] of jobs) {
  writeFileSync(resolve(out, name), png(size, render(size, { maskable })));
  console.log("wrote", name);
}
