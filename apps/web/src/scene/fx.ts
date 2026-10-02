/** One-shot visual effects driven by game events. The Stage owns the clock; effects own their props. */
import type { CreatureReaction } from "../contracts.js";
import type { Layout } from "./room.js";
import type { Particles } from "./particles.js";
import { P, clamp, drawGlow, easeInCubic, easeInOut, easeOutBack, easeOutCubic, hex, css, rrect, smooth, window01, lerp } from "./util.js";

type Ctx = CanvasRenderingContext2D;
export type FxName =
  | "feed" | "play" | "clean" | "medicine" | "scold" | "sleep" | "wake" | "hatch"
  | "evolve" | "die" | "refuse" | "poke" | "milestone" | "newborn";

export interface FxHost {
  L: Layout;
  p: Particles;
  reduced: boolean;
  /** Species hue of the creature right now (hex). */
  hue: string;
  react(r: CreatureReaction): void;
  hueOf(species: string | undefined): string;
}

interface Active { name: FxName; t: number; dur: number; fired: number; extra: { from?: string; to?: string } }

const DUR: Record<FxName, number> = {
  feed: 2.2, play: 2.7, clean: 2.6, medicine: 1.9, scold: 2.4, sleep: 1.7, wake: 1.4, hatch: 2.6,
  evolve: 4.6, die: 5.2, refuse: 1.1, poke: 0.7, milestone: 3.2, newborn: 3.0,
};

export class FxManager {
  private list: Active[] = [];
  /** Outputs read by the Stage every frame. */
  silhouette = 0; jitterX = 0; jitterY = 0; slow = 1; flash = 0; shakeAmp = 0; dim = 0; windowDim = 0; deathT = -1;
  private shakeLeft = 0;

  add(name: FxName, extra: { from?: string; to?: string } = {}, h: FxHost): void {
    // Only one cinematic at a time; replace the same effect if replayed.
    this.list = this.list.filter((a) => a.name !== name);
    this.list.push({ name, t: 0, dur: DUR[name], fired: 0, extra });
    if (name === "evolve" && h.reduced) this.list[this.list.length - 1]!.dur = 3.2;
  }
  get active(): boolean { return this.list.length > 0; }
  has(n: FxName): boolean { return this.list.some((a) => a.name === n); }
  clear(): void { this.list.length = 0; }

  private once(a: Active, bit: number, cond: boolean): boolean {
    if (!cond || a.fired & (1 << bit)) return false;
    a.fired |= 1 << bit;
    return true;
  }

  update(dt: number, h: FxHost): void {
    this.silhouette = 0; this.jitterX = 0; this.jitterY = 0; this.slow = 1; this.flash = 0; this.dim = 0; this.windowDim = 0; this.deathT = -1;
    let shake = 0;
    const { L, p } = h;
    const s = L.size, cx = L.cx, cy = L.cy;
    for (const a of this.list) {
      a.t += dt;
      const t = a.t;
      switch (a.name) {
        case "feed": {
          for (let i = 0; i < 2; i++) {
            const arr = i * 0.6 + 0.85;
            if (this.once(a, i, t >= arr)) {
              h.react("eat");
              const mx = cx, my = cy + s * 0.1;
              p.burst("sparkle", mx, my, 5, s * 0.6, { life: 0.7, s: s * 0.05, c: i ? P.butter : P.coral });
              p.burst("confetti", mx, my, 6, s * 0.55, { life: 0.9, s: s * 0.045, g: s * 2, drag: 1.5, c: i ? "#d9a45a" : P.coral });
            }
          }
          if (this.once(a, 2, t >= 1.9)) p.spawn("heart", cx + s * 0.2, cy - s * 0.5, { vy: -s * 0.4, vx: s * 0.05, life: 1.3, s: s * 0.07 });
          break;
        }
        case "play": {
          if (this.once(a, 0, t >= 0.3)) h.react("play");
          const seg = BALL_SEGS;
          let acc = 0;
          for (let i = 0; i < seg.length; i++) {
            acc += seg[i]!.d;
            if (this.once(a, 1 + i, t >= acc)) {
              const bx = ballX(t, s, cx);
              p.burst("dot", bx, L.feetY + s * 0.14, 3, s * 0.4, { life: 0.35, s: s * 0.04, c: P.peach });
              p.spawn("note", bx, L.feetY - s * 0.1, { vy: -s * 0.5, vx: (i % 2 ? -1 : 1) * s * 0.15, life: 1.1, s: s * 0.11, c: [P.lagoon, P.coral, P.butter, P.peach][i % 4]! });
            }
          }
          if (this.once(a, 8, t >= 1.6)) h.react("happy");
          break;
        }
        case "clean": {
          if (this.once(a, 0, t >= 0.1)) h.react("clean");
          if (t > 0.3 && t < 2.1 && !h.reduced) {
            const n = Math.random() < dt * 20 ? 1 : 0;
            for (let i = 0; i < n + (Math.random() < dt * 12 ? 1 : 0); i++) {
              p.spawn("bubble", cx + (Math.random() - 0.5) * s * 0.95, cy + (Math.random() - 0.2) * s * 0.55, {
                vy: -s * (0.25 + Math.random() * 0.35), vx: (Math.random() - 0.5) * s * 0.1, life: 1.2 + Math.random() * 0.8, s: s * (0.035 + Math.random() * 0.07),
              });
            }
          }
          if (this.once(a, 1, t >= 2.1)) {
            h.react("happy");
            p.burst("sparkle", cx, cy - s * 0.05, 12, s * 0.9, { life: 0.9, s: s * 0.06, c: P.lagoon });
            p.burst("sparkle", cx, cy - s * 0.05, 8, s * 0.7, { life: 0.9, s: s * 0.05 });
          }
          break;
        }
        case "medicine": {
          if (this.once(a, 0, t >= 1.15)) {
            h.react("medicine");
            p.burst("plus", cx, cy - s * 0.1, 6, s * 0.45, { life: 1.3, s: s * 0.06, vy: -s * 0.3, g: -s * 0.15, c: P.lagoon });
            p.burst("sparkle", cx, cy, 10, s * 0.8, { life: 0.9, s: s * 0.05, c: P.lagoon });
            p.spawn("ring", cx, cy, { life: 0.9, s: s * 0.9, c: P.lagoon });
          }
          break;
        }
        case "scold": {
          if (this.once(a, 0, t >= 0.4)) { h.react("scold"); p.spawn("sweat", cx + s * 0.3, cy - s * 0.4, { vy: -s * 0.3, vx: s * 0.2, g: s * 1.6, life: 0.9, s: s * 0.07 }); }
          if (this.once(a, 1, t >= 0.65)) shake = Math.max(shake, 3);
          if (this.once(a, 2, t >= 1.15)) shake = Math.max(shake, 3);
          if (t > 0.35 && t < 2.0 && Math.random() < dt * 22) {
            p.spawn("rain", cx + (Math.random() - 0.5) * s * 0.7, cy - s * 0.75, { vy: s * 2.4, vx: -s * 0.25, life: 0.55, s: s * 0.03 });
          }
          this.windowDim = window01(t, 0.1, 2.1, 0.4) * 0.35;
          this.dim = window01(t, 0.1, 2.1, 0.4) * 0.16;
          break;
        }
        case "sleep": {
          if (this.once(a, 0, t >= 0.05)) p.spawn("ring", cx, cy, { life: 1.2, s: s * 1.1, c: "#8FA8FF" });
          if (t < 1.2 && Math.random() < dt * 4) p.spawn("zzz", cx + s * 0.32, cy - s * 0.42, { vy: -s * 0.22, vx: s * 0.06, life: 1.9, s: s * 0.15 });
          break;
        }
        case "wake": {
          if (this.once(a, 0, t >= 0.05)) {
            h.react("happy");
            p.burst("sparkle", cx, cy - s * 0.1, 10, s * 0.9, { life: 0.9, s: s * 0.055 });
            p.spawn("ring", cx, cy, { life: 0.9, s: s * 1.2, c: P.butter });
          }
          break;
        }
        case "hatch": {
          if (this.once(a, 0, t >= 0.15)) {
            h.react("hatch");
            for (let i = 0; i < 14; i++) {
              const ang = -Math.PI / 2 + (Math.random() - 0.5) * 3.2, sp = s * (0.9 + Math.random() * 1.3);
              p.spawn("shard", cx + (Math.random() - 0.5) * s * 0.4, cy + s * 0.1, {
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: s * 3.4, life: 1.5, s: s * (0.05 + Math.random() * 0.06),
                rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: Math.random() < 0.5 ? "#F3EEFF" : "#dcd3f5",
              });
            }
            p.burst("star", cx, cy - s * 0.1, 8, s * 1.1, { life: 1.1, s: s * 0.09, g: s * 0.6 });
            p.burst("sparkle", cx, cy - s * 0.1, 14, s * 1.2, { life: 1.0, s: s * 0.07 });
            p.burst("confetti", cx, cy - s * 0.3, 14, s * 1.3, { life: 1.6, s: s * 0.07, g: s * 1.8, drag: 1 });
            p.spawn("ring", cx, cy, { life: 0.8, s: s * 1.6, c: "#ffffff" });
            shake = Math.max(shake, 7);
          }
          if (this.once(a, 1, t >= 0.9)) p.spawn("heart", cx, cy - s * 0.5, { vy: -s * 0.4, life: 1.4, s: s * 0.09 });
          this.silhouette = t < 0.15 ? 1 : 1 - easeOutCubic((t - 0.15) / 1.0);
          this.flash = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.75);
          if (h.reduced) this.flash *= 0.35;
          break;
        }
        case "evolve": {
          const T_FLASH = 1.55;
          const charge = clamp(t / T_FLASH);
          if (t < T_FLASH) {
            this.slow = lerp(1, 0.4, easeInOut(charge * 2));
            this.silhouette = easeInCubic(charge) * 0.95;
            const j = charge * charge * s * 0.012;
            this.jitterX = Math.sin(t * 61) * j; this.jitterY = Math.cos(t * 53) * j;
            this.dim = charge * 0.5;
            shake = Math.max(shake, charge * 2.4);
            if (!h.reduced && Math.random() < dt * (30 + 90 * charge)) {
              const ang = Math.random() * 6.283, R = s * (0.9 + Math.random() * 0.8);
              const px = cx + Math.cos(ang) * R, py = cy + Math.sin(ang) * R * 0.85;
              p.spawn("dot", px, py, { vx: (cx - px) * 1.6, vy: (cy - py) * 1.6, life: 0.62, s: s * 0.035, c: Math.random() < 0.5 ? P.butter : h.hueOf(a.extra.to) });
            }
          }
          if (this.once(a, 0, t >= T_FLASH)) {
            h.react("evolve");
            const col = h.hueOf(a.extra.to);
            p.spawn("ring", cx, cy, { life: 1.1, s: s * 2.6, c: "#ffffff" });
            p.spawn("ring", cx, cy, { life: 1.5, s: s * 3.6, c: col });
            p.spawn("ring", cx, cy, { life: 1.9, s: s * 4.8, c: P.butter });
            p.burst("star", cx, cy, 16, s * 1.5, { life: 1.6, s: s * 0.11, g: s * 0.5, drag: 0.6 });
            p.burst("sparkle", cx, cy, 34, s * 2.0, { life: 1.4, s: s * 0.08, drag: 1.2, c: col });
            p.burst("sparkle", cx, cy, 24, s * 1.5, { life: 1.4, s: s * 0.07, drag: 1.2 });
            p.burst("heart", cx, cy - s * 0.2, 6, s * 0.9, { life: 1.8, s: s * 0.08, g: -s * 0.2, drag: 1 });
            p.burst("confetti", cx, cy - s * 0.2, 22, s * 1.7, { life: 2.2, s: s * 0.07, g: s * 1.6, drag: 1.4 });
            shake = Math.max(shake, 11);
          }
          if (t >= T_FLASH) {
            const u = (t - T_FLASH) / 1.7;
            this.silhouette = 1 - easeOutCubic(u);
            this.dim = 0.5 * (1 - smooth(0, 1, (t - T_FLASH) / 1.4));
            this.slow = lerp(0.5, 1, smooth(0, 1, (t - T_FLASH) / 1.2));
            const pk = Math.max(0, 1 - (t - T_FLASH) / 0.6);
            this.flash = pk;
            shake = Math.max(shake, 8 * Math.max(0, 1 - (t - T_FLASH) / 0.9));
          }
          if (h.reduced) { this.flash *= 0.3; this.slow = 1; }
          break;
        }
        case "die": {
          if (this.once(a, 0, true)) {
            h.react("die");
            shake = Math.max(shake, 8);
            p.spawn("ring", cx, cy, { life: 1.4, s: s * 1.5, c: P.fog });
          }
          this.deathT = t;
          if (!h.reduced && t > 0.4 && t < 4.4 && Math.random() < dt * 8) {
            p.spawn("wisp", cx + (Math.random() - 0.5) * s * 0.4, cy - s * 0.1, { vy: -s * (0.25 + Math.random() * 0.2), life: 2.6, s: s * 0.16, a: 0.7 });
          }
          if (!h.reduced && t > 0.4 && t < 4.6 && Math.random() < dt * 10) {
            p.spawn("sparkle", cx + (Math.random() - 0.5) * s * 1.2, cy - s * 0.6 - Math.random() * s * 0.4, { vy: s * 0.1, life: 1.5, s: s * 0.035, c: P.fog });
          }
          this.slow = lerp(0.55, 1, smooth(0, 1, t / 2.2));
          break;
        }
        case "refuse": {
          if (this.once(a, 0, t >= 0.02)) {
            h.react("refuse");
            p.spawn("steam", cx - s * 0.35, cy - s * 0.3, { vy: -s * 0.3, life: 0.9, s: s * 0.14, a: 0.9 });
            p.spawn("steam", cx + s * 0.35, cy - s * 0.3, { vy: -s * 0.3, life: 0.9, s: s * 0.14, a: 0.9 });
            p.spawn("sweat", cx + s * 0.32, cy - s * 0.32, { vy: -s * 0.2, vx: s * 0.2, g: s * 1.5, life: 0.8, s: s * 0.06 });
          }
          break;
        }
        case "poke": {
          if (this.once(a, 0, true)) {
            p.spawn("ring", cx, cy - s * 0.1, { life: 0.6, s: s * 0.7, c: P.peach });
            p.spawn("heart", cx + (Math.random() - 0.5) * s * 0.4, cy - s * 0.45, { vy: -s * 0.5, vx: (Math.random() - 0.5) * s * 0.3, life: 1.0, s: s * 0.07 });
            p.burst("sparkle", cx, cy - s * 0.15, 4, s * 0.5, { life: 0.6, s: s * 0.04 });
          }
          break;
        }
        case "milestone": {
          if (this.once(a, 0, true)) {
            p.burst("star", cx, cy - s * 0.9, 10, s * 1.1, { life: 1.4, s: s * 0.09, g: s * 1.2, drag: 0.8 });
            p.burst("sparkle", cx, cy - s * 0.9, 16, s * 1.2, { life: 1.1, s: s * 0.06, c: P.butter });
          }
          if (t < 1.4 && Math.random() < dt * 40) {
            p.spawn("confetti", Math.random() * L.W, -10, { vy: s * (0.5 + Math.random() * 0.8), vx: (Math.random() - 0.5) * s * 0.4, life: 2.6, s: s * 0.07, g: s * 0.35, drag: 0.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6 });
          }
          break;
        }
        case "newborn": {
          if (this.once(a, 0, true)) {
            h.react("happy");
            p.burst("heart", cx, cy - s * 0.2, 7, s * 0.9, { life: 1.6, s: s * 0.08, g: -s * 0.3, drag: 1 });
            p.burst("sparkle", cx, cy, 22, s * 1.3, { life: 1.3, s: s * 0.07, drag: 1.3 });
            p.spawn("ring", cx, cy, { life: 1.3, s: s * 2.2, c: P.butter });
          }
          this.flash = Math.max(0, 0.45 * (1 - t / 0.5));
          if (h.reduced) this.flash *= 0.3;
          break;
        }
      }
    }
    if (shake > this.shakeAmp || this.shakeAmp <= 0.05) { this.shakeAmp = shake; this.shakeLeft = 1; }
    else this.shakeAmp = Math.max(shake, this.shakeAmp * Math.exp(-dt * 7));
    this.shakeLeft = this.shakeAmp;
    if (h.reduced) this.shakeAmp = 0;
    this.list = this.list.filter((a) => a.t < a.dur);
  }

  /* ---- drawing ------------------------------------------------------------ */

  /** Behind the creature: light, rays, columns. */
  drawBack(ctx: Ctx, h: FxHost, now: number): void {
    const { L } = h;
    const s = L.size, cx = L.cx, cy = L.cy;
    for (const a of this.list) {
      const t = a.t;
      ctx.save();
      switch (a.name) {
        case "evolve": {
          const charge = clamp(t / 1.55);
          const after = t < 1.55 ? 0 : clamp((t - 1.55) / 2.4);
          const inten = t < 1.55 ? easeInCubic(charge) : 1 - easeInOut(after);
          const col = h.hueOf(a.extra.to);
          ctx.globalCompositeOperation = "lighter";
          const R = Math.max(L.W, L.H) * (0.35 + 0.9 * inten);
          drawGlow(ctx, "#ffffff", cx, cy, R, 0.85 * inten);
          drawGlow(ctx, col, cx, cy, R * 0.7, 0.6 * inten);
          drawGlow(ctx, P.butter, cx, cy, s * 1.3, 0.8 * inten);
          if (!h.reduced) rays(ctx, cx, cy, Math.max(L.W, L.H) * 0.9, 14, now * 0.0004 * (1 + inten * 3), 0.5 * inten, P.butter);
          break;
        }
        case "hatch": {
          const k = window01(t, 0, 1.6, 0.3);
          ctx.globalCompositeOperation = "lighter";
          drawGlow(ctx, "#ffffff", cx, cy, s * 2.2, 0.7 * k);
          drawGlow(ctx, P.peach, cx, cy, s * 3, 0.4 * k);
          if (!h.reduced) rays(ctx, cx, cy, s * 3.2, 12, now * 0.0006, 0.5 * k, P.butter);
          break;
        }
        case "newborn": {
          const k = window01(t, 0, a.dur, 0.6);
          ctx.globalCompositeOperation = "lighter";
          drawGlow(ctx, P.butter, cx, cy, s * 2.4, 0.5 * k);
          drawGlow(ctx, P.peach, cx, cy, s * 3.2, 0.25 * k);
          if (!h.reduced) rays(ctx, cx, cy, s * 3.6, 16, now * 0.0004, 0.42 * k, P.butter);
          break;
        }
        case "wake": {
          const k = window01(t, 0, a.dur, 0.4);
          ctx.globalCompositeOperation = "lighter";
          drawGlow(ctx, P.butter, cx, cy, s * 1.8, 0.5 * k);
          if (!h.reduced) rays(ctx, cx, cy, s * 2.6, 10, now * 0.0005, 0.35 * k, P.butter);
          break;
        }
        case "sleep": {
          const k = window01(t, 0, a.dur, 0.5);
          ctx.globalCompositeOperation = "lighter";
          drawGlow(ctx, "#8FA8FF", cx, cy, s * 1.6, 0.35 * k);
          break;
        }
        case "die": {
          const k = window01(t, 0.2, 4.6, 1.2);
          // pale column of light from above
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createLinearGradient(0, 0, 0, L.feetY);
          g.addColorStop(0, "rgba(236,233,255,0)"); g.addColorStop(0.5, `rgba(236,233,255,${(0.18 * k).toFixed(3)})`); g.addColorStop(1, `rgba(236,233,255,${(0.32 * k).toFixed(3)})`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(cx - s * 0.32, 0); ctx.lineTo(cx + s * 0.32, 0); ctx.lineTo(cx + s * 0.78, L.feetY + s * 0.1); ctx.lineTo(cx - s * 0.78, L.feetY + s * 0.1);
          ctx.closePath(); ctx.fill();
          break;
        }
        case "milestone": {
          const k = window01(t, 0, a.dur, 0.5);
          ctx.globalCompositeOperation = "lighter";
          const sweep = clamp(t / 1.6);
          const x = lerp(-L.W * 0.3, L.W * 1.3, easeInOut(sweep));
          const g = ctx.createLinearGradient(x - L.W * 0.2, 0, x + L.W * 0.2, 0);
          g.addColorStop(0, "rgba(255,229,143,0)"); g.addColorStop(0.5, `rgba(255,229,143,${(0.16 * k).toFixed(3)})`); g.addColorStop(1, "rgba(255,229,143,0)");
          ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
          break;
        }
        default: break;
      }
      ctx.restore();
    }
  }

  /** In front of the creature: props, hands, clouds. */
  drawFront(ctx: Ctx, h: FxHost, now: number): void {
    const { L } = h;
    const s = L.size, cx = L.cx, cy = L.cy;
    for (const a of this.list) {
      const t = a.t;
      ctx.save();
      switch (a.name) {
        case "feed": {
          for (let i = 0; i < 2; i++) {
            const d = i * 0.6, u = (t - d) / 0.85;
            if (u < 0 || u >= 1) continue;
            const e = easeInCubic(u) * 0.5 + u * 0.5;
            const sx = cx + (i ? -1 : 1) * s * 0.95, sy = cy - s * 1.0;
            const mx = cx, my = cy + s * 0.1;
            const x = lerp(sx, mx, e), y = lerp(sy, my, e) - Math.sin(Math.PI * u) * s * 0.22;
            const r = s * 0.085 * (1 - 0.45 * e);
            ctx.save();
            ctx.globalAlpha = Math.min(1, u * 8) * (1 - smooth(0.85, 1, u));
            ctx.translate(x, y);
            ctx.rotate(u * (i ? -5 : 5));
            if (i === 0) berry(ctx, r); else cookie(ctx, r);
            ctx.restore();
          }
          break;
        }
        case "play": {
          const dur = 2.0;
          if (t <= dur + 0.6) {
            const g = ballPos(t, s, cx, L.feetY);
            const fade = t < dur ? 1 : 1 - (t - dur) / 0.6;
            ctx.globalAlpha = fade;
            // shadow on floor
            ctx.fillStyle = `rgba(58,30,60,${(0.3 - 0.2 * g.h / (s * 1.1)).toFixed(3)})`;
            ctx.beginPath(); ctx.ellipse(g.x, g.gy + s * 0.11, s * 0.1 * (1 - 0.3 * g.h / s), s * 0.026, 0, 0, 6.3); ctx.fill();
            ctx.translate(g.x, g.y);
            ctx.rotate(g.x * 0.03);
            const sq = 1 - Math.max(0, 1 - g.h / (s * 0.04)) * 0.18;
            ctx.scale(1 / sq, sq);
            ball(ctx, s * 0.11);
          }
          break;
        }
        case "clean": {
          const k = window01(t, 0.05, 2.25, 0.25);
          if (k > 0.01) {
            const sx = cx + Math.sin(t * 8.2) * s * 0.3;
            const sy = cy - s * 0.05 + Math.sin(t * 4.1) * s * 0.14;
            ctx.globalAlpha = k;
            ctx.translate(sx, sy);
            ctx.rotate(Math.sin(t * 8.2 + 1.2) * 0.35 - 0.1);
            sponge(ctx, s * 0.2);
          }
          break;
        }
        case "medicine": {
          const u = clamp((t - 0.2) / 0.95);
          if (t > 0.05 && t < 1.2) {
            const e = easeInOut(u);
            const sx = cx - s * 0.85, sy = cy - s * 0.85;
            const x = lerp(sx, cx, e), y = lerp(sy, cy + s * 0.08, e) - Math.sin(Math.PI * e) * s * 0.18;
            ctx.globalAlpha = Math.min(1, t * 8) * (1 - smooth(0.9, 1, u));
            ctx.globalCompositeOperation = "lighter";
            drawGlow(ctx, P.lagoon, x, y, s * 0.35, 0.55 + Math.sin(now * 0.02) * 0.1);
            ctx.globalCompositeOperation = "source-over";
            ctx.translate(x, y);
            ctx.rotate(-0.6 + e * 5.5);
            ctx.scale(1 - 0.35 * e, 1 - 0.35 * e);
            pill(ctx, s * 0.1);
          }
          break;
        }
        case "scold": {
          const cin = easeOutBack(t / 0.4), cout = 1 - smooth(1.9, 2.4, t);
          const k = cin * cout;
          if (k > 0.01) {
            const x = cx, y = cy - s * 1.0 + Math.sin(now * 0.004) * s * 0.012;
            ctx.save();
            ctx.translate(x, y); ctx.scale(k, k);
            stormCloud(ctx, s * 0.5, now);
            ctx.restore();
            for (const bt of [0.65, 1.15]) {
              const u = (t - bt) / 0.22;
              if (u > 0 && u < 1) {
                ctx.globalCompositeOperation = "lighter";
                drawGlow(ctx, P.butter, x, y + s * 0.3, s * 0.9, (1 - u) * 0.9);
                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = 1 - u * 0.4;
                bolt(ctx, x - s * 0.02, y + s * 0.14, s * 0.55);
              }
            }
          }
          const wk = smooth(0.25, 0.6, t) * (1 - smooth(1.8, 2.3, t));
          if (wk > 0.01) {
            const off = (1 - easeOutCubic(clamp((t - 0.25) / 0.4))) * s * 0.6;
            const wag = t > 0.5 ? Math.sin((t - 0.5) * 17) * 0.42 * (1 - smooth(1.5, 1.85, t)) : 0;
            ctx.globalAlpha = wk;
            ctx.translate(cx + s * 0.95 + off, cy + s * 0.32);
            ctx.rotate(wag - 0.12);
            finger(ctx, s * 0.55);
          }
          break;
        }
        case "sleep": {
          const k = window01(t, 0, a.dur, 0.35);
          if (k > 0.01) {
            ctx.globalAlpha = k;
            ctx.translate(cx - s * 0.66, cy - s * 0.66 - (1 - k) * s * 0.1);
            ctx.rotate(-0.2);
            moon(ctx, s * 0.17);
          }
          break;
        }
        case "refuse": {
          const k = easeOutBack(t / 0.25) * (1 - smooth(0.8, 1.1, t));
          if (k > 0.01) {
            ctx.translate(cx, cy - s * 0.72);
            ctx.rotate(Math.sin(t * 34) * 0.12 * (1 - t));
            ctx.scale(k, k);
            const r = s * 0.13;
            ctx.shadowColor = "rgba(27,22,56,0.4)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.fillStyle = P.coral; ctx.fill();
            ctx.shadowColor = "transparent";
            ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.24; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.4); ctx.lineTo(r * 0.4, r * 0.4); ctx.moveTo(r * 0.4, -r * 0.4); ctx.lineTo(-r * 0.4, r * 0.4); ctx.stroke();
          }
          break;
        }
        case "die": {
          const k = easeOutCubic(clamp((t - 0.6) / 1.6));
          if (k > 0.01) drawCandle(ctx, cx + s * 0.86, L.feetY + s * 0.06, s, k, now);
          break;
        }
        default: break;
      }
      ctx.restore();
    }
  }

  /** Full-screen overlay (white flash) drawn after grading; returns nothing. */
  drawFlash(ctx: Ctx, L: Layout): void {
    if (this.flash <= 0.01) return;
    ctx.fillStyle = `rgba(255,252,240,${clamp(this.flash).toFixed(3)})`;
    ctx.fillRect(-L.M, -L.M, L.W + L.M * 2, L.H + L.M * 2);
  }
}

/* ---- ball path ------------------------------------------------------------ */

const BALL_SEGS = [{ d: 0.62, h: 1.05 }, { d: 0.5, h: 0.55 }, { d: 0.4, h: 0.26 }, { d: 0.3, h: 0.1 }];
function ballX(t: number, s: number, cx: number): number {
  const u = clamp(t / 2.0);
  return cx + s * (-1.25 + 2.1 * u) + (t > 2 ? (t - 2) * s * 1.1 : 0);
}
function ballPos(t: number, s: number, cx: number, feetY: number): { x: number; y: number; h: number; gy: number } {
  const gy = feetY + s * 0.02;
  let acc = 0, hh = 0;
  if (t < 2.0) {
    for (const seg of BALL_SEGS) {
      if (t < acc + seg.d) { const f = (t - acc) / seg.d; hh = seg.h * s * (1 - Math.pow(2 * f - 1, 2)); break; }
      acc += seg.d;
    }
  }
  return { x: ballX(t, s, cx), y: gy - hh, h: hh, gy };
}

/* ---- small illustrated props (origin-centred) ------------------------------- */

function berry(ctx: Ctx, r: number): void {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#ff9fb0"); g.addColorStop(0.6, P.coral); g.addColorStop(1, "#c93c5c");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.fill();
  ctx.fillStyle = "#38D6B8";
  ctx.beginPath(); ctx.ellipse(r * 0.15, -r * 1.02, r * 0.4, r * 0.18, -0.5, 0, 6.3); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.35, r * 0.2, r * 0.12, -0.7, 0, 6.3); ctx.fill();
}
function cookie(ctx: Ctx, r: number): void {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#ffe9a8"); g.addColorStop(1, "#e8b45a");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.fill();
  ctx.fillStyle = "#7a4a3a";
  for (const [x, y] of [[-0.35, -0.2], [0.3, -0.35], [0.1, 0.35], [-0.2, 0.4], [0.45, 0.15]] as const) { ctx.beginPath(); ctx.arc(x * r, y * r, r * 0.13, 0, 6.3); ctx.fill(); }
}
function ball(ctx: Ctx, r: number): void {
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.fillStyle = P.coral; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = P.butter; ctx.fillRect(-r, -r * 0.28, r * 2, r * 0.56);
  ctx.fillStyle = P.lagoon; ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, 6.3); ctx.fill();
  const sh = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  sh.addColorStop(0, "rgba(255,255,255,0.4)"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(58,42,107,0.35)");
  ctx.fillStyle = sh; ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}
function sponge(ctx: Ctx, r: number): void {
  ctx.shadowColor = "rgba(27,22,56,0.35)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
  rrect(ctx, -r * 1.3, -r * 0.8, r * 2.6, r * 1.6, r * 0.5); ctx.fillStyle = "#38D6B8"; ctx.fill();
  ctx.shadowColor = "transparent";
  rrect(ctx, -r * 1.3, -r * 0.8, r * 2.6, r * 1.1, r * 0.5); ctx.fillStyle = "#ffd75e"; ctx.fill();
  ctx.fillStyle = "rgba(180,120,30,0.35)";
  for (const [x, y, rr] of [[-0.7, -0.35, 0.16], [0.1, -0.2, 0.12], [0.75, -0.42, 0.14], [-0.15, 0.05, 0.1], [0.5, 0.1, 0.09]] as const) { ctx.beginPath(); ctx.arc(x * r, y * r, rr * r, 0, 6.3); ctx.fill(); }
  ctx.fillStyle = "rgba(255,255,255,0.5)"; rrect(ctx, -r * 1.1, -r * 0.7, r * 1.2, r * 0.16, r * 0.08); ctx.fill();
}
function pill(ctx: Ctx, r: number): void {
  ctx.shadowColor = "rgba(27,22,56,0.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  rrect(ctx, -r * 1.7, -r * 0.8, r * 3.4, r * 1.6, r * 0.8); ctx.fillStyle = "#fbf9ff"; ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save(); rrect(ctx, -r * 1.7, -r * 0.8, r * 3.4, r * 1.6, r * 0.8); ctx.clip();
  ctx.fillStyle = P.coral; ctx.fillRect(-r * 1.8, -r, r * 1.8, r * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-r * 1.6, -r * 0.55, r * 3.2, r * 0.3);
  ctx.restore();
}
function moon(ctx: Ctx, r: number): void {
  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, "#8FA8FF", 0, 0, r * 3, 0.5);
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.35, Math.PI * 1.65, false);
  ctx.bezierCurveTo(r * 0.1, -r * 0.6, r * 0.1, r * 0.6, Math.cos(Math.PI * 0.35) * r, Math.sin(Math.PI * 0.35) * r);
  ctx.fillStyle = "#f4f1ff"; ctx.fill();
}
function stormCloud(ctx: Ctx, r: number, now: number): void {
  const g = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.4);
  g.addColorStop(0, "#6a5aa5"); g.addColorStop(1, "#2f2360");
  ctx.shadowColor = "rgba(27,22,56,0.5)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(-r * 0.55, 0, r * 0.32, 0, 6.3);
  ctx.arc(-r * 0.2, -r * 0.22, r * 0.4, 0, 6.3);
  ctx.arc(r * 0.24, -r * 0.16, r * 0.36, 0, 6.3);
  ctx.arc(r * 0.6, 0.02 * r, r * 0.3, 0, 6.3);
  ctx.rect(-r * 0.55, -r * 0.1, r * 1.15, r * 0.34);
  ctx.fill();
  ctx.shadowColor = "transparent";
  // cross little brows + eyes
  ctx.strokeStyle = "#ffe58f"; ctx.lineWidth = r * 0.06; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-r * 0.36, -r * 0.14); ctx.lineTo(-r * 0.12, -r * 0.05); ctx.moveTo(r * 0.36, -r * 0.14); ctx.lineTo(r * 0.12, -r * 0.05); ctx.stroke();
  ctx.fillStyle = "#ffe58f";
  ctx.beginPath(); ctx.arc(-r * 0.24, r * 0.04, r * 0.05, 0, 6.3); ctx.arc(r * 0.24, r * 0.04, r * 0.05, 0, 6.3); ctx.fill();
  const flick = Math.sin(now * 0.02) * 0.5 + 0.5;
  ctx.fillStyle = `rgba(255,229,143,${(0.15 + flick * 0.1).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.7, 0, 6.3); ctx.fill();
}
function bolt(ctx: Ctx, x: number, y: number, len: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-len * 0.14, len * 0.28); ctx.lineTo(len * 0.02, len * 0.28); ctx.lineTo(-len * 0.12, len * 0.6);
  ctx.lineTo(len * 0.12, len * 0.24); ctx.lineTo(-len * 0.03, len * 0.24); ctx.lineTo(len * 0.1, 0);
  ctx.closePath();
  ctx.fillStyle = "#fff6c2"; ctx.fill();
  ctx.restore();
}
function finger(ctx: Ctx, h: number): void {
  // a wagging index finger, pivoting at the wrist (origin); hand points up
  const skin = "#ffcfae", edge = "#e0a07a";
  ctx.shadowColor = "rgba(27,22,56,0.35)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 6;
  // cuff
  rrect(ctx, -h * 0.2, h * 0.3, h * 0.4, h * 0.28, h * 0.06); ctx.fillStyle = "#ecE9ff"; ctx.fill();
  ctx.shadowColor = "transparent";
  // fist
  rrect(ctx, -h * 0.2, -h * 0.02, h * 0.4, h * 0.36, h * 0.13); ctx.fillStyle = skin; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = h * 0.015; ctx.stroke();
  // curled fingers
  for (let i = 0; i < 3; i++) {
    rrect(ctx, -h * 0.19 + i * h * 0.13, h * 0.16 + (i === 1 ? -h * 0.005 : 0), h * 0.12, h * 0.15, h * 0.06);
    ctx.fillStyle = "#ffd9bd"; ctx.fill(); ctx.stroke();
  }
  // thumb
  rrect(ctx, -h * 0.3, h * 0.05, h * 0.16, h * 0.2, h * 0.08); ctx.fillStyle = skin; ctx.fill(); ctx.stroke();
  // index
  rrect(ctx, -h * 0.065, -h * 0.66, h * 0.13, h * 0.75, h * 0.065); ctx.fillStyle = skin; ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.4)"; rrect(ctx, -h * 0.04, -h * 0.6, h * 0.03, h * 0.5, h * 0.015); ctx.fill();
}

export function drawCandle(ctx: Ctx, x: number, y: number, s: number, k: number, now: number): void {
  const h = s * 0.32 * k;
  ctx.save();
  ctx.globalAlpha = clamp(k * 1.5);
  // soft pool of light
  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, P.peach, x, y - h, s * 0.75, 0.55 * k);
  drawGlow(ctx, P.butter, x, y - h, s * 0.28, 0.6 * k);
  ctx.globalCompositeOperation = "source-over";
  // dish
  ctx.fillStyle = "rgba(58,30,60,0.35)"; ctx.beginPath(); ctx.ellipse(x, y + s * 0.02, s * 0.14, s * 0.04, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = "#e9c9a6"; ctx.beginPath(); ctx.ellipse(x, y, s * 0.12, s * 0.035, 0, 0, 6.3); ctx.fill();
  // wax
  const w = s * 0.055;
  rrect(ctx, x - w, y - h, w * 2, h, w * 0.5); ctx.fillStyle = "#fff4e2"; ctx.fill();
  ctx.fillStyle = "rgba(255,181,138,0.4)"; ctx.fillRect(x + w * 0.35, y - h + 2, w * 0.65, h - 2);
  // flame
  const fl = 1 + Math.sin(now * 0.017) * 0.08 + Math.sin(now * 0.031) * 0.05;
  const fx = x + Math.sin(now * 0.009) * s * 0.006, fy = y - h - s * 0.005;
  ctx.beginPath();
  ctx.moveTo(fx, fy - s * 0.15 * fl);
  ctx.bezierCurveTo(fx + s * 0.06, fy - s * 0.07, fx + s * 0.05, fy, fx, fy);
  ctx.bezierCurveTo(fx - s * 0.05, fy, fx - s * 0.06, fy - s * 0.07, fx, fy - s * 0.15 * fl);
  ctx.fillStyle = P.butter; ctx.fill();
  ctx.beginPath(); ctx.ellipse(fx, fy - s * 0.035, s * 0.018, s * 0.035, 0, 0, 6.3); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();
}

function rays(ctx: Ctx, x: number, y: number, R: number, n: number, rot: number, a: number, col: string): void {
  if (a <= 0.005) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  const c = hex(col);
  g.addColorStop(0, css(c, a)); g.addColorStop(1, css(c, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const ang = rot + (i / n) * Math.PI * 2, w = (Math.PI / n) * 0.42;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang - w) * R, y + Math.sin(ang - w) * R);
    ctx.lineTo(x + Math.cos(ang + w) * R, y + Math.sin(ang + w) * R);
    ctx.closePath();
  }
  ctx.fill();
}
