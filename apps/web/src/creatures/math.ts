/** Tiny math / colour / spring toolkit for the creature renderer. Pure, allocation-light. */

export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOutBack = (t: number): number => { t = clamp(t); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);
/** Frame-rate independent exponential approach factor. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
/** Window envelope: 0 before a, ramps up to b, holds to c, ramps down to d. */
export const env = (t: number, a: number, b: number, c: number, d: number): number =>
  t <= a ? 0 : t < b ? smooth((t - a) / (b - a)) : t <= c ? 1 : t < d ? 1 - smooth((t - c) / (d - c)) : 0;

/** Mulberry32 – deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = (seed * 4294967296) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Critically-ish damped spring. */
export class Spring {
  x: number;
  v = 0;
  target: number;
  constructor(x = 0, public k = 120, public d = 12) { this.x = x; this.target = x; }
  step(dt: number): void {
    // sub-step for stability on stiff springs
    const n = Math.ceil(dt / 0.008);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += ((this.target - this.x) * this.k - this.v * this.d) * h;
      this.x += this.v * h;
    }
  }
  kick(v: number): void { this.v += v; }
}

/* ---- colour ---------------------------------------------------------------- */

export interface HSL { h: number; s: number; l: number }

export function hexToHsl(hex: string): HSL {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** hsla string; h wraps, s/l in percent. */
export function hsl(h: number, s: number, l: number, a = 1): string {
  h = ((h % 360) + 360) % 360;
  return `hsla(${h.toFixed(1)},${clamp(s, 0, 100).toFixed(1)}%,${clamp(l, 0, 100).toFixed(1)}%,${a.toFixed(3)})`;
}

/** Mix two HSL colours (shortest hue path). */
export function mixHsl(a: HSL, b: HSL, t: number): HSL {
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  return { h: a.h + dh * t, s: lerp(a.s, b.s, t), l: lerp(a.l, b.l, t) };
}
