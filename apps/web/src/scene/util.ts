/** Small shared helpers for the scene: colour maths, easing, path helpers, glow sprites. */

export type RGB = [number, number, number];
type Ctx = CanvasRenderingContext2D;

export const P = {
  ink: "#1B1638", plum: "#3A2A6B", lagoon: "#38D6B8", peach: "#FFB58A",
  coral: "#FF5C7A", butter: "#FFE58F", fog: "#ECE9FF",
} as const;

export const SPECIES_HUE: Record<string, string> = {
  egg: "#F3EEFF", blobule: "#38D6B8", jevling: "#C8F26B", placid: "#8FA8FF",
  feral: "#FF7A45", needy: "#FF8FC7", stoic: "#5F8F9E", insatiable: "#B36BFF",
};

export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t: number): number => { const c = clamp(t); return c * c * c; };
export const easeInOut = (t: number): number => { const c = clamp(t); return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; };
export const easeOutBack = (t: number): number => {
  const c = clamp(t), k = 1.70158;
  return 1 + (k + 1) * Math.pow(c - 1, 3) + k * Math.pow(c - 1, 2);
};
/** 0->1->0 pulse over [a,b] with soft edges. */
export const window01 = (t: number, a: number, b: number, fade = 0.15): number =>
  smooth(a, a + fade, t) * (1 - smooth(b - fade, b, t));

const hexCache = new Map<string, RGB>();
export function hex(h: string): RGB {
  let c = hexCache.get(h);
  if (!c) {
    const n = parseInt(h.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(h, c);
  }
  return c;
}
export function mix(a: RGB, b: RGB, t: number, out: RGB = [0, 0, 0]): RGB {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
export const css = (c: RGB, a = 1): string =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
/** Mix a hex colour toward white (amt>0) or ink (amt<0). */
export function shade(h: string, amt: number): string {
  const c = hex(h);
  return css(amt >= 0 ? mix(c, [255, 255, 255], amt) : mix(c, hex(P.ink), -amt));
}
export const alpha = (h: string, a: number): string => css(hex(h), a);

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Critically-ish damped spring with overshoot, for bubbles etc. */
export class Spring {
  v = 0;
  x: number;
  constructor(x = 0, public k = 190, public c = 15) { this.x = x; }
  step(target: number, dt: number): number {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

const glowCache = new Map<string, HTMLCanvasElement>();
/** Soft radial glow sprite (128px) in a hex colour; draw scaled with 'lighter' for bloom. */
export function glow(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const rgb = hex(color);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, css(rgb, 1));
    gr.addColorStop(0.18, css(rgb, 0.55));
    gr.addColorStop(0.45, css(rgb, 0.16));
    gr.addColorStop(1, css(rgb, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    glowCache.set(color, c);
  }
  return c;
}
export function drawGlow(ctx: Ctx, color: string, x: number, y: number, r: number, a: number, sy = 1): void {
  if (a <= 0.003 || r <= 0) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(glow(color), x - r, y - r * sy, r * 2, r * 2 * sy);
  ctx.globalAlpha = 1;
}

export function star4(ctx: Ctx, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0);
  ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.closePath();
}
export function star5(ctx: Ctx, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? s : s * 0.46;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}
export function heartPath(ctx: Ctx, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.8);
  ctx.bezierCurveTo(-s * 1.25, s * 0.1, -s * 0.72, -s * 0.85, 0, -s * 0.32);
  ctx.bezierCurveTo(s * 0.72, -s * 0.85, s * 1.25, s * 0.1, 0, s * 0.8);
  ctx.closePath();
}

export const FONT = `"Bricolage Grotesque", "Figtree", system-ui, sans-serif`;
