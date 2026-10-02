/** Room layout, baked static layers (wall / floor / props / light shafts) and the live window sky. */
import { P, alpha, clamp, css, drawGlow, ellipse, hex, lerp, mix, mulberry, rrect, shade, star5, type RGB } from "./util.js";
import type { SkyState } from "./sky.js";
import type { WindowHooks } from "./weather.js";

type Ctx = CanvasRenderingContext2D;

export interface Layout {
  W: number; H: number; dpr: number;
  /** Bake margin (CSS px) around every layer to allow parallax + shake. */
  M: number;
  U: number;
  floorY: number; feetY: number;
  cx: number; cy: number; size: number;
  win: { x: number; y: number; w: number; h: number };
  plant: { x: number; y: number };
  lamp: { x: number; y: number; shadeX: number; shadeY: number };
  bowl: { x: number; y: number };
  toybox: { x: number; y: number } | null;
  nightlight: { x: number; y: number };
  picture: { x: number; y: number; w: number; h: number };
  bulbs: { x: number; y: number; c: string }[];
  garlandY: number;
  bandBottom: number;
}

export function computeLayout(W: number, H: number, dpr: number): Layout {
  const M = 20;
  const min = Math.min(W, H);
  const size = min * 0.38;
  const U = size / 137;
  const landscape = W / H > 1.1;
  const floorY = H * (landscape ? 0.6 : 0.585);
  const cx = W / 2, cy = H * 0.62;
  const feetY = cy + size * 0.5;
  const gh = clamp(floorY * (landscape ? 0.44 : 0.4), 110, 250);
  const gw = gh * (landscape ? 0.9 : 0.86);
  const win = { x: landscape ? W * 0.24 : W * 0.5 - gw * 0.98, y: Math.max(86, floorY * 0.2), w: gw, h: gh };
  const propY = floorY + (H - floorY) * 0.15;
  const L: Layout = {
    W, H, dpr, M, U, floorY, feetY, cx, cy, size, win,
    plant: { x: landscape ? W * 0.09 : W * 0.155, y: propY },
    lamp: { x: landscape ? W * 0.92 : W * 0.89, y: propY, shadeX: 0, shadeY: 0 },
    bowl: { x: cx - size * 1.0, y: Math.min(feetY + size * 0.13, H - 130) },
    toybox: landscape ? { x: W * 0.8, y: floorY + (H - floorY) * 0.3 } : null,
    nightlight: { x: landscape ? W * 0.66 : W * 0.72, y: floorY - Math.max(14, H * 0.03) },
    picture: landscape
      ? { x: W * 0.55, y: win.y + 10, w: gw * 0.62, h: gw * 0.74 }
      : { x: W * 0.7, y: win.y + 26, w: W * 0.2, h: W * 0.25 },
    bulbs: [], garlandY: 58, bandBottom: H - 110,
  };
  L.lamp.shadeX = L.lamp.x;
  L.lamp.shadeY = L.lamp.y - 138 * U + 14 * U;
  const n = Math.max(8, Math.round(W / 46));
  const cols = [P.butter, P.peach, P.coral, P.lagoon];
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const y = L.garlandY + 4 + Math.sin(f * Math.PI * 4 - Math.PI / 2 + Math.PI) * 0 + swag(f) ;
    L.bulbs.push({ x: f * W, y: y + 5, c: cols[i % cols.length]! });
  }
  return L;
}
/** Two gentle swags across the width. */
function swag(f: number): number {
  const s = (f * 2) % 1;
  return Math.sin(s * Math.PI) * 16;
}

export interface Layers { wall: HTMLCanvasElement; floor: HTMLCanvasElement; props: HTMLCanvasElement; shaft: HTMLCanvasElement }

function mk(L: Layout): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = Math.ceil((L.W + L.M * 2) * L.dpr);
  c.height = Math.ceil((L.H + L.M * 2) * L.dpr);
  const g = c.getContext("2d")!;
  g.scale(L.dpr, L.dpr);
  g.translate(L.M, L.M);
  return [c, g];
}

/* ---- wall ---------------------------------------------------------------- */

function bakeWall(L: Layout): HTMLCanvasElement {
  const [c, g] = mk(L);
  const { W, H, floorY, M, U } = L;
  const x0 = -M, y0 = -M, w = W + M * 2;
  const grad = g.createLinearGradient(0, 0, 0, floorY);
  grad.addColorStop(0, "#5b3f93");
  grad.addColorStop(0.55, "#7d55b0");
  grad.addColorStop(1, "#a47bd0");
  g.fillStyle = grad;
  g.fillRect(x0, y0, w, floorY + M + 40);

  // Wallpaper: faint vertical stripes + tiny diamonds
  g.fillStyle = "rgba(236,233,255,0.045)";
  for (let x = -M; x < W + M; x += 34 * Math.max(0.8, U * 0.75)) g.fillRect(x, y0, 12 * Math.max(0.8, U * 0.75), floorY + M);
  g.fillStyle = "rgba(255,229,143,0.10)";
  const step = 34 * Math.max(0.8, U * 0.75);
  for (let x = -M + step / 2; x < W + M; x += step) {
    for (let y = 22; y < floorY; y += step * 0.9) {
      g.save(); g.translate(x + 6, y); g.rotate(Math.PI / 4);
      g.fillRect(-2, -2, 4, 4); g.restore();
    }
  }
  // Ceiling AO + side AO
  const ao = g.createLinearGradient(0, 0, 0, floorY * 0.42);
  ao.addColorStop(0, "rgba(27,22,56,0.55)"); ao.addColorStop(1, "rgba(27,22,56,0)");
  g.fillStyle = ao; g.fillRect(x0, y0, w, floorY * 0.42 + M);
  for (const side of [0, 1]) {
    const sg = g.createLinearGradient(side ? W : 0, 0, side ? W - W * 0.16 : W * 0.16, 0);
    sg.addColorStop(0, "rgba(27,22,56,0.35)"); sg.addColorStop(1, "rgba(27,22,56,0)");
    g.fillStyle = sg; g.fillRect(side ? W - W * 0.16 : x0, y0, W * 0.16 + M, floorY + M);
  }

  // Garland wire
  g.strokeStyle = "rgba(27,22,56,0.55)";
  g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i <= 80; i++) {
    const f = i / 80;
    const x = f * W, y = L.garlandY + 4 + swag(f);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();

  // Picture frame
  const pf = L.picture;
  g.save();
  g.shadowColor = "rgba(27,22,56,0.45)"; g.shadowBlur = 14 * U; g.shadowOffsetY = 5 * U;
  rrect(g, pf.x, pf.y, pf.w, pf.h, 6 * U); g.fillStyle = "#f6e6d2"; g.fill();
  g.restore();
  const pi = 6 * U;
  rrect(g, pf.x + pi, pf.y + pi, pf.w - pi * 2, pf.h - pi * 2, 3 * U);
  const pg = g.createLinearGradient(0, pf.y, 0, pf.y + pf.h);
  pg.addColorStop(0, "#ffb58a"); pg.addColorStop(0.6, "#ff9a7a"); pg.addColorStop(1, "#ff5c7a");
  g.fillStyle = pg; g.fill();
  g.save();
  rrect(g, pf.x + pi, pf.y + pi, pf.w - pi * 2, pf.h - pi * 2, 3 * U); g.clip();
  g.fillStyle = P.butter; g.beginPath();
  g.arc(pf.x + pf.w * 0.62, pf.y + pf.h * 0.42, pf.w * 0.16, 0, 6.3); g.fill();
  g.fillStyle = "#3A2A6B"; g.beginPath();
  g.moveTo(pf.x, pf.y + pf.h * 0.8); g.quadraticCurveTo(pf.x + pf.w * 0.3, pf.y + pf.h * 0.5, pf.x + pf.w * 0.6, pf.y + pf.h * 0.78);
  g.quadraticCurveTo(pf.x + pf.w * 0.8, pf.y + pf.h * 0.62, pf.x + pf.w, pf.y + pf.h * 0.8);
  g.lineTo(pf.x + pf.w, pf.y + pf.h); g.lineTo(pf.x, pf.y + pf.h); g.fill();
  g.fillStyle = "#1B1638"; g.beginPath();
  g.moveTo(pf.x, pf.y + pf.h * 0.9); g.quadraticCurveTo(pf.x + pf.w * 0.4, pf.y + pf.h * 0.68, pf.x + pf.w, pf.y + pf.h * 0.92);
  g.lineTo(pf.x + pf.w, pf.y + pf.h); g.lineTo(pf.x, pf.y + pf.h); g.fill();
  g.restore();

  // Landscape only: little wall shelf with books and a tiny plant
  if (L.toybox) {
    const sx = W * 0.75, sy = floorY * 0.52, sw = W * 0.14;
    g.save(); g.shadowColor = "rgba(27,22,56,0.5)"; g.shadowBlur = 10 * U; g.shadowOffsetY = 5 * U;
    rrect(g, sx, sy, sw, 7 * U, 3 * U); g.fillStyle = "#f0d9c2"; g.fill(); g.restore();
    const books = [["#ff5c7a", 34], ["#38D6B8", 28], ["#ffe58f", 38], ["#8FA8FF", 30]] as const;
    let bx = sx + 8 * U;
    for (const [col, hh] of books) {
      rrect(g, bx, sy - hh * U * 0.8, 9 * U, hh * U * 0.8, 1.5 * U); g.fillStyle = col; g.fill();
      g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(bx + 1.5 * U, sy - hh * U * 0.8 + 3 * U, 1.5 * U, hh * U * 0.8 - 6 * U);
      bx += 10.5 * U;
    }
    // pot
    g.fillStyle = "#e87a5f"; g.beginPath();
    g.moveTo(sx + sw - 30 * U, sy - 14 * U); g.lineTo(sx + sw - 10 * U, sy - 14 * U); g.lineTo(sx + sw - 13 * U, sy); g.lineTo(sx + sw - 27 * U, sy); g.fill();
    drawLeaf(g, sx + sw - 20 * U, sy - 14 * U, 22 * U, -0.5, "#38D6B8");
    drawLeaf(g, sx + sw - 20 * U, sy - 14 * U, 26 * U, 0.1, "#1fa88b");
    drawLeaf(g, sx + sw - 20 * U, sy - 14 * U, 22 * U, 0.7, "#7fe8c6");
  }

  bakeWindowFrame(g, L);
  void H;
  return c;
}

function bakeWindowFrame(g: Ctx, L: Layout): void {
  const { win, U } = L;
  const pad = 9 * U;
  // curtains rod
  const rodY = win.y - pad - 14 * U;
  const rodX0 = win.x - win.w * 0.42, rodX1 = win.x + win.w * 1.42;
  // frame with drop shadow
  g.save();
  g.shadowColor = "rgba(27,22,56,0.55)"; g.shadowBlur = 20 * U; g.shadowOffsetY = 8 * U;
  rrect(g, win.x - pad, win.y - pad, win.w + pad * 2, win.h + pad * 2, 9 * U);
  g.fillStyle = "#f6e4d0"; g.fill();
  g.restore();
  // inner bevel
  rrect(g, win.x - pad * 0.35, win.y - pad * 0.35, win.w + pad * 0.7, win.h + pad * 0.7, 5 * U);
  g.fillStyle = "#cba98f"; g.fill();
  // sill
  g.save();
  g.shadowColor = "rgba(27,22,56,0.5)"; g.shadowBlur = 12 * U; g.shadowOffsetY = 6 * U;
  rrect(g, win.x - pad * 1.6, win.y + win.h + pad * 0.6, win.w + pad * 3.2, 9 * U, 4 * U);
  g.fillStyle = "#fbeedd"; g.fill();
  g.restore();
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.fillRect(win.x - pad * 1.4, win.y + win.h + pad * 0.6 + 1, win.w + pad * 2.8, 1.6);

  // rod
  g.strokeStyle = "#e9c9a6"; g.lineWidth = 3.5 * U; g.lineCap = "round";
  g.beginPath(); g.moveTo(rodX0, rodY); g.lineTo(rodX1, rodY); g.stroke();
  g.fillStyle = P.butter;
  for (const x of [rodX0, rodX1]) { g.beginPath(); g.arc(x, rodY, 5 * U, 0, 6.3); g.fill(); }

  // curtains: two soft drapes with folds
  const cw = win.w * 0.34;
  const bottom = win.y + win.h * 0.98;
  drape(g, win.x - pad - cw * 0.55, rodY, cw, bottom - rodY, L, 1);
  drape(g, win.x + win.w + pad - cw * 0.45, rodY, cw, bottom - rodY, L, -1);
}

function drape(g: Ctx, x: number, y: number, w: number, h: number, L: Layout, dir: 1 | -1): void {
  const U = L.U;
  g.save();
  g.shadowColor = "rgba(27,22,56,0.5)"; g.shadowBlur = 14 * U; g.shadowOffsetY = 4 * U; g.shadowOffsetX = 4 * U * dir;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  // pinched at the waist (tie-back), flaring to the hem
  const tie = y + h * 0.62;
  const pinch = dir === 1 ? w * 0.18 : -w * 0.18;
  g.bezierCurveTo(x + w, y + h * 0.3, x + w + pinch, tie - 12 * U, x + w + pinch * 0.4, tie);
  g.bezierCurveTo(x + w + pinch, tie + 12 * U, x + w * 1.02, y + h * 0.85, x + w * 0.96, y + h);
  g.lineTo(x + w * 0.04, y + h);
  g.bezierCurveTo(x, y + h * 0.85, x - pinch * 0.2, tie + 12 * U, x - pinch * 0.2, tie);
  g.bezierCurveTo(x - pinch * 0.2, tie - 12 * U, x, y + h * 0.3, x, y);
  g.closePath();
  g.fillStyle = "#e0587a";
  g.fill();
  g.restore();
  g.save();
  g.clip();
  const fg = g.createLinearGradient(x, 0, x + w, 0);
  const folds = 5;
  for (let i = 0; i <= folds * 2; i++) fg.addColorStop(i / (folds * 2), i % 2 ? "rgba(255,181,138,0.22)" : "rgba(58,42,107,0.22)");
  g.fillStyle = fg; g.fillRect(x - 20, y, w + 40, h);
  const vg = g.createLinearGradient(0, y, 0, y + h);
  vg.addColorStop(0, "rgba(27,22,56,0.3)"); vg.addColorStop(0.3, "rgba(27,22,56,0)"); vg.addColorStop(1, "rgba(255,181,138,0.15)");
  g.fillStyle = vg; g.fillRect(x - 20, y, w + 40, h);
  g.restore();
  // tie-back
  g.fillStyle = P.butter;
  rrect(g, x - 2 * U, tie - 3 * U, w + 4 * U, 6 * U, 3 * U); g.fill();
}

function drawLeaf(g: Ctx, x: number, y: number, len: number, ang: number, col: string): void {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const w = len * 0.34;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-w * 1.25, -len * 0.25, -w * 0.9, -len * 0.85, 0, -len);
  g.bezierCurveTo(w * 0.9, -len * 0.85, w * 1.25, -len * 0.25, 0, 0);
  const gr = g.createLinearGradient(-w, 0, w, 0);
  gr.addColorStop(0, shade(col, -0.18)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, 0.22));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = "rgba(27,22,56,0.22)"; g.lineWidth = Math.max(1, len * 0.02);
  g.beginPath(); g.moveTo(0, -len * 0.05); g.quadraticCurveTo(len * 0.04, -len * 0.5, 0, -len * 0.92); g.stroke();
  g.restore();
}

/* ---- floor --------------------------------------------------------------- */

function bakeFloor(L: Layout): HTMLCanvasElement {
  const [c, g] = mk(L);
  const { W, H, floorY, M, cx, U, size } = L;
  const bb = Math.max(11, H * 0.028);
  const top = floorY - bb;
  const h = H - floorY;
  // base gradient
  const grad = g.createLinearGradient(0, floorY, 0, H + M);
  grad.addColorStop(0, "#b77b62");
  grad.addColorStop(0.35, "#dc9c78");
  grad.addColorStop(1, "#f2bd92");
  g.fillStyle = grad;
  g.fillRect(-M, floorY, W + M * 2, h + M);

  // perspective planks
  const vpX = cx, vpY = floorY - h * 1.5;
  const lanes = Math.max(9, Math.round(W / 46));
  const rng = mulberry(7);
  g.save();
  g.beginPath(); g.rect(-M, floorY, W + M * 2, h + M); g.clip();
  const xAt = (i: number, y: number): number => {
    const xb = cx + (i - lanes / 2) * (W * 1.5 / lanes);
    return vpX + (xb - vpX) * ((y - vpY) / (H + M - vpY));
  };
  for (let i = -2; i < lanes + 2; i++) {
    g.beginPath();
    g.moveTo(xAt(i, floorY), floorY); g.lineTo(xAt(i + 1, floorY), floorY);
    g.lineTo(xAt(i + 1, H + M), H + M); g.lineTo(xAt(i, H + M), H + M);
    g.closePath();
    const v = rng();
    g.fillStyle = v < 0.5 ? `rgba(255,232,200,${(0.03 + v * 0.14).toFixed(3)})` : `rgba(120,60,70,${(0.02 + (v - 0.5) * 0.16).toFixed(3)})`;
    g.fill();
    // end joints
    for (let j = 0; j < 2; j++) {
      const yy = floorY + (0.15 + rng() * 0.8) * (h + M);
      g.strokeStyle = "rgba(90,45,60,0.22)"; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(xAt(i, yy), yy); g.lineTo(xAt(i + 1, yy), yy); g.stroke();
    }
  }
  for (let i = -2; i <= lanes + 2; i++) {
    g.strokeStyle = "rgba(90,45,60,0.34)"; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(xAt(i, floorY), floorY); g.lineTo(xAt(i, H + M), H + M); g.stroke();
    g.strokeStyle = "rgba(255,236,210,0.18)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(xAt(i, floorY) + 1.4, floorY); g.lineTo(xAt(i, H + M) + 1.4, H + M); g.stroke();
  }
  // wall shadow onto floor
  const ao = g.createLinearGradient(0, floorY, 0, floorY + h * 0.22);
  ao.addColorStop(0, "rgba(58,42,107,0.5)"); ao.addColorStop(1, "rgba(58,42,107,0)");
  g.fillStyle = ao; g.fillRect(-M, floorY, W + M * 2, h * 0.22);
  // broad sheen
  const sh = g.createRadialGradient(cx, floorY + h * 0.55, 0, cx, floorY + h * 0.55, W * 0.7);
  sh.addColorStop(0, "rgba(255,240,215,0.22)"); sh.addColorStop(1, "rgba(255,240,215,0)");
  g.fillStyle = sh; g.fillRect(-M, floorY, W + M * 2, h + M);
  g.restore();

  // baseboard
  const bg = g.createLinearGradient(0, top, 0, floorY);
  bg.addColorStop(0, "#f7ecf5"); bg.addColorStop(1, "#d8c4de");
  g.fillStyle = bg; g.fillRect(-M, top, W + M * 2, bb);
  g.fillStyle = "rgba(255,255,255,0.65)"; g.fillRect(-M, top, W + M * 2, 1.6);
  g.fillStyle = "rgba(58,42,107,0.35)"; g.fillRect(-M, floorY - 1.4, W + M * 2, 1.4);
  const bsh = g.createLinearGradient(0, top, 0, top - 10);
  bsh.addColorStop(0, "rgba(27,22,56,0.2)"); bsh.addColorStop(1, "rgba(27,22,56,0)");
  g.fillStyle = bsh; g.fillRect(-M, top - 10, W + M * 2, 10);

  // rug
  const rugX = cx, rugY = L.feetY + size * 0.05, rx = Math.min(size * 1.08, W * 0.4), ry = rx * 0.29;
  rug(g, rugX, rugY, rx, ry, U);
  return c;
}

function rug(g: Ctx, x: number, y: number, rx: number, ry: number, U: number): void {
  const thick = 5 * U;
  // soft contact shadow
  const sg = g.createRadialGradient(x, y + thick, ry * 0.4, x, y + thick, rx * 1.05);
  sg.addColorStop(0, "rgba(58,30,60,0.35)"); sg.addColorStop(1, "rgba(58,30,60,0)");
  g.save(); g.translate(0, 0); g.scale(1, 1);
  g.fillStyle = sg; ellipse(g, x, y + thick, rx * 1.06, ry * 1.25); g.fill(); g.restore();
  // fringe
  g.strokeStyle = "#fff0d6"; g.lineWidth = 1.6 * U; g.lineCap = "round";
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const ex = x + Math.cos(a) * rx, ey = y + Math.sin(a) * ry;
    g.beginPath(); g.moveTo(ex, ey); g.lineTo(x + Math.cos(a) * (rx + 7 * U), y + Math.sin(a) * (ry + 2.6 * U) + 0.5); g.stroke();
  }
  // thickness edge
  ellipse(g, x, y + thick, rx, ry); g.fillStyle = "#177f70"; g.fill();
  const rg = g.createRadialGradient(x, y - ry * 0.2, ry * 0.2, x, y, rx);
  rg.addColorStop(0, "#5fe5c9"); rg.addColorStop(1, "#2bb89e");
  ellipse(g, x, y, rx, ry); g.fillStyle = rg; g.fill();
  ellipse(g, x, y, rx * 0.93, ry * 0.93); g.strokeStyle = "#fff0d6"; g.lineWidth = 2 * U; g.stroke();
  ellipse(g, x, y, rx * 0.84, ry * 0.84); g.strokeStyle = "rgba(23,127,112,0.55)"; g.lineWidth = 1.5 * U; g.stroke();
  // scalloped ring
  g.fillStyle = "rgba(255,240,214,0.85)";
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.beginPath(); g.ellipse(x + Math.cos(a) * rx * 0.72, y + Math.sin(a) * ry * 0.72, 3.1 * U, 1.1 * U * 1.2, 0, 0, 6.3); g.fill();
  }
  ellipse(g, x, y, rx * 0.56, ry * 0.56); g.fillStyle = "rgba(255,181,138,0.32)"; g.fill();
  ellipse(g, x, y, rx * 0.56, ry * 0.56); g.strokeStyle = "rgba(255,240,214,0.7)"; g.lineWidth = 1.4 * U; g.stroke();
}

/* ---- props --------------------------------------------------------------- */

function contactShadow(g: Ctx, x: number, y: number, rx: number, ry: number, a = 0.4): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, `rgba(58,30,60,${a})`); gr.addColorStop(1, "rgba(58,30,60,0)");
  g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, 6.3); g.fill(); g.restore();
}

function bakeProps(L: Layout): HTMLCanvasElement {
  const [c, g] = mk(L);
  const { U } = L;

  // Plant
  {
    const { x, y } = L.plant;
    contactShadow(g, x, y + 3 * U, 34 * U, 9 * U);
    // leaves
    const leafCols = ["#1fa88b", "#38D6B8", "#7fe8c6", "#2bb89e", "#1fa88b", "#5fe5c9", "#38D6B8"];
    const ang = [-1.05, -0.7, -0.32, 0.02, 0.36, 0.72, 1.08];
    const len = [58, 78, 92, 104, 90, 76, 56];
    for (let i = 0; i < 7; i++) drawLeaf(g, x, y - 34 * U, len[i]! * U, ang[i]!, leafCols[i]!);
    // pot
    const pg = g.createLinearGradient(x - 22 * U, 0, x + 22 * U, 0);
    pg.addColorStop(0, "#c95c48"); pg.addColorStop(0.45, "#f28a6c"); pg.addColorStop(1, "#c95c48");
    g.beginPath();
    g.moveTo(x - 24 * U, y - 36 * U); g.lineTo(x + 24 * U, y - 36 * U);
    g.lineTo(x + 18 * U, y); g.quadraticCurveTo(x, y + 4 * U, x - 18 * U, y); g.closePath();
    g.fillStyle = pg; g.fill();
    rrect(g, x - 27 * U, y - 42 * U, 54 * U, 11 * U, 5 * U); g.fillStyle = "#f7997a"; g.fill();
    g.fillStyle = "rgba(255,255,255,0.28)"; g.fillRect(x - 24 * U, y - 41 * U, 46 * U, 2 * U);
    g.fillStyle = P.butter; // little painted dots
    for (const dx of [-10, 0, 10]) { g.beginPath(); g.arc(x + dx * U, y - 18 * U, 2.2 * U, 0, 6.3); g.fill(); }
  }

  // Floor lamp
  {
    const { x, y } = L.lamp;
    contactShadow(g, x, y + 2 * U, 30 * U, 8 * U);
    g.strokeStyle = "#f3d9b8"; g.lineWidth = 4.5 * U; g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y - 6 * U); g.lineTo(x, y - 122 * U); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.4 * U;
    g.beginPath(); g.moveTo(x - 1.4 * U, y - 8 * U); g.lineTo(x - 1.4 * U, y - 120 * U); g.stroke();
    ellipse(g, x, y - 2 * U, 22 * U, 6.5 * U); g.fillStyle = "#e9c9a6"; g.fill();
    ellipse(g, x, y - 5 * U, 22 * U, 6 * U); g.fillStyle = "#fbeedd"; g.fill();
    // shade
    const sy = y - 138 * U;
    g.beginPath();
    g.moveTo(x - 17 * U, sy); g.lineTo(x + 17 * U, sy); g.lineTo(x + 27 * U, sy + 36 * U); g.lineTo(x - 27 * U, sy + 36 * U); g.closePath();
    const sg = g.createLinearGradient(x - 27 * U, 0, x + 27 * U, 0);
    sg.addColorStop(0, "#f0c56a"); sg.addColorStop(0.5, "#ffe58f"); sg.addColorStop(1, "#f0c56a");
    g.fillStyle = sg; g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(x - 24 * U, sy + 33 * U, 48 * U, 2.6 * U);
    ellipse(g, x, sy, 17 * U, 3.4 * U); g.fillStyle = "#fff4c2"; g.fill();
  }

  // Bowl
  {
    const { x, y } = L.bowl;
    const r = 25 * U;
    contactShadow(g, x, y + 6 * U, r * 1.3, 7 * U, 0.35);
    // body
    g.beginPath();
    g.moveTo(x - r, y - 6 * U);
    g.quadraticCurveTo(x - r * 0.9, y + 10 * U, x - r * 0.5, y + 11 * U);
    g.lineTo(x + r * 0.5, y + 11 * U);
    g.quadraticCurveTo(x + r * 0.9, y + 10 * U, x + r, y - 6 * U);
    g.closePath();
    const bg = g.createLinearGradient(x - r, 0, x + r, 0);
    bg.addColorStop(0, "#d9445f"); bg.addColorStop(0.4, "#ff7d92"); bg.addColorStop(1, "#d9445f");
    g.fillStyle = bg; g.fill();
    ellipse(g, x, y - 6 * U, r, 6 * U); g.fillStyle = "#ffa1b0"; g.fill();
    ellipse(g, x, y - 5.5 * U, r * 0.84, 4.6 * U); g.fillStyle = "#7a2c4a"; g.fill();
    // kibble
    const kc = [P.butter, P.peach, "#ffd07a"];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.5 * ((i % 3) / 2 + 0.3), y - 7 * U + Math.sin(a) * 1.8 * U, 3.3 * U, 0, 6.3);
      g.fillStyle = kc[i % 3]!; g.fill();
    }
    // paw print
    g.fillStyle = "rgba(255,240,214,0.85)";
    g.beginPath(); g.ellipse(x, y + 5.5 * U, 4 * U, 2.6 * U, 0, 0, 6.3); g.fill();
    for (const dx of [-5.2, -1.8, 1.8, 5.2]) { g.beginPath(); g.arc(x + dx * U, y + 1.6 * U + (Math.abs(dx) < 3 ? -0.8 * U : 0), 1.3 * U, 0, 6.3); g.fill(); }
  }

  // Toy box (landscape)
  if (L.toybox) {
    const { x, y } = L.toybox;
    const w = 92 * U, h = 52 * U;
    contactShadow(g, x, y + 2 * U, w * 0.75, 11 * U, 0.4);
    // peeking toys
    g.fillStyle = P.coral; g.beginPath(); g.arc(x - w * 0.22, y - h - 6 * U, 15 * U, 0, 6.3); g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(x - w * 0.27, y - h - 12 * U, 5 * U, 3 * U, -0.6, 0, 6.3); g.fill();
    g.fillStyle = P.lagoon; rrect(g, x + w * 0.05, y - h - 18 * U, 22 * U, 22 * U, 4 * U); g.fill();
    g.save(); g.translate(x + w * 0.3, y - h - 2 * U); g.rotate(0.3); star5(g, 12 * U); g.fillStyle = P.butter; g.fill(); g.restore();
    // box
    const bx = x - w / 2, by = y - h;
    const bg = g.createLinearGradient(0, by, 0, y);
    bg.addColorStop(0, "#e2926a"); bg.addColorStop(1, "#b96a4e");
    rrect(g, bx, by, w, h, 6 * U); g.fillStyle = bg; g.fill();
    g.strokeStyle = "rgba(255,240,214,0.35)"; g.lineWidth = 2 * U;
    for (const f of [0.33, 0.66]) { g.beginPath(); g.moveTo(bx + 4 * U, by + h * f); g.lineTo(bx + w - 4 * U, by + h * f); g.stroke(); }
    rrect(g, bx - 4 * U, by - 4 * U, w + 8 * U, 10 * U, 4 * U); g.fillStyle = "#f0a880"; g.fill();
    g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(bx, by - 3 * U, w, 1.6 * U);
    // painted star
    g.save(); g.translate(x, by + h * 0.55); star5(g, 12 * U); g.fillStyle = P.butter; g.fill(); g.restore();
  }

  // Night light (on the wall above the baseboard)
  {
    const { x, y } = L.nightlight;
    rrect(g, x - 9 * U, y - 6 * U, 18 * U, 15 * U, 4 * U); g.fillStyle = "#f4e6f6"; g.fill();
    g.beginPath(); g.arc(x, y - 3 * U, 8 * U, Math.PI, 0); g.closePath();
    g.fillStyle = "#ffe9a8"; g.fill();
    g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.ellipse(x - 3 * U, y - 7 * U, 2.6 * U, 1.6 * U, -0.6, 0, 6.3); g.fill();
  }
  return c;
}

/* ---- light shafts (rebuilt when time bucket changes) --------------------- */

export function bakeShaft(L: Layout, sky: SkyState, tod: number): HTMLCanvasElement {
  const [c, g] = mk(L);
  const { win, floorY, H, U } = L;
  const lc = css(sky.lc);
  // Sun leans across the room depending on time: morning -> right, evening -> left.
  const lean = clamp((0.5 - tod) * 3.2, -1.2, 1.2);
  const dx = lean * L.W * 0.26;
  const near = floorY + (H - floorY) * 0.08, far = floorY + (H - floorY) * 0.5;
  // map glass-normalised (u,v) -> floor point. v=1 bottom of glass lands nearest the wall
  const pt = (u: number, v: number): [number, number] => {
    const gx = win.x + u * win.w;
    const spread = 1 + 0.55 * (1 - v);
    const cxw = win.x + win.w / 2;
    const y = lerp(far, near, v);
    return [cxw + (gx - cxw) * spread + dx * (0.35 + 0.65 * (1 - v)), y];
  };
  const gap = 0.035;
  const panes: [number, number, number, number][] = [
    [0, 0, 0.5 - gap, 0.5 - gap], [0.5 + gap, 0, 1, 0.5 - gap],
    [0, 0.5 + gap, 0.5 - gap, 1], [0.5 + gap, 0.5 + gap, 1, 1],
  ];
  // volumetric beam from glass towards the floor (drawn on wall + floor)
  g.save();
  g.filter = `blur(${Math.round(9 * U)}px)`;
  const beamTop = win.y + win.h * 0.5;
  const bg = g.createLinearGradient(0, beamTop, 0, far);
  bg.addColorStop(0, css(sky.lc, 0.34)); bg.addColorStop(1, css(sky.lc, 0.02));
  g.fillStyle = bg;
  for (const [u0, v0, u1, v1] of panes) {
    const a = pt(u0, v0), b = pt(u1, v0), cc = pt(u1, v1), d = pt(u0, v1);
    g.beginPath();
    g.moveTo(win.x + u0 * win.w, win.y + v0 * win.h);
    g.lineTo(win.x + u1 * win.w, win.y + v0 * win.h);
    g.lineTo(b[0], b[1]); g.lineTo(a[0], a[1]);
    g.closePath();
    void cc; void d;
    g.fill();
  }
  g.restore();
  // crisp-ish light patches on the floor
  g.save();
  g.beginPath(); g.rect(-L.M, floorY, L.W + L.M * 2, H); g.clip();
  g.filter = `blur(${Math.max(1, Math.round(2.2 * U))}px)`;
  g.fillStyle = lc;
  g.globalAlpha = 0.55;
  for (const [u0, v0, u1, v1] of panes) {
    const a = pt(u0, v1), b = pt(u1, v1), cc = pt(u1, v0), d = pt(u0, v0);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
  }
  g.restore();
  return c;
}

/* ---- window sky (live) ---------------------------------------------------- */

const STARS = (() => {
  const r = mulberry(99);
  return Array.from({ length: 46 }, () => ({ x: r(), y: r() * 0.85, s: 0.5 + r() * 1.3, ph: r() * 6.3, sp: 1 + r() * 2.5 }));
})();
const CLOUDS = [
  { y: 0.26, s: 0.34, v: 5.5, o: 0.1 }, { y: 0.5, s: 0.26, v: 3.4, o: 0.55 }, { y: 0.15, s: 0.2, v: 7.5, o: 0.8 },
];

export function drawSky(g: Ctx, L: Layout, sky: SkyState, now: number, ox: number, oy: number, dim: number, hooks?: WindowHooks): void {
  const { win, U } = L;
  const x = win.x + ox, y = win.y + oy, w = win.w, h = win.h;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, css(sky.top)); gr.addColorStop(1, css(sky.bot));
  g.fillStyle = gr; g.fillRect(x, y, w, h);

  // stars
  if (sky.star > 0.02) {
    g.fillStyle = "#fffbe8";
    for (const s of STARS) {
      const tw = 0.55 + 0.45 * Math.sin(now * 0.001 * s.sp + s.ph);
      g.globalAlpha = sky.star * tw;
      const px = x + s.x * w, py = y + s.y * h, r = s.s * U * 0.9;
      g.fillRect(px - r, py - r * 0.35, r * 2, r * 0.7);
      g.fillRect(px - r * 0.35, py - r, r * 0.7, r * 2);
    }
    g.globalAlpha = 1;
  }
  // sun
  const arc = (u: number): [number, number] => [x + w * (0.12 + 0.76 * u), y + h * (0.82 - Math.sin(Math.PI * u) * 0.66)];
  if (sky.sunU >= 0) {
    const [sx, sy] = arc(sky.sunU);
    const low = 1 - Math.sin(Math.PI * sky.sunU);
    const col = low > 0.55 ? "#ffb58a" : "#FFE58F";
    drawGlowLocal(g, col, sx, sy, w * 0.55, 0.85);
    g.fillStyle = "#fffbe0"; g.beginPath(); g.arc(sx, sy, w * 0.072, 0, 6.3); g.fill();
  }
  if (sky.moonU >= 0) {
    const [mx, my] = arc(sky.moonU);
    const fade = clamp(sky.star * 1.5);
    g.globalAlpha = fade;
    drawGlowLocal(g, "#b8c4ff", mx, my, w * 0.5, 0.5);
    g.fillStyle = "#f4f1ff"; g.beginPath(); g.arc(mx, my, w * 0.085, 0, 6.3); g.fill();
    // crater shading via cut-out
    g.fillStyle = css(mix(sky.top, sky.bot, 0.3));
    g.beginPath(); g.arc(mx + w * 0.045, my - w * 0.02, w * 0.075, 0, 6.3); g.fill();
    g.globalAlpha = 1;
  }
  // clouds
  const cloudA = 0.9 - sky.star * 0.65;
  const cc = mix(hex("#ffffff"), mix(sky.top, sky.bot, 0.5), 0.35 + sky.star * 0.4);
  for (const c of CLOUDS) {
    const span = w * 1.6;
    const px = ((c.o * span + now * 0.001 * c.v * U) % span) - w * 0.3;
    const cw = w * c.s, cy = y + h * c.y;
    g.fillStyle = css(cc, cloudA * 0.9);
    g.beginPath();
    g.ellipse(x + px, cy, cw * 0.5, cw * 0.16, 0, 0, 6.3);
    g.ellipse(x + px - cw * 0.22, cy - cw * 0.08, cw * 0.26, cw * 0.17, 0, 0, 6.3);
    g.ellipse(x + px + cw * 0.14, cy - cw * 0.12, cw * 0.3, cw * 0.2, 0, 0, 6.3);
    g.fill();
  }
  hooks?.clouds?.(g, x, y, w, h);
  // hills (parallax layers)
  const hillFar = mix(sky.bot, hex(P.plum), 0.5 + sky.star * 0.3);
  const hillNear = mix(sky.bot, hex(P.ink), 0.62 + sky.star * 0.25);
  g.fillStyle = css(hillFar);
  g.beginPath(); g.moveTo(x, y + h);
  g.lineTo(x, y + h * 0.7);
  g.bezierCurveTo(x + w * 0.2, y + h * 0.5, x + w * 0.4, y + h * 0.78, x + w * 0.62, y + h * 0.66);
  g.bezierCurveTo(x + w * 0.8, y + h * 0.58, x + w * 0.9, y + h * 0.7, x + w, y + h * 0.64);
  g.lineTo(x + w, y + h); g.fill();
  g.fillStyle = css(hillNear);
  g.beginPath(); g.moveTo(x, y + h);
  g.lineTo(x, y + h * 0.86);
  g.bezierCurveTo(x + w * 0.25, y + h * 0.74, x + w * 0.5, y + h * 0.95, x + w * 0.75, y + h * 0.82);
  g.bezierCurveTo(x + w * 0.88, y + h * 0.76, x + w * 0.95, y + h * 0.84, x + w, y + h * 0.8);
  g.lineTo(x + w, y + h); g.fill();
  // tiny house lights in the valley at night
  if (sky.star > 0.3) {
    g.globalCompositeOperation = "lighter";
    for (const [fx, fy] of [[0.3, 0.9], [0.36, 0.88], [0.7, 0.87]] as const) drawGlowLocal(g, "#FFE58F", x + w * fx, y + h * fy, 6 * U, 0.7 * sky.star);
    g.globalCompositeOperation = "source-over";
  }
  hooks?.outside?.(g, x, y, w, h);
  // shades pulled when lights are off in daylight
  if (dim > 0.01) { g.fillStyle = css(hex(P.ink), dim); g.fillRect(x, y, w, h); }

  // mullions
  const mt = Math.max(3, 4.6 * U);
  const cream = hex("#f6e4d0");
  const lit = mix(cream, [cream[0] * sky.amb[0] / 255, cream[1] * sky.amb[1] / 255, cream[2] * sky.amb[2] / 255], 1 - dim * 0);
  g.fillStyle = css(lit);
  g.fillRect(x + w / 2 - mt / 2, y, mt, h);
  g.fillRect(x, y + h / 2 - mt / 2, w, mt);
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(x + w / 2 - mt / 2, y, 1.2, h);
  g.fillRect(x, y + h / 2 - mt / 2, w, 1.2);
  g.fillStyle = "rgba(58,42,107,0.25)";
  g.fillRect(x + w / 2 + mt / 2 - 1.2, y, 1.2, h);
  g.fillRect(x, y + h / 2 + mt / 2 - 1.2, w, 1.2);

  // glass reflections
  g.fillStyle = "rgba(255,255,255,0.07)";
  g.beginPath(); g.moveTo(x + w * 0.1, y); g.lineTo(x + w * 0.3, y); g.lineTo(x + w * 0.05, y + h * 0.5); g.lineTo(x, y + h * 0.42); g.lineTo(x, y + h * 0.3); g.fill();
  g.beginPath(); g.moveTo(x + w * 0.4, y); g.lineTo(x + w * 0.46, y); g.lineTo(x + w * 0.16, y + h * 0.66); g.lineTo(x + w * 0.1, y + h * 0.66); g.fill();
  hooks?.glass?.(g, x, y, w, h);
  // inner shadow from frame
  const is = g.createLinearGradient(0, y, 0, y + h * 0.12);
  is.addColorStop(0, "rgba(27,22,56,0.32)"); is.addColorStop(1, "rgba(27,22,56,0)");
  g.fillStyle = is; g.fillRect(x, y, w, h * 0.12);
  g.restore();
}

function drawGlowLocal(g: Ctx, col: string, x: number, y: number, r: number, a: number): void {
  drawGlow(g, col, x, y, r, a);
}

export function bakeAll(L: Layout): Omit<Layers, "shaft"> {
  return { wall: bakeWall(L), floor: bakeFloor(L), props: bakeProps(L) };
}

export { alpha };
export type { RGB };
