/**
 * Canvas 2D renderer for creatures. Design coordinates: origin at the body centre, body ~100 tall,
 * +y down. All colour comes from a palette derived from the species hue (see species.ts).
 */
import type { Species } from "@jevagotchi/core";
import type { Creature } from "./creature.js";
import { PK } from "./creature.js";
import { drawAccessories } from "./accessories.js";
import { DEFS, type Palette } from "./species.js";
import { TAU, clamp, hsl, lerp, mixHsl, smooth } from "./math.js";

const N = 72;
const px = new Float32Array(N);
const py = new Float32Array(N);
const INK_H = 258;

/* ------------------------------------------------------------------ palette */

export function makePalette(c: Creature): Palette {
  const b = c.base;
  const hs = c.seed < 0 ? 0.5 : c.seed;
  const g = c.ghost;
  let h = b.h + (hs - 0.5) * 30;
  let s = b.s, l = b.l + (hs - 0.5) * 6;
  const sick = c.sickV;
  if (sick > 0) { h = h + (((92 - h + 540) % 360) - 180) * sick * 0.1; s *= 1 - sick * 0.2; l -= sick * 3; }
  if (g > 0) { const m = mixHsl({ h, s, l }, { h: 228, s: 70, l: 86 }, g * 0.9); h = m.h; s = m.s; l = m.l; }
  const egg = c.attach.egg;
  return {
    base: { h, s, l },
    light: hsl(h - 8, s * 0.85, Math.min(97, l + 24 + egg * 2)),
    core: hsl(h - 14, s * 0.9, Math.min(98, l + 15)),
    mid: hsl(h, s, l),
    dark: hsl(h + 14, Math.min(100, s + 6), l - 20),
    deep: hsl(h + 30, Math.min(100, s + 4), Math.max(8, l - 40)),
    rim: hsl(h - 32, Math.min(100, s + 10), Math.min(96, l + 38)),
    hi: hsl(h - 10, 100, 96),
    belly: hsl(h - 12, s * 0.8, Math.min(97, l + 22)),
    bellyEdge: hsl(h - 6, s * 0.8, Math.min(97, l + 10)),
    accent: hsl(h + 42, 90, 62),
    accentDark: hsl(h + 42, 70, 30),
  };
}

/* ---------------------------------------------------------------- body path */

function computePoints(c: Creature, tt: number): void {
  const sh = c.shape;
  const { rx, ry } = sh;
  const m0 = c.modes[0]!.x, m1 = c.modes[1]!.x, m2 = c.modes[2]!.x, m3 = c.modes[3]!.x;
  const g = c.ghost, puff = c.cheekPuff, sr = c.shear.x;
  const nA = 2 / sh.nTop, nB = 2 / sh.nBot;
  for (let i = 0; i < N; i++) {
    const th = -Math.PI / 2 + (i / N) * TAU;
    const co = Math.cos(th), si = Math.sin(th);
    let x = rx * Math.sign(co) * Math.pow(Math.abs(co), si < 0 ? nA : nB);
    let y = ry * Math.sign(si) * Math.pow(Math.abs(si), si < 0 ? nA : nB);
    const yn = y / ry;
    x *= 1 + sh.pear * yn;
    if (sh.point > 0 && yn < 0) x *= 1 - sh.point * Math.pow(-yn, 2);
    let r = 0;
    if (sh.lump > 0.01 && si < 0) {
      const a = Math.abs(co) < 0.02 ? 0 : 0;
      void a;
      for (let k = -1; k <= 1; k++) { const d = (th + Math.PI / 2 - k * 0.62) / 0.34; r += sh.lump * 5.5 * Math.exp(-d * d) * (k === 0 ? 0.55 : 1); }
    }
    r += (m0 * Math.cos(2 * th + 0.4) + m1 * Math.cos(3 * th + 1.3) + m2 * Math.cos(4 * th + 2.1) + m3 * Math.cos(5 * th)) * 1.4;
    if (puff > 0.01) {
      const d1 = (th - 0.5) / 0.4, d2 = (th - (Math.PI - 0.5)) / 0.4;
      r += puff * 6.5 * (Math.exp(-d1 * d1) + Math.exp(-d2 * d2));
    }
    x += co * r; y += si * r;
    if (g > 0.01 && yn > 0) {
      x += g * Math.sin(y * 0.22 + tt * 2.2) * 2.4 * yn;
      y += g * (Math.sin(x * 0.33 + tt * 2.6) * 3.4 * yn * yn + 6 * yn);
    }
    x += sr * 0.45 * (-yn);
    px[i] = x; py[i] = y;
  }
}

function buildPath(): Path2D {
  const p = new Path2D();
  p.moveTo((px[N - 1]! + px[0]!) / 2, (py[N - 1]! + py[0]!) / 2);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    p.quadraticCurveTo(px[i]!, py[i]!, (px[i]! + px[j]!) / 2, (py[i]! + py[j]!) / 2);
  }
  p.closePath();
  return p;
}

/* ------------------------------------------------------------------ helpers */

function leaf(ctx: CanvasRenderingContext2D, bx: number, by: number, tx: number, ty: number, w: number): void {
  const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, h = w / 2;
  ctx.beginPath();
  ctx.moveTo(bx - nx * h * 0.6, by - ny * h * 0.6);
  ctx.bezierCurveTo(bx - nx * h * 1.5 + ux * L * 0.3, by - ny * h * 1.5 + uy * L * 0.3, tx - nx * h * 1.05 - ux * L * 0.1, ty - ny * h * 1.05 - uy * L * 0.1, tx, ty);
  ctx.bezierCurveTo(tx + nx * h * 1.05 - ux * L * 0.1, ty + ny * h * 1.05 - uy * L * 0.1, bx + nx * h * 1.5 + ux * L * 0.3, by + ny * h * 1.5 + uy * L * 0.3, bx + nx * h * 0.6, by + ny * h * 0.6);
  ctx.closePath();
}

function jellyFill(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, a: string, b: string): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}

/** Soft tube along points with tapering width (drawn as capsules). */
function tube(ctx: CanvasRenderingContext2D, xs: number[], ys: number[], w0: number, w1: number, fill: string, edge: string, hi?: string): void {
  const n = xs.length;
  for (let pass = 0; pass < 3; pass++) {
    if (pass === 2 && !hi) break;
    ctx.strokeStyle = pass === 0 ? edge : pass === 1 ? fill : hi!;
    ctx.lineCap = "round";
    for (let i = 0; i < n - 1; i++) {
      const u = i / (n - 1);
      const w = lerp(w0, w1, u);
      ctx.lineWidth = pass === 0 ? w + 2.2 : pass === 1 ? w : Math.max(0.8, w * 0.28);
      ctx.beginPath();
      const o = pass === 2 ? -w * 0.2 : 0;
      ctx.moveTo(xs[i]! + o, ys[i]! + (pass === 2 ? -w * 0.1 : 0)); ctx.lineTo(xs[i + 1]! + o, ys[i + 1]! + (pass === 2 ? -w * 0.1 : 0));
      ctx.stroke();
    }
  }
}

const tx: number[] = [], ty: number[] = [];
function chain(n: number): void { tx.length = n; ty.length = n; }

/* ---------------------------------------------------------------- main draw */

export function drawCreature(c: Creature, ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  if (!c.hasParams) return;
  const k = size / 100;
  const sh = c.shape;
  const g = c.ghost;
  const pal = makePalette(c);
  const tt = c.t;
  const sqv = clamp(c.sq.x, -0.45, 0.6);
  const sy = 1 + sqv, sx = 1 / Math.sqrt(1 + sqv);
  const bob = g * (Math.sin(tt * 1.6) * 3 - 26);
  const sc = c.scaleS.x;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);

  /* halo behind (evolve / hatch / ghost) */
  if (c.glow > 0.02) drawHalo(c, ctx, pal, bob);

  ctx.translate(0, 50 + c.hop.x + bob);
  ctx.scale(sx * sc, sy * sc);
  ctx.translate(0, -sh.ry);
  ctx.rotate(c.tilt.x + c.spinAngle);
  if (g > 0.01) ctx.globalAlpha = lerp(1, 0.72, g);

  const isEgg = c.shown === "egg";

  /* shell bottom (hatch) is drawn after the creature; top piece flies free */
  computePoints(c, tt);
  const path = buildPath();

  drawBack(c, ctx, pal);
  drawBody(c, ctx, pal, path, isEgg);
  if (!isEgg || c.attach.egg < 0.5) drawFace(c, ctx, pal);
  drawFront(c, ctx, pal);
  drawAccessories(c, ctx, pal, c.acc);
  if (g > 0.05) drawHaloRing(c, ctx, g);
  if (c.dirtV > 0.05 && g < 0.5) drawFlies(c, ctx);
  if (c.shellT >= 0) drawShell(c, ctx, pal);
  if (c.sleepV > 0.05 && c.bubble > 0.02) drawSnot(c, ctx);

  ctx.restore();

  /* particles in screen-aligned design space */
  ctx.save();
  ctx.translate(cx, cy + (50 - sh.ry + c.hop.x + bob) * k);
  ctx.scale(k, k);
  drawParticles(c, ctx);
  ctx.restore();
}

/* -------------------------------------------------------------------- halo */

function drawHalo(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette, bob: number): void {
  const R = 80 * (0.7 + c.glow * 0.6);
  const oy = 50 - c.shape.ry + c.hop.x * 0 + bob;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(0, oy, 0, 0, oy, R);
  const h = pal.base.h;
  g.addColorStop(0, hsl(h, 100, 78, 0.55 * c.glow));
  g.addColorStop(0.45, hsl(h + 20, 100, 65, 0.22 * c.glow));
  g.addColorStop(1, hsl(h + 30, 100, 60, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, oy, R, 0, TAU); ctx.fill();
  if (c.rn === "evolve") {
    const n = 12;
    ctx.fillStyle = hsl(50, 100, 80, 0.08 * c.glow);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + c.t * 0.6, w = 0.06;
      ctx.beginPath(); ctx.moveTo(0, oy);
      ctx.lineTo(Math.cos(a - w) * R * 1.6, oy + Math.sin(a - w) * R * 1.6);
      ctx.lineTo(Math.cos(a + w) * R * 1.6, oy + Math.sin(a + w) * R * 1.6);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHaloRing(c: Creature, ctx: CanvasRenderingContext2D, g: number): void {
  const y = -c.shape.ry - 15 + Math.sin(c.t * 2) * 1.5;
  ctx.save();
  ctx.globalAlpha = g;
  ctx.globalCompositeOperation = "lighter";
  const gl = ctx.createRadialGradient(0, y, 4, 0, y, 30);
  gl.addColorStop(0, "rgba(255,229,143,.55)"); gl.addColorStop(1, "rgba(255,229,143,0)");
  ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(0, y, 30, 14, 0, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = "#FFE58F";
  ctx.beginPath(); ctx.ellipse(0, y, 15, 4.6, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeStyle = "#fff8d8";
  ctx.beginPath(); ctx.ellipse(0, y - 0.9, 15, 4.6, 0, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
  ctx.restore();
}

/* -------------------------------------------------------------------- body */

function drawBody(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette, path: Path2D, isEgg: boolean): void {
  const sh = c.shape;
  const { rx, ry } = sh;
  const R = Math.max(rx, ry);
  const t = c.t;
  // base jelly gradient
  const gr = ctx.createRadialGradient(-rx * 0.28, -ry * 0.36, R * 0.05, -rx * 0.05, ry * 0.05, R * 1.3);
  gr.addColorStop(0, pal.core);
  gr.addColorStop(0.35, pal.mid);
  gr.addColorStop(0.8, pal.dark);
  gr.addColorStop(1, pal.deep);
  ctx.fillStyle = gr;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);

  // subsurface glow core
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.3);
  const sg = ctx.createRadialGradient(0, ry * 0.12, 0, 0, ry * 0.12, R * 0.85);
  sg.addColorStop(0, pal.light.replace(/[\d.]+\)$/, `${0.5 + 0.12 * pulse})`));
  sg.addColorStop(1, pal.light.replace(/[\d.]+\)$/, "0)"));
  ctx.fillStyle = sg;
  ctx.fillRect(-rx * 1.3, -ry * 1.3, rx * 2.6, ry * 2.6);

  // species patterns
  drawPatterns(c, ctx, pal);

  // suspended bubbles in the jelly
  for (const b of c.bubbles) {
    const bx = (b.x + Math.sin(t * b.sp + b.ph) * 0.1) * rx * 0.75;
    const by = (b.y + Math.cos(t * b.sp * 0.8 + b.ph) * 0.08) * ry * 0.75;
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.beginPath(); ctx.arc(bx, by, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.beginPath(); ctx.arc(bx - b.r * 0.3, by - b.r * 0.32, b.r * 0.32, 0, TAU); ctx.fill();
  }

  // blush cheeks
  if (!isEgg) drawBlush(c, ctx, pal);

  // floor bounce light (peach) + shade on lower right
  const bl = ctx.createLinearGradient(0, ry, 0, ry * 0.25);
  bl.addColorStop(0, "rgba(255,181,138,.42)"); bl.addColorStop(1, "rgba(255,181,138,0)");
  ctx.fillStyle = bl; ctx.fillRect(-rx * 1.3, -ry * 1.3, rx * 2.6, ry * 2.6);
  const sd = ctx.createRadialGradient(rx * 0.65, ry * 0.55, 0, rx * 0.65, ry * 0.55, R * 0.9);
  sd.addColorStop(0, "rgba(27,22,56,.0)"); sd.addColorStop(1, "rgba(27,22,56,0)");

  // sick tint & evolve flash
  if (c.sickV > 0.02) { ctx.fillStyle = `hsla(96,60%,48%,${0.26 * c.sickV})`; ctx.fillRect(-rx * 1.3, -ry * 1.3, rx * 2.6, ry * 2.6); }

  // rim light: inner stroke on the lit edge (upper-left) + cooler back-rim lower-right
  const rg = ctx.createLinearGradient(-rx, -ry, rx, ry);
  rg.addColorStop(0, pal.rim); rg.addColorStop(0.4, pal.rim.replace(/[\d.]+\)$/, "0.25)")); rg.addColorStop(0.62, "rgba(255,255,255,0)"); rg.addColorStop(1, "rgba(255,181,138,.6)");
  ctx.lineWidth = 5; ctx.strokeStyle = rg; ctx.stroke(path);

  // specular highlights
  drawSpecular(c, ctx);

  // clean sheen sweep
  if (c.sheenT >= 0 && c.sheenT <= 1) {
    const x = lerp(-rx * 1.5, rx * 1.5, c.sheenT);
    ctx.save(); ctx.transform(1, 0, -0.5, 1, 0, 0);
    const sg2 = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
    sg2.addColorStop(0, "rgba(255,255,255,0)"); sg2.addColorStop(0.5, "rgba(255,255,255,.65)"); sg2.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg2; ctx.fillRect(x - 14, -ry * 1.3, 28, ry * 2.6); ctx.restore();
  }

  if (c.white > 0.01) {
    const wv = clamp(c.white);
    ctx.fillStyle = `rgba(255,252,240,${wv * 0.95})`;
    ctx.fillRect(-rx * 1.3, -ry * 1.3, rx * 2.6, ry * 2.6);
  }
  ctx.restore();

  // outline
  ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  ctx.strokeStyle = pal.deep.replace(/[\d.]+\)$/, "0.5)");
  ctx.stroke(path);
}

function drawBlush(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette): void {
  const b = clamp(c.out.blush + c.fd.blushBase * 0.35, 0, 1) * (1 - c.sickV * 0.8) * (1 - c.ghost);
  if (b < 0.02) return;
  const fd = c.fd;
  const fox = c.lookX.x * 3;
  const ys = (fd.eyeY + fd.mouthY) / 2 + fd.eyeRy * 0.35;
  const r = 7 + fd.eyeRx * 0.35;
  for (let s = -1; s <= 1; s += 2) {
    const x = s * (fd.eyeSp + fd.eyeRx * 0.85) + fox;
    const gr = ctx.createRadialGradient(x, ys, 0, x, ys, r);
    gr.addColorStop(0, `hsla(350,100%,70%,${0.62 * b})`);
    gr.addColorStop(0.6, `hsla(350,100%,72%,${0.3 * b})`);
    gr.addColorStop(1, "hsla(350,100%,72%,0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(x, ys, r * 1.15, r * 0.8, 0, 0, TAU); ctx.fill();
  }
  void pal;
}

function drawSpecular(c: Creature, ctx: CanvasRenderingContext2D): void {
  const { rx, ry } = c.shape;
  const stiff = c.attach.stoic;
  ctx.save();
  ctx.translate(-rx * 0.5, -ry * 0.74);
  ctx.rotate(-0.55 + c.sway.x * 0.004);
  const g = ctx.createLinearGradient(0, -ry * 0.16, 0, ry * 0.16);
  g.addColorStop(0, `rgba(255,255,255,${0.75 - stiff * 0.25})`); g.addColorStop(1, "rgba(255,255,255,.08)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.2, ry * 0.085, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.beginPath(); ctx.arc(-rx * 0.66, -ry * 0.22, Math.max(1.6, rx * 0.04), 0, TAU); ctx.fill();
  // faint lower reflected crescent
  ctx.strokeStyle = "rgba(255,240,230,.22)"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.ellipse(0, ry * 0.05, rx * 0.86, ry * 0.86, 0, 0.35, 1.2); ctx.stroke();
}

/* --------------------------------------------------------------- patterns */

function drawPatterns(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette): void {
  const { rx, ry } = c.shape;
  const A = c.attach;
  const t = c.t;
  const patch = (cxp: number, cyp: number, rxp: number, ryp: number, a: number): void => {
    if (a < 0.02) return;
    const gr = ctx.createRadialGradient(cxp, cyp - ryp * 0.2, 0, cxp, cyp, Math.max(rxp, ryp));
    gr.addColorStop(0, pal.belly.replace(/[\d.]+\)$/, `${0.85 * a})`));
    gr.addColorStop(0.75, pal.bellyEdge.replace(/[\d.]+\)$/, `${0.5 * a})`));
    gr.addColorStop(1, pal.bellyEdge.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(cxp, cyp, rxp, ryp, 0, 0, TAU); ctx.fill();
  };
  patch(0, ry * 0.42, rx * 0.5, ry * 0.42, A.blobule * 0.8 + A.jevling * 0.9 + A.placid * 1 + A.needy * 0.8);
  if (A.jevling > 0.02) {
    ctx.fillStyle = `hsla(${pal.base.h + 40},80%,70%,${0.6 * A.jevling})`;
    const dots = [[-0.5, -0.25, 3], [0.55, 0.05, 2.4], [-0.35, 0.5, 2.2], [0.2, -0.6, 2.2]] as const;
    for (const d of dots) { ctx.beginPath(); ctx.arc(d[0] * rx, d[1] * ry, d[2], 0, TAU); ctx.fill(); }
  }
  if (A.feral > 0.02) {
    patch(0, ry * 0.5, rx * 0.46, ry * 0.4, A.feral * 0.9);
    ctx.fillStyle = pal.deep.replace(/[\d.]+\)$/, `${0.4 * A.feral})`);
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const x0 = s * rx * (0.62 + i * 0.1), y0 = -ry * (0.05 - i * 0.22);
      ctx.moveTo(x0, y0); ctx.lineTo(x0 - s * rx * 0.34, y0 + ry * 0.1); ctx.lineTo(x0 - s * rx * 0.3, y0 + ry * 0.2); ctx.lineTo(x0 + s * 4, y0 + ry * 0.15); ctx.fill();
    }
    // fur zigzag on chest
    ctx.fillStyle = pal.hi.replace(/[\d.]+\)$/, `${0.22 * A.feral})`);
    ctx.beginPath(); ctx.moveTo(-rx * 0.34, ry * 0.15);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-rx * 0.34 + (i / 6) * rx * 0.68, ry * 0.15 + (i % 2 ? 9 : 0));
    ctx.lineTo(rx * 0.34, ry * 0.05); ctx.lineTo(-rx * 0.34, ry * 0.05); ctx.fill();
  }
  if (A.needy > 0.02) {
    // heart-shaped tummy patch
    const y = ry * 0.5, s = 9;
    ctx.fillStyle = `hsla(350,100%,80%,${0.55 * A.needy})`;
    ctx.beginPath(); ctx.moveTo(0, y + s * 0.9);
    ctx.bezierCurveTo(-s * 1.6, y + s * 0.1, -s * 0.9, y - s * 1.1, 0, y - s * 0.3);
    ctx.bezierCurveTo(s * 0.9, y - s * 1.1, s * 1.6, y + s * 0.1, 0, y + s * 0.9); ctx.fill();
  }
  if (A.stoic > 0.02) {
    ctx.fillStyle = pal.belly.replace(/[\d.]+\)$/, `${0.55 * A.stoic})`);
    ctx.beginPath(); ctx.roundRect(-rx * 0.5, ry * 0.18, rx * 1.0, ry * 0.6, 9); ctx.fill();
    ctx.strokeStyle = pal.deep.replace(/[\d.]+\)$/, `${0.28 * A.stoic})`); ctx.lineWidth = 1.5;
    for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-rx * 0.5, ry * (0.18 + i * 0.2)); ctx.lineTo(rx * 0.5, ry * (0.18 + i * 0.2)); ctx.stroke(); }
    // faceted shoulder shading
    ctx.fillStyle = pal.deep.replace(/[\d.]+\)$/, `${0.16 * A.stoic})`);
    ctx.beginPath(); ctx.moveTo(rx, -ry * 0.3); ctx.lineTo(rx * 0.62, ry * 0.05); ctx.lineTo(rx, ry * 0.7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-rx, -ry * 0.3); ctx.lineTo(-rx * 0.62, ry * 0.05); ctx.lineTo(-rx, ry * 0.7); ctx.fill();
  }
  if (A.insatiable > 0.02) {
    const gu = c.gurgle * Math.sin(t * 22) * 2;
    const bx = 0, by = ry * 0.42, brx = rx * 0.66 + gu, bry = ry * 0.52 + gu;
    patch(bx, by, brx, bry, A.insatiable * 1.1);
    ctx.strokeStyle = pal.hi.replace(/[\d.]+\)$/, `${(0.25 + c.hungerV * 0.3) * A.insatiable})`); ctx.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(bx, by, brx * (0.55 + i * 0.28 + 0.05 * Math.sin(t * 3 + i)), bry * (0.55 + i * 0.28), 0, 0.4, 2.7); ctx.stroke(); }
    ctx.fillStyle = `hsla(${pal.base.h + 50},100%,85%,${0.5 * A.insatiable})`;
    const ss = [[-0.7, -0.2, 2.6], [0.75, -0.1, 2], [-0.55, 0.25, 1.8], [0.45, 0.4, 2.2]] as const;
    for (const d of ss) { ctx.beginPath(); ctx.arc(d[0] * rx, d[1] * ry, d[2], 0, TAU); ctx.fill(); }
  }
  if (A.placid > 0.02) {
    // soft cloud puffs lightening the head
    ctx.fillStyle = pal.hi.replace(/[\d.]+\)$/, `${0.18 * A.placid})`);
    ctx.beginPath(); ctx.arc(-rx * 0.5, -ry * 0.7, rx * 0.28, 0, TAU); ctx.arc(rx * 0.35, -ry * 0.82, rx * 0.22, 0, TAU); ctx.fill();
  }
  if (A.egg > 0.02) drawEggDetails(c, ctx, pal);
}

function drawEggDetails(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette): void {
  const { rx, ry } = c.shape;
  const a = c.attach.egg;
  const pulse = 0.5 + 0.5 * Math.sin(c.t * 1.8);
  // creature glow inside the shell
  const gl = ctx.createRadialGradient(0, ry * 0.12, 0, 0, ry * 0.12, ry * 0.9);
  const gv = 0.28 + 0.25 * pulse + c.glow * 0.4;
  gl.addColorStop(0, `hsla(168,90%,72%,${gv * a})`); gl.addColorStop(1, "hsla(168,90%,72%,0)");
  ctx.fillStyle = gl; ctx.fillRect(-rx * 1.3, -ry * 1.3, rx * 2.6, ry * 2.6);
  for (const s of c.speckle) {
    ctx.fillStyle = `hsla(${s.h},70%,${s.h > 300 ? 72 : 58}%,${0.55 * a})`;
    ctx.beginPath(); ctx.ellipse(s.x * rx, s.y * ry, s.r, s.r * 0.8, s.x, 0, TAU); ctx.fill();
  }
  // crack
  const crack = clamp(c.eggCrack);
  if (crack > 0.03) {
    const pts = CRACK;
    const n = crack * (pts.length - 1);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? `hsla(168,100%,80%,${0.55 * a})` : `hsla(258,55%,22%,${0.85 * a})`;
      ctx.lineWidth = pass === 0 ? 4.4 : 1.5;
      ctx.beginPath(); ctx.moveTo(pts[0]![0]! * rx, pts[0]![1]! * ry);
      for (let i = 1; i <= Math.floor(n); i++) ctx.lineTo(pts[i]![0]! * rx, pts[i]![1]! * ry);
      const f = n - Math.floor(n), i0 = Math.floor(n);
      if (i0 < pts.length - 1) ctx.lineTo(lerp(pts[i0]![0]!, pts[i0 + 1]![0]!, f) * rx, lerp(pts[i0]![1]!, pts[i0 + 1]![1]!, f) * ry);
      ctx.stroke();
    }
  }
  void pal;
}
const CRACK: [number, number][] = [[0.05, -0.62], [-0.1, -0.48], [0.08, -0.36], [-0.12, -0.22], [0.1, -0.1], [-0.06, 0.02], [0.14, 0.12], [-0.02, 0.22], [0.2, 0.3]];

/* ------------------------------------------------------------------- face */

function drawFace(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette): void {
  const fd = c.fd, O = c.out;
  const vis = 1 - clamp((c.attach.egg) * 1);
  if (vis < 0.02) return;
  ctx.save();
  ctx.globalAlpha *= vis;
  const fox = c.lookX.x * 3.6 * (c.shape.rx / 45), foy = c.lookY.x * 2.4;
  // eyes
  for (let s = -1; s <= 1; s += 2) drawEye(c, ctx, pal, s, fox, foy);
  drawBrows(c, ctx, pal, fox, foy);
  drawMouth(c, ctx, pal, fox * 0.8, foy * 0.8);
  void fd; void O;
  ctx.restore();
}

function drawEye(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette, s: number, fox: number, foy: number): void {
  const fd = c.fd, O = c.out, t = c.t;
  const openEff = clamp(O.open, 0, 1.4);
  const sizeMul = openEff > 1 ? 1 + (openEff - 1) * 0.7 : 1;
  const rx = fd.eyeRx * sizeMul, ry = fd.eyeRy * sizeMul;
  const ex = s * fd.eyeSp + fox, ey = fd.eyeY + foy;
  const lidTot = clamp(O.lid + fd.lidBase, 0, 0.92);
  let cov = 1 - (1 - lidTot) * Math.min(openEff, 1);
  if (O.arc > 0) cov = Math.max(cov, O.arc);
  cov = clamp(cov);
  const closedA = smooth((cov - 0.82) / 0.18);
  const tilt = -s * (fd.eyeTilt + O.brow * 0.09);
  const quiver = c.p.mood === "anxious" || c.attach.needy > 0.5 ? Math.sin(t * 27 + s) * 0.35 * (c.attach.needy > 0.5 ? 0.6 : 1) : 0;

  ctx.save();
  ctx.translate(ex + quiver, ey);
  ctx.rotate(tilt);

  if (cov < 0.995) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.clip();
    // eye fill: glossy dark  <->  white sclera
    const sc = fd.scl;
    const gl = ctx.createRadialGradient(0, -ry * 0.2, 0, 0, 0, Math.max(rx, ry) * 1.1);
    gl.addColorStop(0, hsl(INK_H - 6 * (1 - sc), lerp(45, 90, sc), lerp(24, 99, sc)));
    gl.addColorStop(0.7, hsl(INK_H, lerp(55, 80, sc), lerp(14, 92, sc)));
    gl.addColorStop(1, hsl(INK_H + 4, lerp(60, 60, sc), lerp(8, 74, sc)));
    ctx.fillStyle = gl; ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
    // iris + pupil tracking gaze
    const lx = c.lookX.x, ly = c.lookY.x;
    const irX = rx * fd.ir, irY = ry * fd.ir;
    const ix = lx * rx * 0.4, iy = ly * ry * 0.34;
    const feral = c.attach.feral;
    const ig = ctx.createLinearGradient(0, iy - irY, 0, iy + irY);
    ig.addColorStop(0, hsl(pal.base.h + 20, 60, lerp(18, 26, sc)));
    ig.addColorStop(0.55, hsl(pal.base.h + 30, 70, lerp(30, 46, sc)));
    ig.addColorStop(1, hsl(pal.base.h + 42, 95, lerp(58, 66, sc)));
    ctx.fillStyle = ig;
    ctx.beginPath(); ctx.ellipse(ix, iy, irX, irY, 0, 0, TAU); ctx.fill();
    const pu = clamp(O.pupil, 0.4, 1.6);
    const pr = irX * lerp(0.62, 0.52, sc) * pu;
    ctx.fillStyle = hsl(INK_H, 55, 8);
    ctx.beginPath(); ctx.ellipse(ix, iy, pr * (1 - 0.62 * feral), Math.min(irY * 0.95, pr * lerp(1.05, 1.15, feral)), 0, 0, TAU); ctx.fill();
    // highlights (fixed to the light source, drift slightly with gaze)
    const ha = 1 - cov * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${0.96 * ha})`;
    ctx.beginPath(); ctx.ellipse(-rx * 0.3 - lx * rx * 0.05, -ry * 0.34 - ly * ry * 0.04, rx * 0.3, ry * 0.27, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.75 * ha})`;
    ctx.beginPath(); ctx.arc(rx * 0.32 - lx * rx * 0.05, ry * 0.36, rx * 0.13, 0, TAU); ctx.fill();
    // watery meniscus
    const tear = clamp(O.tear + c.attach.needy * 0.4 + (c.attach.placid > 0.5 ? 0.0 : 0));
    if (tear > 0.02) {
      const wg = ctx.createLinearGradient(0, ry * 0.3, 0, ry);
      wg.addColorStop(0, "rgba(190,235,255,0)"); wg.addColorStop(1, `rgba(190,235,255,${0.75 * tear})`);
      ctx.fillStyle = wg; ctx.fillRect(-rx, ry * 0.3, rx * 2, ry);
      ctx.fillStyle = `rgba(255,255,255,${0.5 * tear * ha})`;
      ctx.beginPath(); ctx.ellipse(rx * 0.05, ry * 0.72, rx * 0.5, ry * 0.08, 0, 0, TAU); ctx.fill();
    }
    // lower lid (cheek push)
    const low = clamp(O.lower, 0, 0.6);
    if (low > 0.01) {
      ctx.fillStyle = pal.mid;
      const yy = ry - low * ry * 1.4;
      ctx.beginPath(); ctx.moveTo(-rx * 1.3, ry * 1.3); ctx.lineTo(-rx * 1.3, yy + ry * 0.3); ctx.quadraticCurveTo(0, yy - ry * 0.5, rx * 1.3, yy + ry * 0.3); ctx.lineTo(rx * 1.3, ry * 1.3); ctx.fill();
    }
    // upper lid
    const slant = O.brow * 0.34 * ry;
    const lidY = -ry * 1.05 + cov * ry * 2.2;
    const yin = lidY + slant, yout = lidY - slant * 0.35;
    const xin = -s * rx * 1.3, xout = s * rx * 1.3; // inner end is towards the face centre
    const lidCol = pal.mid;
    ctx.fillStyle = lidCol;
    ctx.beginPath(); ctx.moveTo(xout, -ry * 1.5); ctx.lineTo(xout, yout);
    ctx.quadraticCurveTo(0, (yin + yout) / 2 + ry * 0.12 * cov, xin, yin);
    ctx.lineTo(xin, -ry * 1.5); ctx.closePath(); ctx.fill();
    // lash line
    if (cov > 0.02 || Math.abs(slant) > 0.5) {
      ctx.strokeStyle = hsl(INK_H, 55, 14); ctx.lineWidth = 2.1; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(xout, yout); ctx.quadraticCurveTo(0, (yin + yout) / 2 + ry * 0.12 * cov, xin, yin); ctx.stroke();
    }
    ctx.restore();
    // eye rim
    ctx.strokeStyle = hsl(INK_H, 55, 12, 0.55 * (1 - closedA) * (1 - cov)); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
  }
  if (closedA > 0.01) {
    const curv = clamp(O.arc + (-0.35) * (1 - clamp(O.arc * 3)), -1, 1);
    ctx.strokeStyle = hsl(INK_H, 55, 14, closedA); ctx.lineWidth = Math.max(2.6, rx * 0.3); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-rx * 0.95, ry * 0.1);
    ctx.quadraticCurveTo(0, ry * 0.1 - curv * ry * (curv > 0 ? 1.7 : 1.1), rx * 0.95, ry * 0.1);
    ctx.stroke();
    if (c.attach.feral > 0.3 && curv > 0) { /* fierce grin eyes keep their lash */ }
  }
  ctx.restore();
}

function drawBrows(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette, fox: number, foy: number): void {
  const fd = c.fd, O = c.out;
  const heavy = clamp((fd.browW - 4.5) / 4.5);
  const browV = O.brow + fd.browBase;
  if (Math.abs(browV) < 0.06 && heavy < 0.02 && fd.browW < 3.5) return;
  for (let s = -1; s <= 1; s += 2) {
    const ex = s * fd.eyeSp + fox;
    const openLift = clamp(O.open - 1, 0, 0.4) * 10;
    const by = fd.eyeY + foy - fd.eyeRy * lerp(1.55, 0.95, heavy) - O.browY * 0.7 - openLift + browV * 1.8 + (1 - Math.min(O.open, 1)) * 2.5;
    const w = fd.eyeRx * lerp(1.15, 1.55, heavy);
    ctx.save();
    ctx.translate(ex, by);
    ctx.rotate(-s * (browV * 0.5 + heavy * 0.1) * (s === 1 ? 1 : 1));
    ctx.lineCap = "round";
    ctx.strokeStyle = pal.deep.replace(/[\d.]+\)$/, `${lerp(0.7, 1, heavy)})`);
    ctx.lineWidth = fd.browW;
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, -2.4 * (1 - heavy), w, 0); ctx.stroke();
    if (heavy > 0.3) { // top light catch on the slab
      ctx.strokeStyle = pal.rim.replace(/[\d.]+\)$/, "0.35)"); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-w * 0.8, -fd.browW * 0.28); ctx.lineTo(w * 0.8, -fd.browW * 0.28); ctx.stroke();
    }
    ctx.restore();
  }
  // scar over the feral's left brow
  if (c.attach.feral > 0.4) {
    ctx.save(); ctx.globalAlpha *= c.attach.feral;
    ctx.strokeStyle = "rgba(255,240,220,.85)"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    const x = -fd.eyeSp + fox, y = fd.eyeY + foy;
    ctx.beginPath(); ctx.moveTo(x - 4, y - fd.eyeRy * 2.3); ctx.lineTo(x + 2, y - fd.eyeRy * 1.0); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(x - 6 + i * 3, y - fd.eyeRy * 2.0 + i * 3); ctx.lineTo(x + 0 + i * 3, y - fd.eyeRy * 1.7 + i * 3); ctx.stroke(); }
    ctx.restore();
  }
}

function drawMouth(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette, fox: number, foy: number): void {
  const fd = c.fd, O = c.out, t = c.t;
  const w = fd.mouthW * O.mw * (1 - 0.35 * clamp(O.mopen * (c.attach.insatiable > 0.5 ? 0 : 1)));
  const my = fd.mouthY + foy + Math.sin(t * 40) * c.gurgle * 0.4;
  const mo = clamp(Math.max(O.mopen, c.attach.insatiable * 0.22 + c.attach.feral * 0.05), 0, 1.1);
  const curve = O.curve + c.attach.feral * 0.25;
  const h1 = fd.mouthDepth * 0.5;
  const M = 14;
  const wobbleAmp = O.wav * 1.9;
  const yTop = (u: number): number => { const b = 1 - (2 * u - 1) ** 2; return -curve * h1 * (1 - b) + curve * h1 * 0.28 * b * (curve > 0 ? 1 : 0.4) + wobbleAmp * Math.sin(u * 9.4 + t * 9) * Math.sin(u * Math.PI); };
  const depth = (u: number): number => mo * fd.mouthDepth * Math.pow(Math.max(0, 1 - (2 * u - 1) ** 2), 0.65);
  ctx.save();
  ctx.translate(fox, my);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (mo > 0.04) {
    ctx.beginPath();
    for (let i = 0; i <= M; i++) { const u = i / M; const x = lerp(-w, w, u); if (i === 0) ctx.moveTo(x, yTop(u)); else ctx.lineTo(x, yTop(u)); }
    for (let i = M; i >= 0; i--) { const u = i / M; ctx.lineTo(lerp(-w, w, u), yTop(u) + depth(u)); }
    ctx.closePath();
    const mg = ctx.createLinearGradient(0, -2, 0, fd.mouthDepth * mo + 4);
    mg.addColorStop(0, hsl(330, 60, 14)); mg.addColorStop(1, hsl(340, 60, 26));
    ctx.fillStyle = mg; ctx.fill();
    ctx.save(); ctx.clip();
    // tongue
    ctx.fillStyle = hsl(350, 85, 68);
    ctx.beginPath(); ctx.ellipse(w * 0.05, yTop(0.5) + depth(0.5) * 1.0, w * 0.55, Math.max(2, depth(0.5) * 0.55), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = hsl(350, 90, 78, 0.7);
    ctx.beginPath(); ctx.ellipse(w * 0.05, yTop(0.5) + depth(0.5) * 0.86, w * 0.3, Math.max(1, depth(0.5) * 0.16), 0, 0, TAU); ctx.fill();
    // teeth along the top lip
    if (fd.fang > 0.05) {
      ctx.fillStyle = "#fffaf0";
      const n = c.attach.feral > 0.5 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n; const big = (i === 0 || i === n - 1) ? 1 : 0.6;
        const x = lerp(-w, w, u), y = yTop(u), tw = Math.max(1.5, w / n * 0.42), th = (3 + depth(u) * 0.45) * big * (0.6 + fd.fang * 0.6);
        ctx.beginPath(); ctx.moveTo(x - tw, y - 0.5); ctx.lineTo(x + tw, y - 0.5); ctx.lineTo(x, y + th); ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = pal.deep; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= M; i++) { const u = i / M; const x = lerp(-w, w, u); if (i === 0) ctx.moveTo(x, yTop(u)); else ctx.lineTo(x, yTop(u)); }
    for (let i = M; i >= 0; i--) { const u = i / M; ctx.lineTo(lerp(-w, w, u), yTop(u) + depth(u)); }
    ctx.closePath(); ctx.stroke();
  } else {
    ctx.strokeStyle = hsl(INK_H, 50, 16); ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let i = 0; i <= M; i++) { const u = i / M; const x = lerp(-w, w, u); if (i === 0) ctx.moveTo(x, yTop(u)); else ctx.lineTo(x, yTop(u)); }
    ctx.stroke();
    if (fd.fang > 0.25) { // canines poking over the closed grin
      ctx.fillStyle = "#fffaf0";
      for (let s = -1; s <= 1; s += 2) {
        const u = s < 0 ? 0.2 : 0.8, x = lerp(-w, w, u), y = yTop(u);
        ctx.beginPath(); ctx.moveTo(x - 2.4, y + 0.6); ctx.lineTo(x + 2.4, y + 0.6); ctx.lineTo(x, y + 5.2 * fd.fang); ctx.fill();
      }
    }
  }
  // drool
  if (c.attach.insatiable > 0.3) {
    const a = c.attach.insatiable;
    const fr = (t * 0.28) % 1;
    const len = 4 + 20 * smooth(fr) + c.hungerV * 8;
    const x = w * 0.72, y0 = yTop(0.86) + depth(0.86) + 1;
    ctx.globalAlpha *= a;
    ctx.strokeStyle = "rgba(200,240,255,.85)"; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + 1.5, y0 + len * 0.5, x + Math.sin(t * 2) * 0.8, y0 + len); ctx.stroke();
    ctx.fillStyle = "rgba(215,245,255,.95)";
    ctx.beginPath(); ctx.ellipse(x + Math.sin(t * 2) * 0.8, y0 + len + 1.6, 2.6, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(x + Math.sin(t * 2) * 0.8 - 0.8, y0 + len + 0.8, 0.9, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/* -------------------------------------------------------------- attachments */

function scaleAbout(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y);
}

function drawBack(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette): void {
  const A = c.attach, { rx, ry } = c.shape, t = c.t;
  const edge = pal.deep.replace(/[\d.]+\)$/, "0.5)");
  const sw = c.sway.x, sw2 = c.sway2.x;
  const droop = clamp(-c.f.curve * 0.7 + c.sickV * 0.5 + c.sleepV * 0.6 + c.hungerV * 0.3);
  const perk = clamp(c.f.curve - 0.4) * 0.5 + clamp(c.p.urgency) * 0.2;

  // feet (behind body)
  const feet = (w: number, a: number, spread: number, h: number): void => {
    if (a < 0.02) return;
    ctx.save(); ctx.globalAlpha *= a;
    for (let s = -1; s <= 1; s += 2) {
      const x = s * spread, y = ry - h * 0.5;
      ctx.fillStyle = jellyFill(ctx, x, y - h, x, y + h, pal.mid, pal.dark);
      ctx.strokeStyle = edge; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(x - w * 0.25, y - h * 0.4, w * 0.35, h * 0.22, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
  feet(9, A.jevling, rx * 0.42, 5);
  feet(9.5, A.feral, rx * 0.42, 5.4);
  feet(8.5, A.needy, rx * 0.4, 4.6);
  feet(13, A.stoic, rx * 0.5, 7);
  feet(7.5, A.insatiable, rx * 0.5, 4.5);
  feet(10, A.placid, rx * 0.45, 4.5);

  if (A.blobule > 0.02) { // curl tuft
    ctx.save(); ctx.globalAlpha *= A.blobule;
    const x = sw * 0.25;
    ctx.fillStyle = jellyFill(ctx, 0, -ry - 12, 0, -ry + 4, pal.light, pal.mid); ctx.strokeStyle = edge; ctx.lineWidth = 1.5;
    leaf(ctx, 0, -ry + 6, x + 4 + Math.sin(t * 1.3) * 1.5, -ry - 15, 11); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  if (A.jevling > 0.02) { // antenna sprout with glowing bulb
    ctx.save(); ctx.globalAlpha *= A.jevling;
    chain(4);
    let x = 0, y = -ry + 5, a = -0.06 + droop * 0.9;
    const stalk = hsl(105, 55, 44), stalkEdge = hsl(120, 60, 18, 0.6);
    for (let i = 0; i < 4; i++) {
      tx[i] = x; ty[i] = y;
      a += sw * 0.02 + Math.sin(t * 1.4 + i * 0.9) * 0.07 + sw2 * 0.008 + droop * 0.35 * (i + 1) * 0.5;
      x += Math.sin(a) * 11; y -= Math.cos(a) * 11 * (1 - droop * 0.6);
    }
    tube(ctx, tx, ty, 4.2, 3, stalk, stalkEdge, "rgba(255,255,255,.4)");
    const lx = tx[2]!, ly = ty[2]!;
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = jellyFill(ctx, lx, ly - 10, lx, ly + 2, hsl(110, 70, 62), hsl(118, 60, 38)); ctx.strokeStyle = stalkEdge; ctx.lineWidth = 1.3;
      leaf(ctx, lx, ly, lx + s * (13 + droop * 3), ly - 8 + droop * 12 + Math.sin(t * 2 + s) * 1.2, 8); ctx.fill(); ctx.stroke();
    }
    const bx = x, by = y - 3;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const gl = ctx.createRadialGradient(bx, by, 0, bx, by, 22);
    const gv = (0.4 + 0.2 * Math.sin(t * 2.3)) * (1 - droop * 0.5) + c.glow * 0.5;
    gl.addColorStop(0, `rgba(255,229,143,${gv})`); gl.addColorStop(1, "rgba(255,229,143,0)");
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(bx, by, 22, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = jellyFill(ctx, bx, by - 6, bx, by + 6, "#FFF6C9", "#FFB58A"); ctx.strokeStyle = "rgba(180,90,40,.5)"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(bx, by, 6.2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(bx - 2, by - 2.2, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
  }

  if (A.placid > 0.02) { // droopy ears
    ctx.save(); ctx.globalAlpha *= A.placid;
    for (let s = -1; s <= 1; s += 2) {
      const bx = s * rx * 0.58, by = -ry * 0.68;
      const ang = s * (0.28 - perk * 0.8 + Math.sin(t * 0.6 + s) * 0.03) - sw * 0.012 * s + sw2 * 0.01;
      const L = 36 * (1 - perk * 0.15);
      const ex = bx + Math.sin(ang) * s * 0 + s * Math.cos(-0.55 + s * 0 + ang * s * 0.6) * 0 + s * 22 * Math.cos(ang) + 0;
      void ex;
      const ux = s * Math.cos(0.85 - perk * 1.6 - ang * s * 0.5), uy = Math.sin(0.85 - perk * 1.6 - ang * s * 0.5);
      const tx2 = bx + ux * L, ty2 = by + uy * L;
      ctx.fillStyle = jellyFill(ctx, bx, by, tx2, ty2, pal.mid, pal.dark); ctx.strokeStyle = edge; ctx.lineWidth = 1.7;
      leaf(ctx, bx, by, tx2, ty2, 21); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "hsla(345,100%,84%,.55)";
      leaf(ctx, bx + (tx2 - bx) * 0.18, by + (ty2 - by) * 0.18, bx + (tx2 - bx) * 0.86, by + (ty2 - by) * 0.86, 10); ctx.fill();
    }
    ctx.restore();
  }

  if (A.feral > 0.02) { // crest, ears, cheek tufts, tail
    ctx.save(); ctx.globalAlpha *= A.feral;
    const crest = hsl(pal.base.h + 24, 78, 34), tip = hsl(pal.base.h - 4, 100, 66);
    const spikeN = 5;
    for (let i = 0; i < spikeN; i++) {
      const u = i / (spikeN - 1) - 0.5;
      const phi = u * 1.45;
      const bx = Math.sin(phi) * rx * 0.86, by = -Math.cos(phi) * ry * 0.94 + 4;
      const H = (26 - Math.abs(u) * 14) * (1 + clamp(c.p.urgency) * 0.15 - droop * 0.35);
      const lean = phi + 0.35 + sw * 0.02 * (1 + i * 0.2) + Math.sin(t * 4 + i) * 0.03 * c.p.urgency + droop * 0.4;
      const tx2 = bx + Math.sin(lean) * H, ty2 = by - Math.cos(lean) * H;
      ctx.fillStyle = jellyFill(ctx, bx, by, tx2, ty2, crest, tip); ctx.strokeStyle = hsl(pal.base.h + 30, 70, 16, 0.6); ctx.lineWidth = 1.4; ctx.lineJoin = "round";
      const wdt = 8 - Math.abs(u) * 3;
      ctx.beginPath(); ctx.moveTo(bx - Math.cos(lean) * wdt, by - Math.sin(lean) * wdt);
      ctx.quadraticCurveTo(bx - Math.cos(lean) * wdt * 0.5 + Math.sin(lean) * H * 0.55, by - Math.sin(lean) * wdt * 0.5 - Math.cos(lean) * H * 0.55, tx2, ty2);
      ctx.quadraticCurveTo(bx + Math.cos(lean) * wdt * 0.5 + Math.sin(lean) * H * 0.4, by + Math.sin(lean) * wdt * 0.5 - Math.cos(lean) * H * 0.4, bx + Math.cos(lean) * wdt, by + Math.sin(lean) * wdt);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (let s = -1; s <= 1; s += 2) { // pointy ears
      const bx = s * rx * 0.66, by = -ry * 0.66;
      const tx2 = bx + s * 15, ty2 = by - 22 + droop * 14 + sw * 0.15;
      ctx.fillStyle = jellyFill(ctx, bx, by, tx2, ty2, pal.mid, pal.dark); ctx.strokeStyle = edge; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(bx - s * 12, by + 6); ctx.lineTo(tx2, ty2); ctx.lineTo(bx + s * 4, by + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "hsla(345,80%,50%,.55)";
      ctx.beginPath(); ctx.moveTo(bx - s * 5, by + 3); ctx.lineTo(tx2 - s * 3, ty2 + 6); ctx.lineTo(bx + s * 1, by + 9); ctx.closePath(); ctx.fill();
      // cheek tuft
      const cxp = s * rx * 0.96, cyp = ry * 0.1;
      ctx.fillStyle = jellyFill(ctx, cxp, cyp, cxp + s * 18, cyp + 6, pal.mid, tip); ctx.strokeStyle = edge;
      ctx.beginPath(); ctx.moveTo(cxp - s * 6, cyp - 8); ctx.lineTo(cxp + s * 19, cyp + 8); ctx.lineTo(cxp - s * 3, cyp + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cxp - s * 6, cyp + 4); ctx.lineTo(cxp + s * 15, cyp + 21); ctx.lineTo(cxp - s * 3, cyp + 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // spiky tail
    const t0x = rx * 0.7, t0y = ry * 0.5;
    chain(5);
    for (let i = 0; i < 5; i++) { const u = i / 4; tx[i] = t0x + u * 24 + Math.sin(u * 3 + sw2 * 0.05) * 3; ty[i] = t0y - Math.pow(u, 1.4) * 34 + Math.sin(t * 5 + u * 3) * 1.4 * (1 + c.p.urgency) + sw * 0.2 * u; }
    tube(ctx, tx, ty, 8, 4, pal.mid, edge, "rgba(255,255,255,.3)");
    ctx.fillStyle = tip; ctx.strokeStyle = edge; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(tx[4]! - 5, ty[4]! + 1); ctx.lineTo(tx[4]! + 8, ty[4]! - 14); ctx.lineTo(tx[4]! + 5, ty[4]! + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  if (A.needy > 0.02) { // curly heart tail
    ctx.save(); ctx.globalAlpha *= A.needy;
    const x0 = rx * 0.72, y0 = ry * 0.55;
    chain(7);
    const wag = Math.sin(t * (2 + c.p.urgency * 6)) * (0.25 + c.p.urgency * 0.5) + sw2 * 0.02;
    for (let i = 0; i < 7; i++) { const u = i / 6; const a = -0.3 + u * 2.6 + wag * u; tx[i] = x0 + Math.sin(a) * 14 * (0.4 + u) + u * 12; ty[i] = y0 - Math.cos(a) * 9 * u * 2 + 10 * (1 - u) - u * 14; }
    tube(ctx, tx, ty, 6.5, 3, pal.mid, edge, "rgba(255,255,255,.35)");
    const hx = tx[6]!, hy = ty[6]!, s = 6.5;
    ctx.fillStyle = "#FF5C7A"; ctx.strokeStyle = "rgba(120,20,50,.55)"; ctx.lineWidth = 1.3;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(wag * 0.6 + 0.3);
    ctx.beginPath(); ctx.moveTo(0, s * 1.1); ctx.bezierCurveTo(-s * 1.9, -s * 0.2, -s * 0.9, -s * 1.5, 0, -s * 0.5); ctx.bezierCurveTo(s * 0.9, -s * 1.5, s * 1.9, -s * 0.2, 0, s * 1.1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.ellipse(-s * 0.55, -s * 0.7, 1.4, 0.8, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  if (A.stoic > 0.02) { // stone nubs
    ctx.save(); ctx.globalAlpha *= A.stoic;
    for (let s = -1; s <= 1; s += 2) {
      const bx = s * rx * 0.58, by = -ry * 0.86;
      ctx.fillStyle = jellyFill(ctx, bx, by - 14, bx, by + 6, pal.light, pal.dark); ctx.strokeStyle = edge; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.roundRect(bx - 8, by - 15, 16, 22, [6, 6, 3, 3]); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.beginPath(); ctx.roundRect(bx - 5, by - 12, 5, 9, 3); ctx.fill();
    }
    ctx.restore();
  }

  if (A.insatiable > 0.02) { // feelers
    ctx.save(); ctx.globalAlpha *= A.insatiable;
    const roots = [[-0.8, -0.3, -1, 0.9], [0.8, -0.3, 1, 0.9], [-0.5, -0.78, -1, 1.5], [0.5, -0.78, 1, 1.5]] as const;
    roots.forEach((r, ri) => {
      const s = r[2]; const n = 8; chain(n);
      let x = r[0] * rx, y = r[1] * ry, a = -Math.PI / 2 + s * r[3] * 0.62;
      for (let i = 0; i < n; i++) {
        tx[i] = x; ty[i] = y;
        a += Math.sin(t * (1.6 + c.p.urgency * 2) + i * 0.7 + ri * 1.7) * 0.2 - s * 0.05 + sw * 0.01 * s + droop * s * 0.14;
        x += Math.cos(a) * 6.4; y += Math.sin(a) * 6.4;
      }
      tube(ctx, tx, ty, 6.2, 2.6, pal.mid, edge, "rgba(255,255,255,.3)");
      const ex = tx[n - 1]!, ey = ty[n - 1]!;
      ctx.fillStyle = jellyFill(ctx, ex, ey - 5, ex, ey + 5, pal.hi, "hsla(330,100%,72%,1)"); ctx.strokeStyle = edge; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(ex, ey, 3.8, 0, TAU); ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }
}

function drawFront(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette): void {
  const A = c.attach, { rx, ry } = c.shape, t = c.t;
  const edge = pal.deep.replace(/[\d.]+\)$/, "0.5)");
  const urg = clamp(c.p.urgency);
  const happy = clamp(c.f.curve - 0.3);
  const arm = (bx: number, by: number, ex: number, ey: number, w: number, s: number): void => {
    ctx.fillStyle = jellyFill(ctx, bx, by - w, ex, ey + w, pal.light, pal.mid); ctx.strokeStyle = edge; ctx.lineWidth = 1.6;
    leaf(ctx, bx, by, ex, ey, w); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(ex - s * 1, ey - 1.5, w * 0.28, w * 0.2, 0, 0, TAU); ctx.fill();
  };
  if (A.blobule > 0.02) { // tiny nub hands
    ctx.save(); ctx.globalAlpha *= A.blobule;
    for (let s = -1; s <= 1; s += 2) arm(s * rx * 0.86, ry * 0.25, s * (rx * 0.86 + 7), ry * 0.42 + Math.sin(t * 2 + s) * 1.2 - happy * 8, 8, s);
    ctx.restore();
  }
  if (A.jevling > 0.02) {
    ctx.save(); ctx.globalAlpha *= A.jevling;
    for (let s = -1; s <= 1; s += 2) arm(s * rx * 0.9, ry * 0.18, s * (rx * 0.9 + 12), ry * 0.42 - happy * 14 + Math.sin(t * 2.4 + s) * 1.5 - c.sway.x * 0.1, 9, s);
    ctx.restore();
  }
  if (A.placid > 0.02) {
    ctx.save(); ctx.globalAlpha *= A.placid;
    for (let s = -1; s <= 1; s += 2) arm(s * rx * 0.88, ry * 0.3, s * (rx * 0.88 + 8), ry * 0.52, 10, s);
    ctx.restore();
  }
  if (A.feral > 0.02) { // claws
    ctx.save(); ctx.globalAlpha *= A.feral;
    for (let s = -1; s <= 1; s += 2) {
      const ex = s * (rx * 0.94 + 9), ey = ry * 0.4 - urg * 6 + Math.sin(t * 3 + s) * 1;
      arm(s * rx * 0.9, ry * 0.2, ex, ey, 10, s);
      ctx.fillStyle = "#fff5e6"; ctx.strokeStyle = "rgba(90,40,20,.6)"; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(ex + i * 3 - 1.6, ey + 3); ctx.lineTo(ex + i * 3 + 1.6, ey + 3); ctx.lineTo(ex + i * 3.6 + s * 0.8, ey + 9); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
  }
  if (A.needy > 0.02) { // reaching arms
    ctx.save(); ctx.globalAlpha *= A.needy;
    for (let s = -1; s <= 1; s += 2) {
      const wave = Math.sin(t * (3 + urg * 6) + (s > 0 ? 1.4 : 0)) * (0.1 + urg * 0.35);
      const reach = 0.5 + urg * 0.5 + (c.p.want === "attention" ? 0.3 : 0) - c.hungerV * 0.2;
      const a = -Math.PI / 2 + s * (0.55 - reach * 0.35) + wave * s;
      const bx = s * rx * 0.86, by = ry * 0.1;
      const L = 24;
      const ex = bx + Math.cos(a + (s > 0 ? 0 : 0)) * L * 0.6 + s * 8, ey = by + Math.sin(a) * L * 0.9 + 4;
      arm(bx, by, ex, ey, 11, s);
      ctx.fillStyle = pal.mid;
    }
    ctx.restore();
  }
  if (A.stoic > 0.02) { // crossed arms
    ctx.save(); ctx.globalAlpha *= A.stoic;
    const y = ry * 0.36;
    const armFill = jellyFill(ctx, 0, y - 10, 0, y + 12, pal.mid, pal.dark);
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = armFill; ctx.strokeStyle = edge; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(s * rx * 0.92, y - 12); ctx.quadraticCurveTo(s * rx * 0.2, y + (s > 0 ? -2 : 4), -s * rx * 0.42, y + (s > 0 ? 8 : 2)); ctx.lineTo(-s * rx * 0.42, y + (s > 0 ? 22 : 16)); ctx.quadraticCurveTo(s * rx * 0.3, y + (s > 0 ? 14 : 22), s * rx * 0.96, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = pal.light.replace(/[\d.]+\)$/, "0.5)"); ctx.beginPath(); ctx.ellipse(-s * rx * 0.44, y + (s > 0 ? 15 : 9), 7, 8, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = edge; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.beginPath(); ctx.ellipse(s * rx * 0.55, y - 3, rx * 0.2, 2.2, 0.15 * s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  if (A.insatiable > 0.02) {
    ctx.save(); ctx.globalAlpha *= A.insatiable;
    for (let s = -1; s <= 1; s += 2) arm(s * rx * 0.94, ry * 0.15, s * (rx * 0.94 + 8), ry * 0.5 + Math.sin(t * 2 + s) * 1, 11, s);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ extras */

function drawFlies(c: Creature, ctx: CanvasRenderingContext2D): void {
  const { rx, ry } = c.shape, t = c.t;
  const n = 1 + Math.floor(c.dirtV * 3);
  ctx.save(); ctx.globalAlpha *= clamp(c.dirtV * 1.4);
  for (let i = 0; i < n; i++) {
    const a = t * (1.6 + i * 0.5) + i * 2.1;
    const x = Math.cos(a) * (rx * 0.8 + Math.sin(t * 0.9 + i) * 8) + Math.sin(t * 5 + i) * 2;
    const y = -ry * 1.05 + Math.sin(a * 1.3) * 11 + Math.cos(t * 6 + i) * 1.5;
    ctx.fillStyle = "rgba(20,14,40,.9)"; ctx.beginPath(); ctx.ellipse(x, y, 2.6, 1.9, a, 0, TAU); ctx.fill();
    const fl = Math.sin(t * 60 + i) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(230,240,255,${0.35 + 0.35 * fl})`;
    ctx.beginPath(); ctx.ellipse(x - 1, y - 2.4, 2.8, 1.3 + fl, -0.4, 0, TAU); ctx.ellipse(x + 1.2, y - 2.4, 2.8, 1.3 + fl, 0.4, 0, TAU); ctx.fill();
  }
  // stink wisps
  ctx.strokeStyle = "rgba(150,200,90,.5)"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const u = ((t * 0.35 + i / 3) % 1);
    const bx = (i - 1) * rx * 0.5, by = -ry * 0.55 - u * 34;
    ctx.globalAlpha = clamp(c.dirtV * 1.4) * Math.sin(u * Math.PI) * 0.8;
    ctx.beginPath(); ctx.moveTo(bx, by + 12);
    ctx.bezierCurveTo(bx + 5, by + 6, bx - 5, by + 2, bx, by - 4); ctx.stroke();
  }
  ctx.restore();
}

function drawSnot(c: Creature, ctx: CanvasRenderingContext2D): void {
  const fd = c.fd;
  const r = 3 + c.bubble * 10;
  const x = fd.eyeSp * 0.28 + r * 0.6 + 2, y = fd.mouthY - 5 - fd.eyeRy * 0.15;
  ctx.save(); ctx.globalAlpha *= clamp(c.sleepV);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,.75)"); g.addColorStop(0.7, "rgba(190,230,255,.35)"); g.addColorStop(1, "rgba(160,210,255,.6)");
  ctx.fillStyle = g; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.25, r * 0.15, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
}

function eggPathFor(): Path2D {
  const sh = DEFS.egg.shape; const p = new Path2D(); const n = 48;
  for (let i = 0; i <= n; i++) {
    const th = -Math.PI / 2 + (i / n) * TAU, co = Math.cos(th), si = Math.sin(th), e = 2 / (si < 0 ? sh.nTop : sh.nBot);
    let x = sh.rx * Math.sign(co) * Math.pow(Math.abs(co), e); const y = sh.ry * Math.sign(si) * Math.pow(Math.abs(si), e);
    x *= 1 + sh.pear * (y / sh.ry); if (y < 0) x *= 1 - sh.point * (y / sh.ry) ** 2;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  p.closePath(); return p;
}
let EGG_PATH: Path2D | null = null;

function drawShell(c: Creature, ctx: CanvasRenderingContext2D, pal: Palette): void {
  const t = c.shellT;
  if (t > 2.4) return;
  EGG_PATH ??= eggPathFor();
  const eg = DEFS.egg.shape;
  const off = (c.shape.ry - eg.ry);
  void pal;
  const pearl = hsl(258, 100, 96), shade = hsl(262, 45, 78), deep = hsl(268, 40, 52, 0.6);
  for (let half = 0; half < 2; half++) {
    const top = half === 0;
    ctx.save();
    let a = 1;
    if (top) {
      const y = -260 * t + 300 * t * t, x = 50 * t;
      ctx.translate(x, y - 6 + off); ctx.rotate(2.4 * t);
      a = 1 - clamp((t - 0.5) / 0.6);
    } else {
      ctx.translate(0, off + Math.sin(clamp(t * 6) * Math.PI) * -3);
      a = 1 - clamp((t - 1.3) / 0.9);
    }
    if (a > 0.01) {
      ctx.globalAlpha *= a;
      const yy = 16;
      ctx.beginPath();
      const zz = (x: number): number => yy + ((Math.round((x + 60) / 7)) % 2 ? 6 : -4);
      if (top) { ctx.moveTo(-60, -80); ctx.lineTo(60, -80); for (let x = 60; x >= -60; x -= 7) ctx.lineTo(x, zz(x)); }
      else { ctx.moveTo(-60, 80); ctx.lineTo(60, 80); for (let x = 60; x >= -60; x -= 7) ctx.lineTo(x, zz(x)); }
      ctx.closePath();
      ctx.save(); ctx.clip(); ctx.clip(EGG_PATH);
      const g = ctx.createRadialGradient(-12, -20, 4, 0, 0, 60);
      g.addColorStop(0, pearl); g.addColorStop(0.6, hsl(258, 80, 90)); g.addColorStop(1, shade);
      ctx.fillStyle = g; ctx.fill(EGG_PATH);
      for (const s of c.speckle) { ctx.fillStyle = `hsla(${s.h},70%,62%,.55)`; ctx.beginPath(); ctx.arc(s.x * eg.rx, s.y * eg.ry, s.r, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = deep; ctx.lineWidth = 2; ctx.stroke(EGG_PATH);
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(120,100,170,.55)"; ctx.lineJoin = "round";
      ctx.beginPath(); for (let x = -60; x <= 60; x += 7) { if (x === -60) ctx.moveTo(x, zz(x)); else ctx.lineTo(x, zz(x)); } ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

function drawParticles(c: Creature, ctx: CanvasRenderingContext2D): void {
  for (const q of c.parts) {
    if (!q.on) continue;
    const u = q.life / q.max, a = 1 - u * u;
    ctx.save();
    ctx.translate(q.x, q.y);
    if (q.kind === PK.spark) {
      ctx.rotate(q.rot); ctx.globalCompositeOperation = "lighter";
      const r = q.size * (1 - u * 0.5);
      ctx.fillStyle = `hsla(${q.hue},100%,75%,${a})`;
      ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.quadraticCurveTo(0, 0, r * 1.6, 0); ctx.quadraticCurveTo(0, 0, 0, r * 1.6); ctx.quadraticCurveTo(0, 0, -r * 1.6, 0); ctx.quadraticCurveTo(0, 0, 0, -r * 1.6); ctx.fill();
    } else if (q.kind === PK.dot) {
      ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `hsla(${q.hue},100%,72%,${a})`;
      ctx.beginPath(); ctx.arc(0, 0, q.size * (1 - u * 0.4), 0, TAU); ctx.fill();
    } else if (q.kind === PK.crumb) {
      ctx.rotate(q.rot); ctx.fillStyle = `hsla(${q.hue},80%,62%,${a})`; ctx.fillRect(-q.size, -q.size * 0.7, q.size * 2, q.size * 1.4);
    } else if (q.kind === PK.drop || q.kind === PK.tear) {
      ctx.fillStyle = q.kind === PK.tear ? `rgba(190,235,255,${a})` : `hsla(${q.hue},90%,75%,${a * 0.8})`;
      ctx.beginPath(); ctx.ellipse(0, 0, q.size * 0.75, q.size, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`; ctx.beginPath(); ctx.arc(-q.size * 0.25, -q.size * 0.3, q.size * 0.25, 0, TAU); ctx.fill();
    } else if (q.kind === PK.ring) {
      ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(255,240,190,${(1 - u) * 0.8})`; ctx.lineWidth = 3 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(0, 0, q.size + u * 90, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}
