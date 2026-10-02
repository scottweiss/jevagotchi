/**
 * Things a creature can wear or hold. Every drawing function works in a small local frame and is placed
 * by an anchor computed from the species' live shape and face, so the item rides squash and stretch,
 * tilt, jelly wobble and the head-turn, plus a little lag of its own (a hat should trail the hop).
 *
 * Ids match core's wardrobe catalogue. Unknown ids draw nothing.
 */
import type { Accessories } from "../contracts.js";
import type { Creature } from "./creature.js";
import { TAU, clamp } from "./math.js";
import type { Palette } from "./species.js";

type Ctx = CanvasRenderingContext2D;

/** Per-frame dynamics shared by every accessory. */
export interface AccFrame {
  t: number;
  /** secondary-motion springs already in the creature (ears, antennae) */
  sway: number; sway2: number;
  /** 0..1 how cheerful the face is; lifts held items */
  happy: number;
  pal: Palette | null;
}

const EDGE = "rgba(27,22,56,.55)";
const INK = "#1B1638";
const CORAL = "#FF5C7A", BUTTER = "#FFE58F", PEACH = "#FFB58A", LAGOON = "#38D6B8", FOG = "#ECE9FF";

function lin(ctx: Ctx, y0: number, y1: number, a: string, b: string, x0 = 0, x1 = 0): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}
function shine(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = -0.5, a = 0.55): void {
  ctx.save(); ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); ctx.restore();
}
function stroked(ctx: Ctx, w = 1.6): void { ctx.strokeStyle = EDGE; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); }
function star(ctx: Ctx, x: number, y: number, r: number, inner = 0.5, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
function twinkle(ctx: Ctx, x: number, y: number, r: number, ph: number): void {
  const k = 0.55 + 0.45 * Math.sin(ph);
  ctx.save(); ctx.fillStyle = `rgba(255,255,255,${(0.9 * k).toFixed(3)})`;
  star(ctx, x, y, r * k, 0.28); ctx.fill(); ctx.restore();
}

/* ---------------------------------------------------------------- hats
 * Local frame: origin at the centre of the hat's base line, -y is up, head half-width ~26. */

type Draw = (ctx: Ctx, f: AccFrame) => void;

const HATS: Record<string, Draw> = {
  "party-cone"(ctx, f) {
    const tx = f.sway * 0.28;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-19, 1); ctx.quadraticCurveTo(0, 8, 19, 1); ctx.quadraticCurveTo(tx * 0.4 + 5, -24, tx, -47); ctx.quadraticCurveTo(tx * 0.4 - 6, -24, -19, 1); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -46, "#e8385a", "#ff8fa3"); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = BUTTER; ctx.lineWidth = 5.5;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-26, 8 - i * 12); ctx.lineTo(26, -6 - i * 12); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.beginPath(); ctx.ellipse(-7, -18, 3, 17, 0.25, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-19, 1); ctx.quadraticCurveTo(0, 8, 19, 1); ctx.quadraticCurveTo(tx * 0.4 + 5, -24, tx, -47); ctx.quadraticCurveTo(tx * 0.4 - 6, -24, -19, 1); ctx.closePath(); stroked(ctx);
    ctx.beginPath(); ctx.ellipse(0, 2.5, 19.5, 4.4, 0, 0, TAU); ctx.fillStyle = lin(ctx, -2, 7, "#fff4c2", "#ffd66b"); ctx.fill(); stroked(ctx, 1.4);
    // pompom
    const px = tx, py = -48 + Math.sin(f.t * 3) * 0.6;
    const pg = ctx.createRadialGradient(px - 2, py - 2, 0, px, py, 7);
    pg.addColorStop(0, "#fffbe8"); pg.addColorStop(1, "#ffd66b");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 6.2, 0, TAU); ctx.fill(); stroked(ctx, 1.3);
    twinkle(ctx, px + 8, py - 6, 4, f.t * 3);
    ctx.restore();
  },

  beanie(ctx, f) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-23, 1); ctx.bezierCurveTo(-27, -22, -13, -37, 0, -37); ctx.bezierCurveTo(13, -37, 27, -22, 23, 1); ctx.closePath();
    ctx.fillStyle = lin(ctx, -37, 0, "#8b6be8", "#4b36b0"); ctx.fill(); stroked(ctx);
    ctx.save(); ctx.clip(); ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 2;
    for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 6, -40); ctx.lineTo(i * 8.5, 2); ctx.stroke(); }
    ctx.restore();
    shine(ctx, -10, -24, 5, 10, 0.4, 0.35);
    // folded cuff
    ctx.beginPath(); ctx.roundRect(-25.5, -9, 51, 13, 6); ctx.fillStyle = lin(ctx, -9, 4, "#fff1c0", "#f4c95a"); ctx.fill(); stroked(ctx, 1.5);
    ctx.strokeStyle = "rgba(150,90,20,.3)"; ctx.lineWidth = 1.4;
    for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 5.6, -7); ctx.lineTo(i * 5.6, 2); ctx.stroke(); }
    // pompom
    const px = f.sway * 0.12, py = -41;
    const pg = ctx.createRadialGradient(px - 2, py - 2, 0, px, py, 9);
    pg.addColorStop(0, "#ffe1e8"); pg.addColorStop(1, "#ff7f9b");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 7.4, 0, TAU); ctx.fill(); stroked(ctx, 1.3);
    ctx.restore();
  },

  headphones(ctx, f) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#2b2358"; ctx.lineWidth = 6.6;
    ctx.beginPath(); ctx.moveTo(-25, 3); ctx.bezierCurveTo(-27, -20, -13, -27, 0, -27); ctx.bezierCurveTo(13, -27, 27, -20, 25, 3); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(-19, -14); ctx.bezierCurveTo(-14, -22, -7, -24.5, 0, -24.5); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 26.5, 7);
      ctx.beginPath(); ctx.roundRect(-8, -12, 16, 24, 8); ctx.fillStyle = lin(ctx, -12, 12, "#ff8fa3", "#e2385a"); ctx.fill(); stroked(ctx, 1.6);
      ctx.beginPath(); ctx.roundRect(-4.6, -8.4, 9.2, 16.8, 4.6); ctx.fillStyle = "rgba(27,22,56,.4)"; ctx.fill();
      shine(ctx, -3, -7, 1.8, 4.6, 0.1, 0.55);
      ctx.restore();
    }
    // a wandering note, because it is listening to something
    const k = (f.t * 0.5) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI) * 0.85;
    ctx.fillStyle = BUTTER; ctx.font = "700 13px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("♪", 30 + k * 6, -12 - k * 20);
    ctx.restore();
  },

  daisy(ctx, f) {
    ctx.save(); ctx.translate(13, -3); ctx.rotate(0.28 + f.sway * 0.01);
    // stem and a leaf where it tucks into the head
    ctx.strokeStyle = "#3f9b52"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.quadraticCurveTo(-2, 0, 0, -6); ctx.stroke();
    ctx.fillStyle = "#59c26c"; ctx.beginPath(); ctx.ellipse(-7, 4, 7, 3.2, -0.5, 0, TAU); ctx.fill(); stroked(ctx, 1.1);
    ctx.translate(0, -11);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU; ctx.save(); ctx.rotate(a); ctx.translate(0, -8.4);
      ctx.beginPath(); ctx.ellipse(0, 0, 4.4, 7.4, 0, 0, TAU); ctx.fillStyle = lin(ctx, -8, 8, "#ffffff", "#ffd3e6"); ctx.fill(); stroked(ctx, 1.1); ctx.restore();
    }
    const g = ctx.createRadialGradient(-1.6, -1.6, 0, 0, 0, 6.6); g.addColorStop(0, "#fff3a6"); g.addColorStop(1, "#f2b32c");
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fillStyle = g; ctx.fill(); stroked(ctx, 1.2);
    shine(ctx, -2, -2, 1.8, 1.2, -0.5, 0.7);
    ctx.restore();
  },

  bucket(ctx, f) {
    ctx.save(); ctx.rotate(-0.06);
    // handle hanging off one side
    ctx.strokeStyle = "#8b93ad"; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-20, -22); ctx.bezierCurveTo(-34, -20 + f.sway * 0.05, -34, -2, -21, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-19.5, -1); ctx.lineTo(-17, -17); ctx.lineTo(17, -17); ctx.lineTo(19.5, -1); ctx.quadraticCurveTo(0, 6, -19.5, -1); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 0, "#7f88a6", "#dfe4f5", -20, 20); ctx.fill(); stroked(ctx);
    // ribs
    ctx.strokeStyle = "rgba(40,45,80,.32)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-18.4, -9); ctx.quadraticCurveTo(0, -5, 18.4, -9); ctx.stroke();
    // rim + dark inside
    ctx.beginPath(); ctx.ellipse(0, -17, 20.4, 4.6, 0, 0, TAU); ctx.fillStyle = "#3a3f63"; ctx.fill(); stroked(ctx, 1.4);
    ctx.beginPath(); ctx.ellipse(0, -16.4, 17.2, 3, 0, 0, TAU); ctx.fillStyle = "#23274a"; ctx.fill();
    shine(ctx, -12, -8, 2, 6, 0.15, 0.5);
    ctx.restore();
  },

  "sprout-pot"(ctx, f) {
    ctx.save();
    const sw = f.sway * 0.03;
    // sprout behind the pot rim
    ctx.strokeStyle = "#3f9b52"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(sw * 3, -25, sw * 6, -30); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(sw * 6, -30); ctx.rotate(s * (0.9 + Math.sin(f.t * 1.6 + s) * 0.08) + sw);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(4, -6, 12, -8, 17, -3); ctx.bezierCurveTo(12, 3, 4, 3, 0, 0); ctx.closePath();
      ctx.fillStyle = lin(ctx, -8, 3, "#8ee09a", "#3f9b52"); ctx.fill(); stroked(ctx, 1.2); ctx.restore();
    }
    // terracotta pot
    ctx.beginPath(); ctx.moveTo(-16, -15); ctx.lineTo(16, -15); ctx.lineTo(12.5, 1); ctx.quadraticCurveTo(0, 5, -12.5, 1); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 0, "#c45f3c", "#f2946a", -16, 16); ctx.fill(); stroked(ctx);
    ctx.beginPath(); ctx.roundRect(-18.5, -20, 37, 8, 3.5); ctx.fillStyle = lin(ctx, -20, -12, "#f2946a", "#c9603a"); ctx.fill(); stroked(ctx, 1.5);
    ctx.beginPath(); ctx.ellipse(0, -19.6, 15.6, 2.1, 0, 0, TAU); ctx.fillStyle = "#4a2a22"; ctx.fill();
    shine(ctx, -10, -7, 1.8, 5, 0.1, 0.4);
    ctx.restore();
  },

  wizard(ctx, f) {
    ctx.save();
    const bend = f.sway * 0.35;
    // brim
    ctx.beginPath(); ctx.ellipse(0, 1, 31, 6.4, 0, 0, TAU); ctx.fillStyle = lin(ctx, -4, 8, "#5b47b8", "#33257a"); ctx.fill(); stroked(ctx);
    // cone with a floppy tip
    ctx.beginPath(); ctx.moveTo(-18, -1); ctx.bezierCurveTo(-14, -22, -4, -36, 4 + bend * 0.6, -50); ctx.quadraticCurveTo(12 + bend, -58, 18 + bend, -49);
    ctx.bezierCurveTo(12 + bend * 0.5, -46, 12, -22, 18, -1); ctx.quadraticCurveTo(0, 5, -18, -1); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, 0, "#3a2a8c", "#7c5fe0", -18, 18); ctx.fill(); stroked(ctx);
    ctx.save(); ctx.clip();
    ctx.fillStyle = BUTTER; ctx.fillRect(-22, -12, 46, 6);
    ctx.fillStyle = "rgba(150,90,20,.25)"; ctx.fillRect(-22, -7, 46, 1.6);
    ctx.restore();
    ctx.fillStyle = BUTTER; star(ctx, -3, -26, 4.2, 0.45); ctx.fill();
    ctx.fillStyle = "rgba(255,229,143,.8)"; star(ctx, 7, -35, 2.4, 0.45); ctx.fill(); star(ctx, -8, -38, 2, 0.45); ctx.fill();
    ctx.strokeStyle = EDGE; ctx.lineWidth = 1.2; star(ctx, -3, -26, 4.2, 0.45); ctx.stroke();
    twinkle(ctx, 20 + bend, -55, 5, f.t * 2.4);
    ctx.restore();
  },

  crown(ctx, f) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-17, 1); ctx.lineTo(-19, -20); ctx.lineTo(-9.5, -11); ctx.lineTo(0, -24); ctx.lineTo(9.5, -11); ctx.lineTo(19, -20); ctx.lineTo(17, 1); ctx.quadraticCurveTo(0, 6, -17, 1); ctx.closePath();
    ctx.fillStyle = lin(ctx, -24, 4, "#fff3b0", "#f0a92c"); ctx.fill(); stroked(ctx, 1.7);
    ctx.fillStyle = "#e58e1c"; ctx.beginPath(); ctx.moveTo(-17.4, -3); ctx.quadraticCurveTo(0, 2, 17.4, -3); ctx.lineTo(17, 1); ctx.quadraticCurveTo(0, 6, -17, 1); ctx.closePath(); ctx.fill();
    for (const [x, y, c] of [[-19, -21, CORAL], [0, -25.5, LAGOON], [19, -21, "#9C86F0"]] as const) {
      ctx.beginPath(); ctx.arc(x, y, 3.3, 0, TAU); ctx.fillStyle = c; ctx.fill(); stroked(ctx, 1.1); shine(ctx, x - 1, y - 1, 1, 0.7, -0.5, 0.8);
    }
    ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(0, -4.2, 2.8, 0, TAU); ctx.fill(); stroked(ctx, 1);
    shine(ctx, -10, -8, 1.8, 5, 0.3, 0.5);
    twinkle(ctx, 12, -20, 4.5, f.t * 3.2); twinkle(ctx, -11, -16, 3, f.t * 2.3 + 2);
    ctx.restore();
  },
};

/* ---------------------------------------------------------------- face */

export interface FaceGeo { eyeSp: number; eyeY: number; eyeRx: number; eyeRy: number; mouthY: number; mouthW: number; mouthDepth: number; rx: number; ry: number }
type FaceDraw = (ctx: Ctx, f: AccFrame, g: FaceGeo) => void;

const lensSize = (g: FaceGeo): { rx: number; ry: number } => ({
  rx: Math.min(g.eyeRx * 1.22 + 2.2, g.eyeSp * 0.97),
  ry: g.eyeRy * 1.16 + 2.2,
});

const FACE: Record<string, FaceDraw> = {
  "round-glasses"(ctx, _f, g) {
    const { rx, ry } = lensSize(g);
    ctx.save(); ctx.lineCap = "round";
    // arms run to the sides of the head
    ctx.strokeStyle = "#7a4a2a"; ctx.lineWidth = 2.6;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * (g.eyeSp + rx), g.eyeY - 1); ctx.lineTo(s * (g.rx * 0.97), g.eyeY - 3); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-g.eyeSp + rx, g.eyeY - ry * 0.25); ctx.quadraticCurveTo(0, g.eyeY - ry * 0.55, g.eyeSp - rx, g.eyeY - ry * 0.25); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * g.eyeSp, g.eyeY, rx, ry, 0, 0, TAU);
      ctx.fillStyle = "rgba(210,235,255,.16)"; ctx.fill();
      ctx.strokeStyle = "#6b3f22"; ctx.lineWidth = 2.8; ctx.stroke();
      ctx.strokeStyle = "rgba(255,210,150,.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(s * g.eyeSp, g.eyeY - 0.4, rx - 1.1, ry - 1.1, 0, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.arc(s * g.eyeSp, g.eyeY, Math.min(rx, ry) * 0.66, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
    }
    ctx.restore();
  },

  "star-shades"(ctx, f, g) {
    const r = Math.min(Math.max(g.eyeRx, g.eyeRy) * 1.32 + 2.5, g.eyeSp * 1.08);
    ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = "#1B1638"; ctx.lineWidth = 2.4;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * (g.eyeSp + r * 0.85), g.eyeY - 1); ctx.lineTo(s * (g.rx * 0.97), g.eyeY - 3); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-g.eyeSp + r * 0.6, g.eyeY - 1); ctx.lineTo(g.eyeSp - r * 0.6, g.eyeY - 1); ctx.stroke();
    for (const s of [-1, 1]) {
      const x = s * g.eyeSp;
      star(ctx, x, g.eyeY + r * 0.06, r, 0.52);
      ctx.fillStyle = lin(ctx, g.eyeY - r, g.eyeY + r, "rgba(64,34,150,.93)", "rgba(20,10,60,.95)"); ctx.fill();
      ctx.strokeStyle = BUTTER; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = EDGE; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - r * 0.4, g.eyeY - r * 0.1); ctx.lineTo(x - r * 0.12, g.eyeY - r * 0.42); ctx.stroke();
    }
    twinkle(ctx, -g.eyeSp - r * 0.7, g.eyeY - r * 0.75, 4, f.t * 2.6);
    ctx.restore();
  },

  moustache(ctx, f, g) {
    const w = Math.max(11, Math.min(g.mouthW * 0.95, g.eyeSp * 1.25));
    const y = g.mouthY - Math.min(5, g.mouthDepth * 0.35) - 1 + Math.sin(f.t * 1.3) * 0.15;
    ctx.save(); ctx.translate(0, y);
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      ctx.beginPath();
      ctx.moveTo(0.5, -2.4);
      ctx.bezierCurveTo(w * 0.35, -6.4, w * 0.8, -4.4, w * 1.02, -1);
      ctx.bezierCurveTo(w * 1.2, 1.6, w * 1.08, 4.2, w * 0.86, 3.2);
      ctx.bezierCurveTo(w * 0.94, 1.6, w * 0.7, 0.8, w * 0.5, 1.6);
      ctx.bezierCurveTo(w * 0.28, 3, 0.5, 3.2, 0.5, 1.4);
      ctx.closePath();
      ctx.fillStyle = lin(ctx, -6, 4, "#5a3a3a", "#22121e"); ctx.fill(); ctx.strokeStyle = "rgba(20,8,20,.6)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = "rgba(255,230,220,.28)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(w * 0.15, -3.2); ctx.bezierCurveTo(w * 0.4, -4.6, w * 0.65, -3.6, w * 0.82, -1.2); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },
};

/* ---------------------------------------------------------------- neck
 * Local frame: origin at the throat, `w` is the half-width of the body there. */

type NeckDraw = (ctx: Ctx, f: AccFrame, w: number) => void;
const NECK: Record<string, NeckDraw> = {
  "bow-tie"(ctx, f) {
    ctx.save(); ctx.rotate(Math.sin(f.t * 0.9) * 0.02);
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      ctx.beginPath(); ctx.moveTo(1.5, 0); ctx.quadraticCurveTo(8, -9.5, 16, -8.5); ctx.quadraticCurveTo(13.4, 0, 16, 8.5); ctx.quadraticCurveTo(8, 9.5, 1.5, 0); ctx.closePath();
      ctx.fillStyle = lin(ctx, -9, 9, "#ff8fa3", "#d92f52"); ctx.fill(); stroked(ctx, 1.5);
      ctx.fillStyle = "rgba(255,240,214,.85)";
      for (const [x, y] of [[8, -3.4], [11.5, 2.6], [6, 3.6]] as const) { ctx.beginPath(); ctx.arc(x, y, 1.15, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    ctx.beginPath(); ctx.roundRect(-3.4, -4.6, 6.8, 9.2, 3); ctx.fillStyle = lin(ctx, -5, 5, "#ff7f9b", "#c92a4c"); ctx.fill(); stroked(ctx, 1.3);
    shine(ctx, -1.2, -2, 1, 1.8, 0, 0.6);
    ctx.restore();
  },

  bell(ctx, f, w) {
    const sw = f.sway * 0.03 + Math.sin(f.t * 1.7) * 0.05;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-w * 0.86, -6.5); ctx.quadraticCurveTo(0, 8.5, w * 0.86, -6.5);
    ctx.lineCap = "round"; ctx.strokeStyle = EDGE; ctx.lineWidth = 6.2; ctx.stroke();
    ctx.strokeStyle = lin(ctx, -6, 8, "#ff8fa3", "#d92f52", 0, 0); ctx.lineWidth = 4.2; ctx.stroke();
    ctx.translate(0, 6.6); ctx.rotate(sw);
    const g = ctx.createRadialGradient(-1.6, 3.6, 0, 0, 5.6, 8);
    g.addColorStop(0, "#fff6bd"); g.addColorStop(1, "#e59a25");
    ctx.beginPath(); ctx.arc(0, 5.6, 6.2, 0, TAU); ctx.fillStyle = g; ctx.fill(); stroked(ctx, 1.4);
    ctx.strokeStyle = "rgba(120,60,10,.6)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-5.4, 6.6); ctx.lineTo(5.4, 6.6); ctx.stroke();
    ctx.fillStyle = "rgba(120,60,10,.7)"; ctx.beginPath(); ctx.arc(0, 8.4, 1.3, 0, TAU); ctx.fill();
    shine(ctx, -2.4, 2.8, 1.5, 1, -0.6, 0.8);
    ctx.restore();
  },

  scarf(ctx, f, w) {
    ctx.save();
    const wob = Math.sin(f.t * 1.4) * 1.2 + f.sway * 0.05;
    // hanging tail first, so the wrap sits on top of it
    ctx.save(); ctx.translate(w * 0.42, 1); ctx.rotate(-0.16 + wob * 0.03);
    ctx.beginPath(); ctx.moveTo(-5.8, 0); ctx.lineTo(6.2, 0); ctx.lineTo(7.4, 17); ctx.lineTo(4, 15.4); ctx.lineTo(1.2, 18); ctx.lineTo(-2.2, 15.6); ctx.lineTo(-6.6, 17.6); ctx.closePath();
    ctx.fillStyle = "#ffeecf"; ctx.fill(); ctx.save(); ctx.clip();
    ctx.fillStyle = CORAL; for (const y of [3, 10]) ctx.fillRect(-9, y, 18, 3.6);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-5.8, 0); ctx.lineTo(6.2, 0); ctx.lineTo(7.4, 17); ctx.lineTo(4, 15.4); ctx.lineTo(1.2, 18); ctx.lineTo(-2.2, 15.6); ctx.lineTo(-6.6, 17.6); ctx.closePath(); stroked(ctx, 1.4);
    ctx.restore();
    // the wrap around the neck
    ctx.beginPath(); ctx.moveTo(-w * 0.9, -7); ctx.quadraticCurveTo(0, 12, w * 0.9, -7);
    ctx.lineCap = "round"; ctx.strokeStyle = EDGE; ctx.lineWidth = 11.4; ctx.stroke();
    ctx.strokeStyle = "#ffeecf"; ctx.lineWidth = 9.2; ctx.stroke();
    ctx.setLineDash([5, 6.5]); ctx.strokeStyle = CORAL; ctx.lineWidth = 9.2; ctx.lineCap = "butt"; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-w * 0.8, -9.4); ctx.quadraticCurveTo(0, 8, w * 0.8, -9.4); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.stroke();
    ctx.restore();
  },
};

/* ---------------------------------------------------------------- held
 * Local frame: origin at the little fist; -y is up. Drawn after a fist so it reads as gripped. */

const HELD: Record<string, Draw> = {
  lollipop(ctx, f) {
    ctx.save(); ctx.rotate(0.12 + f.sway * 0.004);
    ctx.strokeStyle = EDGE; ctx.lineWidth = 4.4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, -24); ctx.stroke();
    ctx.strokeStyle = "#fff8ef"; ctx.lineWidth = 2.8; ctx.stroke();
    ctx.translate(0, -34);
    const g = ctx.createRadialGradient(-4, -4, 1, 0, 0, 14);
    g.addColorStop(0, "#ffb3d6"); g.addColorStop(1, "#ff4f9a");
    ctx.beginPath(); ctx.arc(0, 0, 12.5, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = "#fff4d4"; ctx.lineWidth = 2.8; ctx.lineCap = "round"; ctx.beginPath();
    for (let a = 0; a < 15; a += 0.2) { const r = a * 0.78; const x = Math.cos(a + f.t * 0.2) * r, y = Math.sin(a + f.t * 0.2) * r; if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 12.5, 0, TAU); stroked(ctx, 1.5);
    shine(ctx, -5, -6, 3.6, 2, -0.7, 0.7);
    ctx.restore();
  },

  balloon(ctx, f) {
    ctx.save();
    const bx = 7 + Math.sin(f.t * 0.9) * 4 + f.sway * 0.35, by = -66 + Math.sin(f.t * 1.3) * 2.6 + f.sway2 * 0.05;
    // string: a lazy curve from the fist to the knot
    ctx.strokeStyle = "rgba(236,233,255,.85)"; ctx.lineWidth = 1.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-3 + Math.sin(f.t * 1.7) * 2, -18, bx + 6, by + 30, bx, by + 18); ctx.stroke();
    ctx.translate(bx, by); ctx.rotate((bx - 7) * 0.012);
    ctx.beginPath(); ctx.moveTo(0, 17); ctx.bezierCurveTo(-18, 6, -17, -20, 0, -20); ctx.bezierCurveTo(17, -20, 18, 6, 0, 17); ctx.closePath();
    const g = ctx.createRadialGradient(-5, -9, 1, 0, -2, 22);
    g.addColorStop(0, "#ff9fb2"); g.addColorStop(0.55, CORAL); g.addColorStop(1, "#c92a4c");
    ctx.fillStyle = g; ctx.fill(); stroked(ctx, 1.5);
    ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(-3.4, 22); ctx.lineTo(3.4, 22); ctx.closePath(); ctx.fillStyle = "#d92f52"; ctx.fill(); stroked(ctx, 1.1);
    shine(ctx, -7, -10, 3, 6, 0.5, 0.6); shine(ctx, -3, -15, 1.4, 1, 0, 0.7);
    ctx.restore();
  },

  umbrella(ctx, f) {
    ctx.save(); ctx.rotate(-0.3 + f.sway * 0.006 + Math.sin(f.t * 0.8) * 0.02);
    ctx.strokeStyle = "#3a2d6b"; ctx.lineCap = "round"; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.arc(-4, 6, 4, 0, Math.PI * 0.95); ctx.stroke();
    ctx.translate(0, -46);
    const R = 30, H = 20, n = 6;
    for (let i = 0; i < n; i++) {
      const x0 = -R + (i * 2 * R) / n, x1 = -R + ((i + 1) * 2 * R) / n;
      const m = (x0 + x1) / 2;
      ctx.beginPath(); ctx.moveTo(0, -H - 1.5);
      ctx.quadraticCurveTo(x0 * 0.92, -H * 0.9, x0, 0);
      ctx.quadraticCurveTo(m, 5.5, x1, 0);
      ctx.quadraticCurveTo(x1 * 0.92, -H * 0.9, 0, -H - 1.5); ctx.closePath();
      ctx.fillStyle = i % 2 ? "#fff1d8" : lin(ctx, -H, 4, "#ff8fa3", "#d92f52"); ctx.fill(); stroked(ctx, 1.2);
    }
    shine(ctx, -11, -11, 3, 6, 0.9, 0.35);
    ctx.fillStyle = "#3a2d6b"; ctx.beginPath(); ctx.arc(0, -H - 2.4, 1.9, 0, TAU); ctx.fill();
    ctx.restore();
  },
};

/* ---------------------------------------------------------------- placement */

/** Half-width of the body at design height y (mirrors the shape used by the body path). */
export function halfWidthAt(c: Creature, y: number): number {
  const { rx, ry, nTop, nBot, pear, point } = c.shape;
  const yn = clamp(y / ry, -0.995, 0.995);
  const n = yn < 0 ? nTop : nBot;
  let w = rx * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(yn), n)), 1 / n);
  w *= 1 + pear * yn;
  if (point > 0 && yn < 0) w *= 1 - point * yn * yn;
  return Math.max(rx * 0.3, w);
}

/** Wobble of the crown of the head from the body's jelly modes, in design px (negative = up). */
function crownWobble(c: Creature): number {
  const m = c.modes;
  const r = m[0]!.x * Math.cos(-Math.PI + 0.4) + m[1]!.x * Math.cos(-1.5 * Math.PI + 1.3) + m[2]!.x * Math.cos(-2 * Math.PI + 2.1) + m[3]!.x * Math.cos(-2.5 * Math.PI);
  return -r * 1.4;
}

const known = (table: Record<string, unknown>, id: string | undefined): id is string => !!id && Object.prototype.hasOwnProperty.call(table, id);

/** Called from drawCreature inside the body transform, after the body, face and limbs. */
export function drawAccessories(c: Creature, ctx: Ctx, pal: Palette, acc: Accessories): void {
  if (c.shown === "egg" || c.attach.egg > 0.4 || c.shellT >= 0) return;
  const { rx, ry } = c.shape;
  const fd = c.fd;
  const happy = clamp(c.f.curve - 0.3);
  const f: AccFrame = { t: c.t, sway: c.sway.x, sway2: c.sway2.x, happy, pal };
  const fox = c.lookX.x * 3.6 * (rx / 45), foy = c.lookY.x * 2.4;
  const shear = c.shear.x * 0.45;

  if (known(FACE, acc.face)) {
    const g: FaceGeo = { eyeSp: fd.eyeSp, eyeY: fd.eyeY + foy * 0.85, eyeRx: fd.eyeRx, eyeRy: fd.eyeRy, mouthY: fd.mouthY + foy * 0.8, mouthW: fd.mouthW, mouthDepth: fd.mouthDepth, rx, ry };
    ctx.save(); ctx.translate(fox * 0.85, 0);
    FACE[acc.face]!(ctx, f, g);
    ctx.restore();
  }

  if (known(NECK, acc.neck)) {
    const ny = Math.min(fd.mouthY + 10 + fd.mouthDepth * 0.35, ry * 0.8);
    const w = halfWidthAt(c, ny);
    ctx.save(); ctx.translate(fox * 0.3 + shear * -ny / ry * 0, ny);
    const s = clamp(rx / 43, 0.9, 1.22);
    ctx.scale(s, s);
    NECK[acc.neck]!(ctx, f, w / s);
    ctx.restore();
  }

  if (known(HELD, acc.held)) {
    const hx = rx * 0.94 + 8, hy = ry * 0.36 - happy * 6 + Math.sin(c.t * 2.1) * 1.1;
    ctx.save(); ctx.translate(hx, hy);
    ctx.beginPath(); ctx.ellipse(0, 0, 6.2, 5.6, 0, 0, TAU);
    ctx.fillStyle = lin(ctx, -5, 5, pal.light, pal.mid); ctx.fill(); ctx.strokeStyle = EDGE; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); ctx.translate(0, -1);
    HELD[acc.held]!(ctx, f);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 1.2, 6.2, 4.6, 0, 0, TAU); ctx.fillStyle = lin(ctx, -4, 6, pal.light, pal.mid); ctx.fill(); ctx.strokeStyle = EDGE; ctx.lineWidth = 1.5; ctx.stroke();
    shine(ctx, -1.8, -0.4, 1.8, 1.1, -0.5, 0.5);
    ctx.restore();
  }

  if (known(HATS, acc.hat)) {
    const baseY = -ry * 0.84 + crownWobble(c) + c.shape.lump * 2.5;
    const w = halfWidthAt(c, -ry * 0.84);
    const s = clamp(w / 26, 0.85, 1.22);
    ctx.save();
    ctx.translate(shear + fox * 0.12, baseY + c.accLag.y);
    ctx.rotate(c.accLag.r + f.sway * 0.004);
    ctx.scale(s, s);
    HATS[acc.hat]!(ctx, f);
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- icons */

const ICON: Record<string, [number, number, number]> = {
  // id: [centre x, centre y, half-size], in each item's own local frame
  "party-cone": [0, -22, 28], beanie: [0, -18, 30], headphones: [0, -8, 34], daisy: [12, -14, 21], bucket: [-2, -12, 26],
  "sprout-pot": [0, -16, 28], wizard: [3, -25, 33], crown: [0, -12, 24],
  "round-glasses": [0, 0, 27], "star-shades": [0, 0, 29], moustache: [0, 0, 17],
  "bow-tie": [0, 0, 19], bell: [0, 4, 22], scarf: [0, 4, 26],
  lollipop: [0, -14, 26], balloon: [8, -24, 32], umbrella: [-8, -32, 36],
};

const ICON_GEO: FaceGeo = { eyeSp: 15, eyeY: 0, eyeRx: 9.5, eyeRy: 11.5, mouthY: 17, mouthW: 13, mouthDepth: 9, rx: 40, ry: 40 };

/** Draw an item on its own, fitted into a w by h box. Used by the wardrobe's tiles. */
export function drawAccessoryIcon(ctx: Ctx, id: string, w: number, h: number, t = 0): boolean {
  const cfg = ICON[id];
  if (!cfg) return false;
  const [cx, cy, half] = cfg;
  const s = Math.min(w, h) / (half * 2);
  const f: AccFrame = { t, sway: 0, sway2: 0, happy: 0, pal: null };
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-cx, -cy);
  if (HATS[id]) HATS[id]!(ctx, f);
  else if (FACE[id]) FACE[id]!(ctx, f, ICON_GEO);
  else if (NECK[id]) NECK[id]!(ctx, f, 30);
  else if (HELD[id]) HELD[id]!(ctx, f);
  ctx.restore();
  return true;
}
