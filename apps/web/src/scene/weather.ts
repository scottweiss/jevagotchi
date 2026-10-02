/**
 * Weather + seasons for the diorama: window sky (cloud banks, rain, snow, petals, leaves,
 * lightning), glass droplets and frost, seasonal grade, sill snow, and a few flakes in the
 * light shaft. Pure canvas, no assets; particle counts are capped and everything is
 * static under prefers-reduced-motion (no flashes, no falling motion).
 *
 * Stage owns one WeatherFx and calls it from a few small hooks.
 */
import { SEASONS, type Season, type Weather, type WeatherKind } from "@jevagotchi/core";
import type { Layout } from "./room.js";
import type { SkyState } from "./sky.js";
import { clamp, css, drawGlow, hex, lerp, mix, mulberry, smooth, type RGB } from "./util.js";

type Ctx = CanvasRenderingContext2D;

/** Callbacks room.ts invokes while painting the window (all in the window's clipped, translated space). */
export interface WindowHooks {
  /** After the moon and default clouds, before the hills. */
  clouds?: (g: Ctx, x: number, y: number, w: number, h: number) => void;
  /** After the hills: things out in the world (precipitation, petals, fireflies, lightning). */
  outside?: (g: Ctx, x: number, y: number, w: number, h: number) => void;
  /** On the glass itself, over the mullions: droplets, condensation, frost. */
  glass?: (g: Ctx, x: number, y: number, w: number, h: number) => void;
}

export const CALM: Weather = { kind: "clear", intensity: 0.5, season: "summer", wind: 0.15 };

const TAU = Math.PI * 2;
const RAIN_CAP = 90, SNOW_CAP = 80, DROP_CAP = 34, WIN_DRIFT_CAP = 14;

const COVER: Record<WeatherKind, (i: number) => number> = {
  clear: () => 0, cloudy: (i) => 0.55 + 0.3 * i, drizzle: () => 0.7, rain: (i) => 0.8 + 0.1 * i, storm: () => 1, snow: () => 0.72,
};
const RAIN: Record<WeatherKind, (i: number) => number> = {
  clear: () => 0, cloudy: () => 0, drizzle: (i) => 0.2 + 0.2 * i, rain: (i) => 0.55 + 0.3 * i, storm: (i) => 0.85 + 0.15 * i, snow: () => 0,
};

interface Streak { x: number; ph: number; len: number; sp: number; d: number }
interface Flake { x: number; ph: number; sp: number; sw: number; s: number; d: number }
interface Drop { x: number; y: number; r: number; vy: number; y0: number; run: number; wait: number }
interface Drift { x: number; y: number; ph: number; sp: number; sw: number; s: number; rot: number; c: number; u: number; life: number; delay: number }
interface Bolt { pts: [number, number][]; fork: [number, number][] }

const PETALS = ["#ffd3e2", "#ffbcd3", "#fff0f5", "#ffc2d8"];
const LEAVES = ["#e8892b", "#c8501f", "#f2b134", "#a83a1c", "#d9702a"];

export class WeatherFx {
  /** Fired when thunder should be heard: intensity 0-1. */
  onThunder?: (intensity: number) => void;
  /** Called on a flash (for creature reactions). */
  onStrike?: () => void;

  /** Smoothed scene state. */
  cover = 0; rain = 0; snow = 0; storm = 0; wind = 0.15;
  readonly season: Record<Season, number> = { spring: 0, summer: 1, autumn: 0, winter: 0 };
  /** 0-1 lightning flash brightness right now. */
  flash = 0;

  private target: Weather = CALM;
  private t = 0;
  private flashT = 99;
  private flashAmp = 0;
  private nextStrike = 6;
  private thunderQ: { t: number; i: number }[] = [];
  private bolt: Bolt | null = null;
  private lookIn = 8;
  private lookFor = 0;
  private lookDir = { x: 0, y: 0 };
  private booted = false;

  private readonly streaks: Streak[] = [];
  private readonly flakes: Flake[] = [];
  private readonly drops: Drop[] = [];
  private readonly winDrift: Drift[] = [];
  private readonly puffs: HTMLCanvasElement[] = [];
  private frost: HTMLCanvasElement | null = null;
  private readonly rnd = mulberry(4407);

  constructor() {
    const r = this.rnd;
    for (let i = 0; i < RAIN_CAP; i++) this.streaks.push({ x: r(), ph: r(), len: 0.09 + r() * 0.12, sp: 0.9 + r() * 0.7, d: r() });
    for (let i = 0; i < SNOW_CAP; i++) this.flakes.push({ x: r(), ph: r() * TAU, sp: 0.05 + r() * 0.09, sw: 2 + r() * 5, s: 0.7 + r() * 1.6, d: r() });
    for (let i = 0; i < DROP_CAP; i++) this.drops.push(this.newDrop(true));
    for (let i = 0; i < WIN_DRIFT_CAP; i++) this.winDrift.push(this.newDrift(true));
  }

  /** The (unsmoothed) weather being approached, for audio and UI. */
  get now(): Weather { return this.target; }
  /** Smoothed season weight, e.g. season("winter"). */
  get winter(): number { return this.season.winter; }
  /** 0-1: how snug the weather makes the room feel (rain, storm, snow). */
  get snug(): number { return clamp(this.rain * 0.8 + this.snow * 0.7 + this.storm * 0.3); }

  strike(): void { this.nextStrike = 0; }

  update(dt: number, w: Weather, reduced: boolean): void {
    this.target = w;
    this.reduced = reduced;
    const cover = COVER[w.kind](w.intensity), rain = RAIN[w.kind](w.intensity);
    const snow = w.kind === "snow" ? 0.45 + 0.55 * w.intensity : 0;
    const storm = w.kind === "storm" ? 0.5 + 0.5 * w.intensity : 0;
    if (!this.booted) { // first frame: settle instantly, no fade-in from clear
      this.booted = true; this.cover = cover; this.rain = rain; this.snow = snow; this.storm = storm; this.wind = w.wind;
      for (const s of SEASONS) this.season[s] = s === w.season ? 1 : 0;
    }
    const k = 1 - Math.exp(-dt * 0.55); // ~2s crossfades between weather states
    this.cover += (cover - this.cover) * k;
    this.rain += (rain - this.rain) * k;
    this.snow += (snow - this.snow) * k;
    this.storm += (storm - this.storm) * k;
    this.wind += (w.wind - this.wind) * k;
    const ks = 1 - Math.exp(-dt * 0.3);
    for (const s of SEASONS) this.season[s] += ((s === w.season ? 1 : 0) - this.season[s]) * ks;

    const mdt = reduced ? 0 : dt;
    this.t += mdt;
    this.updateDrops(mdt);
    this.updateStorm(dt, reduced);
    this.updateLook(dt);
  }

  /* ---- grading -------------------------------------------------------------- */

  /** Tint the sky/ambient state in place: overcast, storm gloom, and the season's light. */
  gradeSky(sky: SkyState): void {
    const c = this.cover, st = this.storm, r = this.rain, sn = this.snow;
    if (c > 0.005) {
      const lum = (sky.top[0] * 0.3 + sky.top[1] * 0.5 + sky.top[2] * 0.2 + sky.bot[0] * 0.3 + sky.bot[1] * 0.5 + sky.bot[2] * 0.2) * 0.5;
      const grey: RGB = [lum * 0.88, lum * 0.98, lum * 1.12];
      const k = clamp(c * 0.52 + st * 0.2);
      const dark = 1 - 0.28 * st - 0.08 * r;
      for (const key of ["top", "bot"] as const) {
        const col = sky[key];
        mix(col, grey, k, col);
        col[0] *= dark; col[1] *= dark; col[2] *= dark * 1.02;
      }
      sky.day *= 1 - 0.42 * c - 0.2 * st;
      sky.star *= 1 - 0.85 * c;
      sky.light = Math.max(sky.day, sky.star * 0.42);
      sky.night = clamp(1 - sky.day * 1.3);
      const a = sky.amb;
      const dim = 1 - 0.1 * c - 0.1 * st;
      a[0] *= dim * (1 - 0.06 * r); a[1] *= dim * (1 - 0.01 * r); a[2] *= dim * (1 + 0.02 * r);
    }
    if (sn > 0.01) { // snow-light bounces cool and bright
      mix(sky.bot, [226, 232, 248], 0.25 * sn * sky.day, sky.bot);
    }
    const s = this.season;
    const a = sky.amb, day = clamp(sky.day * 1.2);
    const tint = (m: RGB, w: number): void => { for (let i = 0; i < 3; i++) a[i] = a[i]! * (1 + (m[i]! - 1) * w * (0.4 + 0.6 * day)); };
    tint([1.0, 1.02, 0.99], s.spring);
    tint([1.03, 1.0, 0.93], s.summer);
    tint([1.05, 0.94, 0.8], s.autumn);
    tint([0.86, 0.94, 1.08], s.winter);
    for (let i = 0; i < 3; i++) a[i] = Math.min(255, a[i]!);
    // window colours, gently
    mix(sky.bot, [255, 172, 96], 0.14 * s.autumn * sky.day, sky.bot);
    mix(sky.top, [110, 170, 236], 0.1 * s.summer * sky.day, sky.top);
    mix(sky.bot, [214, 232, 255], 0.16 * s.winter * sky.day, sky.bot);
  }

  /** Full-screen grade: season wash, rain blue, frosty corners. Screen space, after the vignette-free scene. */
  drawGrade(ctx: Ctx, W: number, H: number, dark: number): void {
    const s = this.season, n = 1 - dark * 0.35;
    ctx.globalCompositeOperation = "soft-light";
    const wash = (col: string, a: number): void => { if (a > 0.004) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); } };
    wash("#ffc6df", 0.12 * s.spring * n);
    wash("#ffcf70", 0.16 * s.summer * n);
    wash("#ff9436", 0.22 * s.autumn * n);
    wash("#86aaff", 0.2 * s.winter * n);
    wash("#4a6cc0", 0.3 * clamp(this.rain + this.storm * 0.3) * n);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const fr = this.season.winter * (0.55 + 0.45 * clamp(this.snow + (this.target.wind > 0.4 ? 0.2 : 0)));
    if (fr > 0.02) this.drawFrostCorners(ctx, W, H, fr);
  }

  private drawFrostCorners(ctx: Ctx, W: number, H: number, a: number): void {
    const sz = Math.min(W, H) * 0.3;
    const f = this.frostSprite();
    ctx.globalAlpha = clamp(a) * 0.5;
    for (let i = 0; i < 4; i++) {
      const fx = i % 2 === 0 ? 1 : -1, fy = i < 2 ? 1 : -1;
      ctx.save();
      ctx.translate(fx > 0 ? 0 : W, fy > 0 ? 0 : H);
      ctx.scale(fx, fy);
      ctx.drawImage(f, 0, 0, sz, sz);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private frostSprite(): HTMLCanvasElement {
    if (this.frost) return this.frost;
    const S = 256;
    const c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d")!;
    const fog = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.95);
    fog.addColorStop(0, "rgba(232,244,255,0.62)"); fog.addColorStop(0.38, "rgba(214,232,255,0.26)"); fog.addColorStop(1, "rgba(200,222,255,0)");
    g.fillStyle = fog; g.fillRect(0, 0, S, S);
    const r = mulberry(88);
    g.lineCap = "round";
    const branch = (x: number, y: number, ang: number, len: number, depth: number): void => {
      if (len < 5 || depth > 4) return;
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      g.strokeStyle = `rgba(245,250,255,${(0.55 - depth * 0.08).toFixed(2)})`;
      g.lineWidth = Math.max(0.6, 2.1 - depth * 0.4);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      for (let k = 0.35; k < 1; k += 0.3) {
        const bx = lerp(x, x2, k), by = lerp(y, y2, k);
        branch(bx, by, ang + 0.7 + r() * 0.25, len * 0.42, depth + 1);
        branch(bx, by, ang - 0.7 - r() * 0.25, len * 0.42, depth + 1);
      }
      branch(x2, y2, ang + (r() - 0.5) * 0.3, len * 0.55, depth + 1);
    };
    for (let i = 0; i < 3; i++) branch(0, 0, 0.25 + (i / 2) * (Math.PI / 2 - 0.5), 84 + r() * 50, 1);
    this.frost = c;
    return c;
  }

  /* ---- window hooks ---------------------------------------------------------- */

  hooks(sky: SkyState, dark: number): WindowHooks {
    return {
      clouds: (g, x, y, w, h) => this.drawCloudBanks(g, sky, x, y, w, h),
      outside: (g, x, y, w, h) => this.drawOutside(g, sky, x, y, w, h),
      glass: (g, x, y, w, h) => this.drawGlass(g, x, y, w, h, dark),
    };
  }

  private puff(i: number): HTMLCanvasElement {
    let p = this.puffs[i];
    if (p) return p;
    const lum = [0.14, 0.34, 0.56, 0.8, 1][i]!;
    const base = mix(hex("#1e1c3e"), hex("#f6f4ff"), lum);
    p = document.createElement("canvas"); p.width = 256; p.height = 112;
    const g = p.getContext("2d")!;
    const blob = (x: number, y: number, r: number, a: number): void => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, css(base, a)); gr.addColorStop(0.55, css(base, a * 0.7)); gr.addColorStop(1, css(base, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const r = mulberry(19);
    for (let k = 0; k < 11; k++) {
      const u = k / 10;
      blob(28 + u * 200, 66 - Math.sin(u * Math.PI) * 26 + (r() - 0.5) * 12, 30 + Math.sin(u * Math.PI) * 18 + r() * 8, 0.95);
    }
    for (let k = 0; k < 6; k++) blob(50 + k * 30, 84, 26, 0.7); // flatter base
    this.puffs[i] = p;
    return p;
  }

  private drawCloudBanks(g: Ctx, sky: SkyState, x: number, y: number, w: number, h: number): void {
    const c = this.cover;
    if (c < 0.03) return;
    const U = w / 190;
    const bright = clamp(sky.day * 1.1 + 0.28 - this.storm * 0.34);
    const spd = 3 + this.wind * 9;
    const LAYERS = 3, PER = 3;
    for (let l = 0; l < LAYERS; l++) {
      const lum = clamp(bright - l * 0.1) * 4;
      const i0 = Math.min(3, Math.floor(lum)), f = clamp(lum - i0);
      const a = clamp(c * 1.25 - l * 0.22);
      if (a < 0.02) continue;
      for (let k = 0; k < PER; k++) {
        const seed = l * 7 + k * 3.3;
        const cw = w * (0.85 + ((seed * 0.37) % 0.6)) * (1 + this.storm * 0.15);
        const span = w * 1.9;
        const px = ((((seed * 0.41) % 1) * span + this.t * spd * (0.5 + l * 0.35) * U) % span) - cw * 0.7;
        const py = y + h * (0.02 + l * 0.14 + ((seed * 0.29) % 0.1) - 0.02) - cw * 0.05;
        const ch = cw * 0.44;
        g.globalAlpha = a * (1 - f) * 0.92;
        g.drawImage(this.puff(i0), x + px, py, cw, ch);
        if (f > 0.01) { g.globalAlpha = a * f * 0.92; g.drawImage(this.puff(i0 + 1), x + px, py, cw, ch); }
      }
    }
    g.globalAlpha = 1;
    // a low grey wash pulls the horizon into the murk
    if (c > 0.3) {
      const gr = g.createLinearGradient(0, y + h * 0.35, 0, y + h * 0.95);
      const m = css(mix(sky.bot, [120, 130, 160], 0.4), 0);
      gr.addColorStop(0, m); gr.addColorStop(1, css(mix(sky.bot, [120, 130, 160], 0.4), 0.28 * c));
      g.fillStyle = gr; g.fillRect(x, y + h * 0.35, w, h * 0.65);
    }
  }

  private drawOutside(g: Ctx, sky: SkyState, x: number, y: number, w: number, h: number): void {
    const U = w / 190;
    const wind = this.wind;
    // rain streaks
    const nr = Math.ceil(RAIN_CAP * clamp(this.rain * 1.05));
    if (nr > 0) {
      const slant = 0.1 + wind * 0.35;
      const col = sky.day > 0.35 ? "220,232,255" : "170,190,255";
      g.lineCap = "round";
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = `rgba(${col},${pass ? 0.5 : 0.24})`;
        g.lineWidth = (pass ? 1.25 : 0.8) * U;
        g.beginPath();
        for (let i = 0; i < nr; i++) {
          const s = this.streaks[i]!;
          if ((s.d > 0.5 ? 1 : 0) !== pass) continue;
          const len = s.len * h * (0.7 + s.d * 0.7);
          const yy = ((s.ph + this.t * s.sp * (0.9 + s.d * 0.6)) % 1) * (h + len) - len;
          const xx = ((s.x * (w + h * slant) - yy * slant) % (w + h * slant) + w + h * slant) % (w + h * slant);
          g.moveTo(x + xx, y + yy); g.lineTo(x + xx - len * slant, y + yy + len);
        }
        g.stroke();
      }
    }
    // snow outside
    const ns = Math.ceil(SNOW_CAP * clamp(this.snow));
    if (ns > 0) {
      for (let pass = 0; pass < 2; pass++) {
        g.fillStyle = pass ? "rgba(255,255,255,0.92)" : "rgba(235,242,255,0.55)";
        g.beginPath();
        for (let i = 0; i < ns; i++) {
          const f = this.flakes[i]!;
          if ((f.d > 0.45 ? 1 : 0) !== pass) continue;
          const yy = ((f.ph / TAU + this.t * f.sp * (0.6 + f.d)) % 1) * (h + 8) - 4;
          const xx = ((f.x * w + this.t * wind * 10 * (0.4 + f.d) + Math.sin(this.t * 0.9 + f.ph) * f.sw * U) % w + w) % w;
          const r = f.s * (0.55 + f.d * 0.8) * U * 1.1;
          g.moveTo(x + xx + r, y + yy); g.arc(x + xx, y + yy, r, 0, TAU);
        }
        g.fill();
      }
    }
    // petals / leaves drifting past
    this.drawDrifts(g, this.winDrift, x, y, w, h, 1);
    this.drawOuterLedge(g, x, y, w, h);
    // snowy ground haze, and a cool bloom low in the frame in winter
    if (this.season.winter > 0.05) {
      const gr = g.createLinearGradient(0, y + h * 0.72, 0, y + h);
      const wa = this.season.winter * (0.35 + this.snow * 0.5);
      gr.addColorStop(0, "rgba(236,242,255,0)"); gr.addColorStop(1, `rgba(236,242,255,${wa.toFixed(3)})`);
      g.fillStyle = gr; g.fillRect(x, y + h * 0.72, w, h * 0.28);
    }
    // summer dusk: fireflies out over the hills
    const ff = this.fireflyBoost(sky) * (1 - this.rain);
    if (ff > 0.05 && !this.isStill) {
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 7; i++) {
        const t = this.t;
        const px = x + w * (0.12 + ((i * 0.137) % 0.78)) + Math.sin(t * 0.4 + i * 2) * 8 * U;
        const py = y + h * (0.66 + ((i * 0.211) % 0.28)) + Math.sin(t * 0.7 + i) * 6 * U;
        const p = Math.pow(Math.max(0, Math.sin(t * (0.9 + (i % 3) * 0.4) + i * 1.9)), 2);
        drawGlow(g, "#DFFF8A", px, py, 9 * U, (0.25 + 0.75 * p) * ff * 0.8);
      }
      g.globalCompositeOperation = "source-over";
    }
    // lightning bolt behind the glass
    if (this.bolt && this.flash > 0.05) this.drawBolt(g, x, y, w, h);
    // the flash itself lights the sky
    if (this.flash > 0.01) {
      g.fillStyle = `rgba(226,234,255,${(this.flash * 0.7).toFixed(3)})`;
      g.fillRect(x, y, w, h);
    }
  }

  private drawBolt(g: Ctx, x: number, y: number, w: number, h: number): void {
    const b = this.bolt!;
    const path = (pts: [number, number][]): void => {
      g.beginPath();
      pts.forEach(([u, v], i) => { const px = x + u * w, py = y + v * h; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    };
    g.lineJoin = "round"; g.lineCap = "round";
    const a = clamp(this.flash * 1.3);
    g.strokeStyle = `rgba(190,205,255,${(a * 0.45).toFixed(3)})`; g.lineWidth = 6 * (w / 190);
    path(b.pts); g.stroke(); path(b.fork); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.lineWidth = 1.8 * (w / 190);
    path(b.pts); g.stroke(); g.lineWidth = 1.1 * (w / 190); path(b.fork); g.stroke();
  }

  private drawGlass(g: Ctx, x: number, y: number, w: number, h: number, dark: number): void {
    const U = w / 190;
    const wet = clamp(this.rain * 1.1);
    // condensation haze: rain or cold
    const haze = 0.05 * wet + 0.07 * this.season.winter;
    if (haze > 0.004) { g.fillStyle = `rgba(214,226,255,${haze.toFixed(3)})`; g.fillRect(x, y, w, h); }
    // droplets
    const n = Math.ceil(DROP_CAP * wet);
    for (let i = 0; i < n; i++) {
      const d = this.drops[i]!;
      const px = x + d.x * w, py = y + d.y * h, r = d.r * U;
      if (d.run > 0 && d.y - d.y0 > 0.01) {
        const gr = g.createLinearGradient(0, y + d.y0 * h, 0, py);
        gr.addColorStop(0, "rgba(220,232,255,0)"); gr.addColorStop(1, "rgba(220,232,255,0.26)");
        g.strokeStyle = gr; g.lineWidth = Math.max(0.8, r * 0.7);
        g.beginPath(); g.moveTo(px, y + d.y0 * h); g.lineTo(px, py - r); g.stroke();
      }
      g.fillStyle = "rgba(255,255,255,0.13)";
      g.beginPath(); g.ellipse(px, py, r * 0.85, r * 1.15, 0, 0, TAU); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.32)"; g.lineWidth = 0.8;
      g.beginPath(); g.ellipse(px, py, r * 0.85, r * 1.15, 0, Math.PI * 1.05, Math.PI * 1.85); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.78)";
      g.beginPath(); g.arc(px - r * 0.28, py - r * 0.42, Math.max(0.5, r * 0.22), 0, TAU); g.fill();
    }
    // frost creeping in at the corners of the glass
    const fr = this.season.winter * (0.5 + 0.5 * clamp(this.snow + 0.3 + dark * 0.2));
    if (fr > 0.02) {
      const f = this.frostSprite();
      const sz = Math.min(w, h) * 0.5;
      g.globalAlpha = clamp(fr) * 0.7;
      for (let i = 0; i < 4; i++) {
        const fx = i % 2 === 0 ? 1 : -1, fy = i < 2 ? 1 : -1;
        g.save();
        g.translate(fx > 0 ? x : x + w, fy > 0 ? y : y + h);
        g.scale(fx, fy);
        g.drawImage(f, 0, 0, sz, sz);
        g.restore();
      }
      g.globalAlpha = 1;
    }
  }

  private reduced = false;
  private get isStill(): boolean { return this.reduced; }

  /* ---- in-room drawing ------------------------------------------------------- */

  /** Snow settled on the outer ledge, seen through the glass. Drawn inside the window's clipped space, after the hills. */
  private drawOuterLedge(g: Ctx, x: number, y: number, w: number, h: number): void {
    const amt = clamp(this.season.winter * (0.4 + 0.8 * this.snow));
    if (amt < 0.03) return;
    const U = w / 190;
    const hgt = 15 * U * amt;
    const base = y + h + 1;
    const N = 26;
    g.beginPath();
    g.moveTo(x, base);
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const bump = 0.6 + 0.4 * Math.sin(u * 27 + 1.3) * Math.sin(u * 9 + 0.4);
      g.lineTo(x + w * u, base - hgt * bump);
    }
    g.lineTo(x + w, base); g.closePath();
    const gr = g.createLinearGradient(0, base - hgt, 0, base);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.6, "#e3eafb"); gr.addColorStop(1, "#b3c0e6");
    g.fillStyle = gr; g.fill();
  }

  /** Lightning washes the room, and a few flakes catch the light shaft. Additive; call inside the "lighter" pass. */
  drawRoomLight(ctx: Ctx, L: Layout, sky: SkyState, shaftDx: number, off: { x: number; y: number }, shaftAmt: number, W: number, H: number): void {
    if (this.flash > 0.01) {
      const f = this.flash;
      const wx = L.win.x + L.win.w / 2 + off.x, wy = L.win.y + L.win.h / 2 + off.y;
      drawGlow(ctx, "#b8c8ff", wx, wy, L.win.w * 2.6, 0.8 * f);
      drawGlow(ctx, "#d8e2ff", wx + shaftDx * 0.5, L.floorY, L.win.w * 2.6, 0.32 * f, 0.6);
      ctx.globalAlpha = 0.1 * f; ctx.fillStyle = "#8fa4ff"; ctx.fillRect(-20, -20, W + 40, H + 40); ctx.globalAlpha = 1;
    }
  }

  /** How much the fireflies should be lit at dusk in summer (0-1). */
  fireflyBoost(sky: SkyState): number {
    const dusk = clamp(1 - Math.abs(sky.night - 0.55) * 2.6);
    return this.season.summer * dusk * (1 - clamp(this.cover * 0.7));
  }

  /** Where the creature glances (world px) to look out of the window; null when it has no reason to. */
  gaze(L: Layout, asleep: boolean): { x: number; y: number } | null {
    if (asleep || this.lookFor <= 0) return null;
    const win = L.win;
    return { x: win.x + win.w * (0.5 + this.lookDir.x * 0.3) - L.cx, y: win.y + win.h * (0.35 + this.lookDir.y * 0.2) - L.cy };
  }

  /* ---- particles & timers ---------------------------------------------------- */

  private driftAmount(): number {
    const s = this.season;
    return clamp(s.spring * (0.55 + 0.45 * (1 - this.rain)) + s.autumn * (0.55 + 0.6 * this.wind)) * (1 - this.snow * 0.8) * (1 - this.storm * 0.4);
  }

  private newDrift(inWindow: boolean): Drift {
    const r = this.rnd;
    return { x: r(), y: r(), ph: r() * TAU, sp: 0.03 + r() * 0.05, sw: 4 + r() * 8, s: 0.8 + r() * 0.6, rot: r() * TAU, c: r(), u: inWindow ? r() : 0, life: 8 + r() * 6, delay: 0 };
  }

  private drawDrifts(g: Ctx, list: Drift[], x: number, y: number, w: number, h: number, bright: number, room = false): void {
    const s = this.season;
    const a = this.driftAmount();
    if (a < 0.03) return;
    const petals = s.spring >= s.autumn;
    const n = room ? list.length : Math.ceil(list.length * a);
    const U = (room ? w / 1.8 : w) / 190;
    for (let i = 0; i < n; i++) {
      const d = list[i]!;
      if (room && (d.delay > 0 || i >= Math.ceil(list.length * a))) continue;
      const u = room ? d.u : ((d.u + this.t * d.sp * 0.9) % 1);
      const fade = room ? Math.sin(Math.PI * clamp(u)) * 0.9 : smooth(0, 0.08, u) * (1 - smooth(0.92, 1, u));
      if (fade < 0.02) continue;
      const wob = Math.sin(this.t * (0.8 + d.sp * 6) + d.ph);
      // spring petals float, autumn leaves tumble and swoop
      const xx = room
        ? x + d.x * w * 0.7 + w * 0.1 + u * (30 + this.wind * 90) * U + wob * d.sw * U * 1.4
        : x + ((d.x + u * (0.25 + this.wind * 0.9) * (petals ? 0.6 : 1.1)) % 1) * w + wob * d.sw * U * 0.5;
      const yy = room ? y + h * 0.08 + u * h * 0.86 : y + u * h * (petals ? 0.9 : 1.02) - 2;
      const rot = d.rot + this.t * (petals ? 1.2 : 2.2) * (0.5 + d.sp * 8) * (d.ph > 3.1 ? 1 : -1);
      const sx = Math.abs(Math.cos(rot * 0.7)) * 0.7 + 0.3;
      const col = (petals ? PETALS : LEAVES)[Math.floor(d.c * (petals ? PETALS.length : LEAVES.length))]!;
      const rgb = mix(hex(col), [40, 30, 70], room ? (1 - bright) * 0.6 : 0);
      g.globalAlpha = fade * clamp(a * 1.5);
      g.fillStyle = css(rgb);
      const size = (petals ? 3.1 : 4.6) * d.s * U * (room ? 1.35 : 1);
      g.save();
      g.translate(xx, yy); g.rotate(rot);
      g.beginPath();
      if (petals) { g.ellipse(0, 0, size, size * 0.6 * sx, 0, 0, TAU); }
      else {
        g.moveTo(-size, 0); g.quadraticCurveTo(0, -size * 0.85 * sx, size, 0); g.quadraticCurveTo(0, size * 0.85 * sx, -size, 0);
      }
      g.fill();
      if (!petals) { g.strokeStyle = "rgba(90,40,20,0.35)"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-size, 0); g.lineTo(size * 0.7, 0); g.stroke(); }
      g.restore();
    }
    g.globalAlpha = 1;
  }

  private newDrop(scatter: boolean): Drop {
    const r = this.rnd;
    const y = scatter ? r() : -0.02;
    return { x: 0.03 + r() * 0.94, y, r: 1.2 + r() * 2.3, vy: 0, y0: y, run: 0, wait: r() * 6 };
  }

  private updateDrops(dt: number): void {
    const wet = clamp(this.rain * 1.1);
    const n = Math.ceil(DROP_CAP * wet);
    for (let i = 0; i < n; i++) {
      const d = this.drops[i]!;
      d.r = Math.min(4.2, d.r + dt * 0.05 * (0.4 + wet));
      if (d.run > 0) {
        d.run -= dt;
        d.y += d.vy * dt;
        if (d.run <= 0) { d.vy = 0; d.wait = 0.6 + this.rnd() * 3; }
        if (d.y > 1.04) Object.assign(d, this.newDrop(false));
      } else {
        d.wait -= dt;
        if (d.wait <= 0 && d.r > 2.4) { d.run = 0.5 + this.rnd() * 1.4; d.vy = 0.05 + this.rnd() * 0.16; d.y0 = d.y; d.r *= 0.82; }
        else if (d.wait <= 0) d.wait = 0.5 + this.rnd() * 2;
      }
    }
  }

  private updateStorm(dt: number, reduced: boolean): void {
    for (let i = this.thunderQ.length - 1; i >= 0; i--) {
      const q = this.thunderQ[i]!;
      q.t -= dt;
      if (q.t <= 0) { this.thunderQ.splice(i, 1); this.onThunder?.(q.i); }
    }
    this.flashT += dt;
    if (this.flashT < 1.2 && !reduced) {
      const p = (t: number, a: number, k: number): number => (this.flashT > t ? a * Math.exp(-(this.flashT - t) * k) : 0);
      this.flash = clamp(p(0, 1, 9) + p(0.13, 0.8, 7) + p(0.34, 0.5, 5)) * this.flashAmp;
    } else this.flash = 0;
    if (this.storm > 0.4) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = (4 + this.rnd() * 10) / (0.6 + this.storm * 0.6);
        this.flashT = 0; this.flashAmp = 0.55 + this.rnd() * 0.45;
        if (!reduced) { this.bolt = this.makeBolt(); this.onStrike?.(); this.lookFor = 2.2; this.lookIn = 6 + this.rnd() * 8; this.lookDir = { x: (this.rnd() - 0.5) * 1.2, y: -0.4 }; }
        this.thunderQ.push({ t: 0.35 + this.rnd() * 2.4, i: this.flashAmp });
      }
    } else if (this.nextStrike < 3) this.nextStrike = 3 + this.rnd() * 5;
  }

  private makeBolt(): Bolt {
    const r = this.rnd;
    let x = 0.2 + r() * 0.6;
    const pts: [number, number][] = [[x, -0.02]];
    const fork: [number, number][] = [];
    const steps = 7;
    const forkAt = 2 + Math.floor(r() * 3);
    for (let i = 1; i <= steps; i++) {
      x = clamp(x + (r() - 0.5) * 0.22, 0.05, 0.95);
      pts.push([x, (i / steps) * 0.72]);
      if (i === forkAt) { fork.push([x, (i / steps) * 0.72]); let fx = x; for (let k = 1; k <= 3; k++) { fx += (r() - 0.3) * 0.16; fork.push([fx, (i / steps) * 0.72 + k * 0.08]); } }
    }
    return { pts, fork };
  }

  private updateLook(dt: number): void {
    if (this.lookFor > 0) { this.lookFor -= dt; return; }
    const wet = this.rain + this.snow * 0.4;
    if (wet < 0.2) { this.lookIn = 6; return; }
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookFor = 1.4 + this.rnd() * 1.6;
      this.lookIn = (8 + this.rnd() * 14) / (0.6 + wet);
      this.lookDir = { x: (this.rnd() - 0.5) * 1.4, y: (this.rnd() - 0.6) * 0.8 };
    }
  }
}
