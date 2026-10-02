/**
 * Room dressing: wallpaper washes, rugs, hanging lamps and wall art. Everything is drawn over the base
 * room (never replacing it), so an empty setup draws nothing and the default room is untouched.
 * The scene calls the four draw hooks; the wardrobe reuses the same Decor for its live preview.
 */
import type { Layout } from "./room.js";
import { P, clamp, drawGlow, ellipse, mulberry, rrect } from "./util.js";

type Ctx = CanvasRenderingContext2D;
export interface Room { wallpaper?: string; rug?: string; lamp?: string; wall?: string }
export interface Off { x: number; y: number }

const TAU = Math.PI * 2;

function mk(L: Layout): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = Math.ceil((L.W + L.M * 2) * L.dpr);
  c.height = Math.ceil((L.H + L.M * 2) * L.dpr);
  const g = c.getContext("2d")!;
  g.scale(L.dpr, L.dpr);
  g.translate(L.M, L.M);
  return [c, g];
}

const lin = (g: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient => {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
};

function star(g: Ctx, x: number, y: number, r: number, inner = 0.46, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
function sparkle(g: Ctx, x: number, y: number, r: number): void {
  g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.closePath();
}

/* ---- wallpapers ------------------------------------------------------------ */

const WASH: Record<string, { color: string; a: number }> = {
  "wp-lagoon": { color: "#23c4ad", a: 0.8 },
  "wp-peach": { color: "#ff8e6e", a: 0.78 },
  "wp-midnight": { color: "#2b3494", a: 0.85 },
};

function paintPattern(g: Ctx, id: string, x0: number, y0: number, w: number, h: number, U: number): void {
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  if (id === "wp-lagoon") {
    const step = 34 * Math.max(0.8, U * 0.8);
    g.fillStyle = "rgba(236,255,250,0.13)";
    for (let x = x0 - step; x < x0 + w + step; x += step) g.fillRect(x, y0, step * 0.42, h);
    g.fillStyle = "rgba(255,255,255,0.28)";
    for (let x = x0 - step; x < x0 + w + step; x += step) g.fillRect(x + step * 0.42, y0, 1.6, h);
    // little waves between the stripes
    g.strokeStyle = "rgba(255,255,255,0.16)"; g.lineWidth = 1.4 * Math.max(1, U * 0.8);
    for (let y = y0 + step * 0.6; y < y0 + h; y += step * 0.9) {
      g.beginPath();
      for (let x = x0; x <= x0 + w; x += 4) { const yy = y + Math.sin((x / step) * Math.PI * 2) * 2.6 * U; if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy); }
      g.stroke();
    }
  } else if (id === "wp-peach") {
    const step = 30 * Math.max(0.85, U * 0.85);
    let row = 0;
    for (let y = y0 + step * 0.4; y < y0 + h + step; y += step * 0.62, row++) {
      for (let x = x0 - step + (row % 2 ? step / 2 : 0); x < x0 + w + step; x += step) {
        g.fillStyle = "rgba(255,246,226,0.34)"; g.beginPath(); g.arc(x, y, step * 0.15, 0, TAU); g.fill();
        g.fillStyle = "rgba(255,255,255,0.32)"; g.beginPath(); g.arc(x - step * 0.04, y - step * 0.05, step * 0.04, 0, TAU); g.fill();
      }
    }
  } else if (id === "wp-midnight") {
    const r = mulberry(11);
    const n = Math.round((w * h) / 4200);
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * w, y = y0 + r() * h, s = (0.7 + r() * 1.5) * Math.max(0.9, U * 0.9);
      const big = r() < 0.16;
      g.fillStyle = r() < 0.55 ? "rgba(255,229,143,0.85)" : "rgba(236,233,255,0.8)";
      if (big) { sparkle(g, x, y, s * 3.6); g.fill(); } else { g.beginPath(); g.arc(x, y, s * 0.7, 0, TAU); g.fill(); }
    }
    // a very soft moon-haze
    const hz = g.createRadialGradient(x0 + w * 0.82, y0 + h * 0.1, 0, x0 + w * 0.82, y0 + h * 0.1, w * 0.3);
    hz.addColorStop(0, "rgba(180,190,255,0.28)"); hz.addColorStop(1, "rgba(180,190,255,0)");
    g.fillStyle = hz; g.fillRect(x0, y0, w, h);
  }
  g.restore();
}

function paintWallpaper(g: Ctx, L: Layout, id: string): void {
  const wash = WASH[id];
  if (!wash) return;
  const { W, M, floorY, U } = L;
  g.save();
  g.beginPath();
  g.rect(-M, -M, W + M * 2, floorY + M);
  g.clip();
  g.globalCompositeOperation = "color";
  g.globalAlpha = wash.a; g.fillStyle = wash.color; g.fillRect(-M, -M, W + M * 2, floorY + M);
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
  paintPattern(g, id, -M, -M, W + M * 2, floorY + M, U);
  g.restore();
}

/* ---- wall art -------------------------------------------------------------- */

/** Frame and picture in one rect. Opaque, so it replaces the default picture cleanly. */
function paintArt(g: Ctx, id: string, x: number, y: number, w: number, h: number, U: number, t = 0): void {
  g.save();
  g.shadowColor = "rgba(27,22,56,0.45)"; g.shadowBlur = 14 * U; g.shadowOffsetY = 5 * U;
  rrect(g, x, y, w, h, 6 * U); g.fillStyle = id === "art-stars" ? "#3d2c74" : "#fff1dc"; g.fill();
  g.restore();
  const pi = 6 * U, ix = x + pi, iy = y + pi, iw = w - pi * 2, ih = h - pi * 2;
  g.save(); rrect(g, ix, iy, iw, ih, 3 * U); g.clip();
  if (id === "art-sun") {
    g.fillStyle = lin(g, 0, iy, 0, iy + ih, [[0, "#7fd4e6"], [0.5, "#ffe0b0"], [1, "#ffb58a"]]); g.fillRect(ix, iy, iw, ih);
    const sx = ix + iw * 0.5, sy = iy + ih * 0.64, sr = iw * 0.2;
    g.strokeStyle = "rgba(255,244,200,0.75)"; g.lineWidth = Math.max(1.4, iw * 0.022); g.lineCap = "round";
    for (let i = 0; i < 11; i++) { const a = Math.PI + (i / 10) * Math.PI; g.beginPath(); g.moveTo(sx + Math.cos(a) * sr * 1.3, sy + Math.sin(a) * sr * 1.3); g.lineTo(sx + Math.cos(a) * sr * 1.75, sy + Math.sin(a) * sr * 1.75); g.stroke(); }
    const sg = g.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, 0, sx, sy, sr);
    sg.addColorStop(0, "#fffbe0"); sg.addColorStop(1, "#ffd25e"); g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
    g.fillStyle = "#2bb89e"; g.beginPath(); g.moveTo(ix, iy + ih * 0.82); g.quadraticCurveTo(ix + iw * 0.3, iy + ih * 0.62, ix + iw * 0.62, iy + ih * 0.8); g.quadraticCurveTo(ix + iw * 0.82, iy + ih * 0.7, ix + iw, iy + ih * 0.8); g.lineTo(ix + iw, iy + ih); g.lineTo(ix, iy + ih); g.fill();
    g.fillStyle = "#178a78"; g.beginPath(); g.moveTo(ix, iy + ih * 0.92); g.quadraticCurveTo(ix + iw * 0.4, iy + ih * 0.76, ix + iw, iy + ih * 0.94); g.lineTo(ix + iw, iy + ih); g.lineTo(ix, iy + ih); g.fill();
  } else if (id === "art-stars") {
    g.fillStyle = lin(g, 0, iy, 0, iy + ih, [[0, "#1B1638"], [1, "#4a3590"]]); g.fillRect(ix, iy, iw, ih);
    const pts: [number, number][] = [[0.2, 0.7], [0.32, 0.4], [0.52, 0.5], [0.66, 0.24], [0.82, 0.38], [0.78, 0.7]];
    g.strokeStyle = "rgba(255,229,143,0.6)"; g.lineWidth = Math.max(1, iw * 0.014); g.setLineDash([iw * 0.03, iw * 0.024]);
    g.beginPath(); pts.forEach(([px, py], i) => { const X = ix + px * iw, Y = iy + py * ih; if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y); }); g.stroke(); g.setLineDash([]);
    pts.forEach(([px, py], i) => {
      const X = ix + px * iw, Y = iy + py * ih;
      const k = 0.7 + 0.3 * Math.sin(t * 1.6 + i * 1.3);
      g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.5 * k;
      const gl = g.createRadialGradient(X, Y, 0, X, Y, iw * 0.11); gl.addColorStop(0, "rgba(255,229,143,1)"); gl.addColorStop(1, "rgba(255,229,143,0)");
      g.fillStyle = gl; g.fillRect(X - iw * 0.12, Y - iw * 0.12, iw * 0.24, iw * 0.24); g.restore();
      g.fillStyle = "#fff4c2"; star(g, X, Y, iw * (i === 3 ? 0.062 : 0.045), 0.42); g.fill();
    });
    const r = mulberry(5);
    g.fillStyle = "rgba(236,233,255,0.7)";
    for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(ix + r() * iw, iy + r() * ih, 0.6 + r() * 0.9, 0, TAU); g.fill(); }
  }
  g.restore();
}

/* ---- rugs ------------------------------------------------------------------ */

/** A rug centred on (x, y) with radii rx, ry. Opaque; sized by the caller to hide the default one. */
function paintRug(g: Ctx, id: string, x: number, y: number, rx: number, ry: number, U: number): void {
  const thick = 5 * U;
  const sg = g.createRadialGradient(x, y + thick, ry * 0.4, x, y + thick, rx * 1.05);
  sg.addColorStop(0, "rgba(58,30,60,0.38)"); sg.addColorStop(1, "rgba(58,30,60,0)");
  g.fillStyle = sg; ellipse(g, x, y + thick, rx * 1.06, ry * 1.3); g.fill();
  if (id === "rug-cloud") {
    const n = 22;
    const lobes = (dy: number, k: number, fill: string | CanvasGradient, edge?: string): void => {
      g.fillStyle = fill;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        g.beginPath(); g.ellipse(x + Math.cos(a) * rx * k, y + dy + Math.sin(a) * ry * k, rx * 0.17, ry * 0.5, a, 0, TAU); g.fill();
        if (edge) { g.strokeStyle = edge; g.lineWidth = 1.2 * U; g.stroke(); }
      }
      g.beginPath(); g.ellipse(x, y + dy, rx * k, ry * k, 0, 0, TAU); g.fill();
    };
    lobes(thick, 0.9, "#c98aa8");
    lobes(0, 0.9, lin(g, 0, y - ry, 0, y + ry, [[0, "#fff2f7"], [1, "#ffcfe1"]]));
    // soft pile texture
    g.strokeStyle = "rgba(230,150,185,0.35)"; g.lineWidth = 1.4 * U; g.lineCap = "round";
    const r = mulberry(3);
    for (let i = 0; i < 46; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.78; const px = x + Math.cos(a) * rx * d, py = y + Math.sin(a) * ry * d; g.beginPath(); g.moveTo(px - 4 * U, py); g.quadraticCurveTo(px, py - 2 * U, px + 4 * U, py); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.ellipse(x - rx * 0.28, y - ry * 0.4, rx * 0.22, ry * 0.12, -0.1, 0, TAU); g.fill();
    // heart in the middle
    g.fillStyle = "#ff8fb0"; g.save(); g.translate(x, y + ry * 0.02); g.scale(rx * 0.05, ry * 0.16);
    g.beginPath(); g.moveTo(0, 0.9); g.bezierCurveTo(-1.5, 0.1, -0.9, -0.9, 0, -0.35); g.bezierCurveTo(0.9, -0.9, 1.5, 0.1, 0, 0.9); g.fill(); g.restore();
  } else if (id === "rug-star") {
    const top = y - ry * 1.02, bot = y + ry * 1.14, tw = rx * 0.98, bw = rx * 1.1;
    const path = (dy: number, k: number): void => {
      g.beginPath();
      g.moveTo(x - tw * k + 10 * U, top + dy); g.lineTo(x + tw * k - 10 * U, top + dy);
      g.quadraticCurveTo(x + tw * k, top + dy, x + tw * k + 2 * U, top + dy + 10 * U);
      g.lineTo(x + bw * k, bot + dy - 8 * U); g.quadraticCurveTo(x + bw * k, bot + dy, x + bw * k - 10 * U, bot + dy);
      g.lineTo(x - bw * k + 10 * U, bot + dy); g.quadraticCurveTo(x - bw * k, bot + dy, x - bw * k, bot + dy - 8 * U);
      g.lineTo(x - tw * k - 2 * U, top + dy + 10 * U); g.quadraticCurveTo(x - tw * k, top + dy, x - tw * k + 10 * U, top + dy);
      g.closePath();
    };
    path(thick, 1); g.fillStyle = "#231a5a"; g.fill();
    // fringe
    g.strokeStyle = "#ffe9b0"; g.lineWidth = 1.6 * U; g.lineCap = "round";
    for (let i = 0; i <= 26; i++) {
      const u = i / 26, fx = x - tw + u * tw * 2;
      g.beginPath(); g.moveTo(fx, top); g.lineTo(fx + (u - 0.5) * 2 * U, top - 6 * U); g.stroke();
      const bx = x - bw + u * bw * 2; g.beginPath(); g.moveTo(bx, bot); g.lineTo(bx + (u - 0.5) * 2 * U, bot + 6 * U); g.stroke();
    }
    path(0, 1); g.fillStyle = lin(g, 0, top, 0, bot, [[0, "#5a43b8"], [1, "#2f2377"]]); g.fill();
    g.strokeStyle = "#ffe9b0"; g.lineWidth = 2 * U; path(0, 0.93); g.stroke();
    g.strokeStyle = "rgba(255,229,143,0.35)"; g.lineWidth = 1.2 * U; path(0, 0.84); g.stroke();
    // stars scattered, one big one in the middle
    g.save(); path(0, 0.9); g.clip();
    const r = mulberry(9);
    for (let i = 0; i < 20; i++) {
      const px = x + (r() - 0.5) * rx * 1.7, py = y + (r() - 0.5) * ry * 1.6;
      g.fillStyle = r() < 0.5 ? "rgba(255,229,143,0.9)" : "rgba(236,233,255,0.7)";
      star(g, px, py, (2 + r() * 3) * U, 0.45, r() * 1.2); g.fill();
    }
    g.fillStyle = "#ffe58f"; star(g, x, y, ry * 0.78, 0.46); g.fill();
    g.strokeStyle = "rgba(150,90,20,0.4)"; g.lineWidth = 1.2 * U; g.stroke();
    g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.ellipse(x - ry * 0.18, y - ry * 0.28, ry * 0.16, ry * 0.08, -0.6, 0, TAU); g.fill();
    g.restore();
  }
}

/* ---- lamps ----------------------------------------------------------------- */

/** Origin at the centre of the lamp body; the cord runs up `cord` px. `lit` brightens the shade from inside. */
function paintLamp(g: Ctx, id: string, U: number, cord: number, lit: number): void {
  g.save();
  g.strokeStyle = "rgba(27,22,56,0.75)"; g.lineWidth = 1.6 * Math.max(1, U * 0.8); g.lineCap = "round";
  g.beginPath(); g.moveTo(0, -cord); g.lineTo(0, id === "lamp-moon" ? -18 * U : -24 * U); g.stroke();
  if (id === "lamp-lantern") {
    const rx = 20 * U, ry = 25 * U;
    g.fillStyle = "#3a2a6b"; rrect(g, -6 * U, -28 * U, 12 * U, 6 * U, 2.5 * U); g.fill();
    g.beginPath(); g.moveTo(-8 * U, -23 * U); g.bezierCurveTo(-rx * 1.1, -ry * 0.7, -rx * 1.1, ry * 0.7, -8 * U, 23 * U); g.lineTo(8 * U, 23 * U);
    g.bezierCurveTo(rx * 1.1, ry * 0.7, rx * 1.1, -ry * 0.7, 8 * U, -23 * U); g.closePath();
    g.fillStyle = lin(g, -rx, 0, rx, 0, [[0, "#e4573f"], [0.5, lit > 0.5 ? "#ffd9a0" : "#ffb58a"], [1, "#e4573f"]]); g.fill();
    g.strokeStyle = "rgba(120,30,40,0.5)"; g.lineWidth = 1.3; g.stroke();
    g.save(); g.clip();
    g.strokeStyle = "rgba(160,50,40,0.4)"; g.lineWidth = 1.2 * Math.max(1, U * 0.8);
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.ellipse(0, 0, Math.abs(i) * rx * 0.3 + 0.01, ry, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.ellipse(0, 0, Math.abs(i) * rx * 0.3 + 0.01, ry, 0, Math.PI / 2, Math.PI * 1.5); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(-rx * 0.45, -ry * 0.3, rx * 0.1, ry * 0.42, 0.1, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = "#3a2a6b"; rrect(g, -8 * U, 21 * U, 16 * U, 5 * U, 2.5 * U); g.fill();
    g.strokeStyle = "#ffe58f"; g.lineWidth = 1.6 * Math.max(1, U * 0.8);
    for (const dx of [-4, 0, 4]) { g.beginPath(); g.moveTo(dx * U, 26 * U); g.lineTo(dx * U + (dx ? dx * 0.2 : 0) * U, 36 * U); g.stroke(); }
    g.fillStyle = "#ffe58f"; g.beginPath(); g.arc(0, 37 * U, 2.2 * U, 0, TAU); g.fill();
  } else if (id === "lamp-moon") {
    const r = 19 * U;
    g.fillStyle = "#3a2a6b"; rrect(g, -4 * U, -21 * U, 8 * U, 4 * U, 2 * U); g.fill();
    const mg = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
    mg.addColorStop(0, "#ffffff"); mg.addColorStop(0.6, lit > 0.5 ? "#f2efff" : "#d9d4f0"); mg.addColorStop(1, "#a9a2d8");
    g.fillStyle = mg; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = "rgba(60,50,120,0.4)"; g.lineWidth = 1.3; g.stroke();
    g.fillStyle = "rgba(120,110,190,0.28)";
    for (const [cx, cy, cr] of [[0.3, -0.25, 0.22], [-0.35, 0.2, 0.28], [0.35, 0.42, 0.14], [-0.05, 0.6, 0.1]] as const) {
      g.beginPath(); g.arc(cx * r, cy * r, cr * r, 0, TAU); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.ellipse(-r * 0.42, -r * 0.5, r * 0.2, r * 0.1, -0.7, 0, TAU); g.fill();
    // a small sleepy face, so it keeps the room company
    g.strokeStyle = "rgba(70,60,140,0.65)"; g.lineWidth = 1.5 * Math.max(1, U * 0.8);
    g.beginPath(); g.arc(-r * 0.3, r * 0.02, r * 0.11, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.beginPath(); g.arc(r * 0.3, r * 0.02, r * 0.11, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.beginPath(); g.arc(0, r * 0.22, r * 0.1, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
  }
  g.restore();
}

const LAMP_GLOW: Record<string, [string, string]> = { "lamp-lantern": [P.butter, P.peach], "lamp-moon": ["#dfe6ff", "#9c86f0"] };

/* ---- the Decor object -------------------------------------------------------- */

export class Decor {
  private room: Room = {};
  private lk = "";
  private wall: HTMLCanvasElement | null = null;
  private floor: HTMLCanvasElement | null = null;
  private wallKey = "";
  private floorKey = "";

  setRoom(r: Room | undefined): void { this.room = r ?? {}; }
  get current(): Room { return this.room; }

  private layoutKey(L: Layout): string { return `${Math.round(L.W)}x${Math.round(L.H)}@${L.dpr}`; }

  private wallLayer(L: Layout): HTMLCanvasElement | null {
    const { wallpaper, wall } = this.room;
    if (!wallpaper && !wall) return null;
    const key = `${this.layoutKey(L)}|${wallpaper ?? ""}|${wall ?? ""}`;
    if (key !== this.wallKey) {
      this.wallKey = key;
      const [c, g] = mk(L);
      if (wallpaper) paintWallpaper(g, L, wallpaper);
      if (wall) { const pf = L.picture; paintArt(g, wall, pf.x, pf.y, pf.w, pf.h, L.U); }
      this.wall = c;
    }
    return this.wall;
  }

  private floorLayer(L: Layout): HTMLCanvasElement | null {
    const id = this.room.rug;
    if (!id) return null;
    const key = `${this.layoutKey(L)}|${id}`;
    if (key !== this.floorKey) {
      this.floorKey = key;
      const [c, g] = mk(L);
      const { size, W, U } = L;
      // Bigger than the default rug (radius, fringe and shadow), so it fully replaces it
      const rx = Math.min(size * 1.08, W * 0.4) * 1.14 + 8 * U;
      const ry = Math.min(size * 1.08, W * 0.4) * 0.29 * 1.2;
      paintRug(g, id, L.cx, L.feetY + size * 0.05, rx, ry, U);
      this.floor = c;
    }
    return this.floor;
  }

  /** After the base wall layer. */
  drawWall(ctx: Ctx, L: Layout, off: Off): void {
    const c = this.wallLayer(L);
    if (c) ctx.drawImage(c, -L.M + off.x, -L.M + off.y, L.W + L.M * 2, L.H + L.M * 2);
  }

  /** After the base floor layer, before props and messes. */
  drawFloor(ctx: Ctx, L: Layout, off: Off): void {
    const c = this.floorLayer(L);
    if (c) ctx.drawImage(c, -L.M + off.x, -L.M + off.y, L.W + L.M * 2, L.H + L.M * 2);
  }

  private lampPos(L: Layout): { x: number; y: number; cord: number } {
    const { win, picture: pf, U, W } = L;
    const right = win.x + win.w * 1.2 + 9 * U;
    const x = clamp((right + pf.x) / 2, W * 0.3, W * 0.85);
    const y = win.y + win.h * 0.34;
    return { x, y, cord: y + L.M + 8 };
  }

  /** In the lit world (under the ambient pass). `lit` 0..1 is how on it is. */
  drawLamp(ctx: Ctx, L: Layout, off: Off, now: number, lit: number, reduced: boolean): void {
    const id = this.room.lamp;
    if (!id) return;
    const p = this.lampPos(L);
    const sway = reduced ? 0 : Math.sin(now * 0.0009) * 0.018 + Math.sin(now * 0.0023 + 1) * 0.006;
    ctx.save();
    ctx.translate(p.x + off.x, -L.M + off.y);
    ctx.rotate(sway);
    ctx.translate(0, p.y + L.M);
    paintLamp(ctx, id, L.U, p.cord, lit);
    ctx.restore();
  }

  /** Additive light, after the ambient pass. */
  drawGlow(ctx: Ctx, L: Layout, off: Off, now: number, lit: number): void {
    const id = this.room.lamp;
    const cols = id ? LAMP_GLOW[id] : undefined;
    if (!id || !cols) return;
    const p = this.lampPos(L);
    const x = p.x + off.x, y = p.y + off.y, U = L.U, s = L.size;
    const fl = 0.96 + 0.04 * Math.sin(now * 0.004);
    drawGlow(ctx, cols[0], x, y, s * 0.95, 0.5 * lit * fl);
    drawGlow(ctx, cols[1], x, y, s * 1.9, 0.2 * lit * fl);
    drawGlow(ctx, "#ffffff", x, y, 22 * U, 0.4 * lit);
    drawGlow(ctx, cols[1], x, L.floorY + (L.H - L.floorY) * 0.28, s * 1.2, 0.16 * lit, 0.3);
  }
}

/* ---- icons for the wardrobe's tiles -------------------------------------------- */

/** A small swatch of a room item, fitted into w by h. Returns false for ids it doesn't know. */
export function drawDecorIcon(ctx: Ctx, id: string, w: number, h: number, t = 0): boolean {
  const U = Math.min(w, h) / 110;
  ctx.save();
  if (WASH[id]) {
    rrect(ctx, 0, 0, w, h, 10); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#5b3f93"], [1, "#a47bd0"]]); ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "color"; ctx.globalAlpha = WASH[id]!.a; ctx.fillStyle = WASH[id]!.color; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    paintPattern(ctx, id, 0, 0, w, h, Math.max(0.5, U * 0.7));
    ctx.fillStyle = lin(ctx, 0, h * 0.7, 0, h, [[0, "rgba(27,22,56,0)"], [1, "rgba(27,22,56,0.35)"]]); ctx.fillRect(0, 0, w, h);
  } else if (id.startsWith("rug-")) {
    paintRug(ctx, id, w / 2, h / 2 - 2, w * 0.4, h * 0.2 + 6, Math.max(0.5, U * 0.7));
  } else if (id.startsWith("lamp-")) {
    ctx.translate(w / 2, h * 0.56); const u = Math.min(w, h) / 82; paintLamp(ctx, id, u, h * 0.6, 1);
  } else if (id.startsWith("art-")) {
    const m = Math.min(w, h) * 0.06;
    paintArt(ctx, id, m + (w - h) / 2 * 0 + Math.max(0, (w - h) / 2), m, Math.min(w, h) - m * 2, Math.min(w, h) - m * 2, Math.max(0.4, U * 0.7), t);
  } else { ctx.restore(); return false; }
  ctx.restore();
  return true;
}
