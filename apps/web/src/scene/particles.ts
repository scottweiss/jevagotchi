/** Pooled particle system. No allocation during play; capped. */
import { FONT, P, clamp, drawGlow, heartPath, star4, star5, hex, css } from "./util.js";

export type PKind =
  | "sparkle" | "heart" | "sweat" | "zzz" | "steam" | "note" | "star"
  | "bubble" | "mote" | "shard" | "confetti" | "rain" | "dot" | "ring" | "wisp" | "plus";

export interface PSpawn {
  vx?: number; vy?: number; g?: number; drag?: number;
  life?: number; s?: number; rot?: number; vr?: number; c?: string; a?: number;
}

interface Part {
  on: boolean; k: PKind; x: number; y: number; vx: number; vy: number; g: number; drag: number;
  t: number; life: number; s: number; rot: number; vr: number; c: string; a: number; seed: number;
}

const ADDITIVE: ReadonlySet<PKind> = new Set<PKind>(["sparkle", "dot", "ring", "mote"]);
const DEFAULT_COL: Record<PKind, string> = {
  sparkle: P.butter, heart: P.coral, sweat: "#9fd8ff", zzz: P.fog, steam: P.fog, note: P.lagoon,
  star: P.butter, bubble: P.fog, mote: P.butter, shard: "#F3EEFF", confetti: P.peach, rain: "#9fc4ff",
  dot: P.butter, ring: P.butter, wisp: P.fog, plus: P.lagoon,
};
const CONFETTI = [P.coral, P.butter, P.lagoon, P.peach, "#8FA8FF", "#FF8FC7", "#B36BFF"];

export class Particles {
  private pool: Part[] = [];
  private cursor = 0;
  reduced = false;
  constructor(private cap = 360) {
    for (let i = 0; i < cap; i++) {
      this.pool.push({ on: false, k: "dot", x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, t: 0, life: 1, s: 1, rot: 0, vr: 0, c: "#fff", a: 1, seed: 0 });
    }
  }

  get count(): number { let n = 0; for (const p of this.pool) if (p.on) n++; return n; }

  spawn(k: PKind, x: number, y: number, o: PSpawn = {}): void {
    // Reduced motion: keep only calm, low-count feedback.
    if (this.reduced && k !== "sparkle" && k !== "heart" && k !== "zzz" && k !== "star") return;
    let p: Part | undefined;
    for (let i = 0; i < this.cap; i++) {
      const c = this.pool[(this.cursor + i) % this.cap]!;
      if (!c.on) { p = c; this.cursor = (this.cursor + i + 1) % this.cap; break; }
    }
    if (!p) { p = this.pool[this.cursor]!; this.cursor = (this.cursor + 1) % this.cap; }
    p.on = true; p.k = k; p.x = x; p.y = y;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.g = o.g ?? 0; p.drag = o.drag ?? 0;
    p.t = 0; p.life = o.life ?? 1.2; p.s = o.s ?? 8; p.rot = o.rot ?? 0; p.vr = o.vr ?? 0;
    p.c = o.c ?? DEFAULT_COL[k]; p.a = o.a ?? 1; p.seed = Math.random() * 100;
    if (k === "confetti" && !o.c) p.c = CONFETTI[(Math.random() * CONFETTI.length) | 0]!;
  }

  /** Spawn a radial burst of `n` particles. */
  burst(k: PKind, x: number, y: number, n: number, speed: number, o: PSpawn = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.75);
      this.spawn(k, x, y, {
        ...o, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: (o.life ?? 1) * (0.7 + Math.random() * 0.6), s: (o.s ?? 6) * (0.7 + Math.random() * 0.6),
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 8,
      });
    }
  }

  clear(): void { for (const p of this.pool) p.on = false; }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) { p.on = false; continue; }
      p.vy += p.g * dt;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, additive: boolean): void {
    for (const p of this.pool) {
      if (!p.on || ADDITIVE.has(p.k) !== additive) continue;
      const u = p.t / p.life;
      const fade = Math.min(1, u * 6) * Math.min(1, (1 - u) * 3.2) * p.a;
      if (fade <= 0.01) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      this.one(ctx, p, u, fade);
      ctx.restore();
    }
  }

  private one(ctx: CanvasRenderingContext2D, p: Part, u: number, fade: number): void {
    const s = p.s;
    switch (p.k) {
      case "sparkle": {
        const tw = 0.6 + 0.4 * Math.sin(p.t * 18 + p.seed);
        drawGlow(ctx, p.c, 0, 0, s * 2.4, fade * 0.5);
        ctx.rotate(p.rot);
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#fffbe8";
        star4(ctx, s * (0.6 + 0.6 * Math.sin(Math.PI * u)) * tw + s * 0.25);
        ctx.fill();
        break;
      }
      case "dot":
        drawGlow(ctx, p.c, 0, 0, s * 2, fade);
        break;
      case "mote":
        drawGlow(ctx, p.c, 0, 0, s * 2.2, fade * 0.7);
        break;
      case "ring": {
        ctx.globalAlpha = fade * (1 - u) * 0.9;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = Math.max(1.5, Math.min(14, s * 0.03) * (1 - u));
        ctx.beginPath();
        ctx.arc(0, 0, s * (0.15 + 0.85 * (1 - Math.pow(1 - u, 3))), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "heart": {
        const sc = 0.55 + 0.45 * Math.min(1, u * 5) + Math.sin(p.t * 9) * 0.06;
        ctx.globalAlpha = fade;
        ctx.rotate(Math.sin(p.t * 3 + p.seed) * 0.25);
        heartPath(ctx, s * sc);
        ctx.fillStyle = p.c;
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(-s * 0.4 * sc, -s * 0.28 * sc, s * 0.2 * sc, s * 0.11 * sc, -0.6, 0, 6.3);
        ctx.fill();
        break;
      }
      case "sweat": {
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.2, -s * 0.4, s * 0.72, -s * 0.05, s * 0.72, s * 0.32);
        ctx.arc(0, s * 0.32, s * 0.72, 0, Math.PI);
        ctx.bezierCurveTo(-s * 0.72, -s * 0.05, -s * 0.2, -s * 0.4, 0, -s);
        ctx.fillStyle = p.c;
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.ellipse(-s * 0.25, s * 0.15, s * 0.12, s * 0.22, 0.3, 0, 6.3);
        ctx.fill();
        break;
      }
      case "zzz": {
        ctx.globalAlpha = fade;
        ctx.rotate(Math.sin(p.t * 2 + p.seed) * 0.2 - 0.12);
        const sc = 0.6 + 0.6 * Math.min(1, u * 1.5);
        ctx.font = `800 ${s * sc}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2, s * 0.22);
        ctx.strokeStyle = "rgba(58,42,107,0.75)";
        ctx.strokeText("z", 0, 0);
        ctx.fillStyle = p.c;
        ctx.fillText("z", 0, 0);
        break;
      }
      case "steam": {
        const r = s * (0.7 + u * 1.3);
        drawGlow(ctx, p.c, 0, 0, r, fade * 0.42);
        break;
      }
      case "note": {
        ctx.globalAlpha = fade;
        ctx.rotate(Math.sin(p.t * 4 + p.seed) * 0.3);
        ctx.fillStyle = p.c;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = s * 0.16;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.ellipse(0, s * 0.5, s * 0.36, s * 0.27, -0.4, 0, 6.3);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.3, s * 0.42);
        ctx.lineTo(s * 0.3, -s * 0.7);
        ctx.quadraticCurveTo(s * 0.35, -s * 0.35, s * 0.72, -s * 0.28);
        ctx.stroke();
        break;
      }
      case "star": {
        ctx.globalAlpha = fade;
        ctx.rotate(p.rot);
        star5(ctx, s * (0.5 + 0.5 * Math.min(1, u * 6)));
        ctx.fillStyle = p.c;
        ctx.fill();
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = s * 0.12;
        ctx.stroke();
        break;
      }
      case "bubble": {
        const wob = Math.sin(p.t * 3 + p.seed) * s * 0.18;
        ctx.translate(wob, 0);
        ctx.globalAlpha = fade;
        const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.05, 0, 0, s);
        g.addColorStop(0, "rgba(255,255,255,0.35)");
        g.addColorStop(0.7, "rgba(190,235,255,0.10)");
        g.addColorStop(1, "rgba(160,220,255,0.28)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = "rgba(236,233,255,0.85)";
        ctx.lineWidth = Math.max(1, s * 0.09);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = Math.max(1.2, s * 0.14);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.68, Math.PI * 1.1, Math.PI * 1.42);
        ctx.stroke();
        break;
      }
      case "shard": {
        ctx.globalAlpha = fade;
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(-s, s * 0.5);
        ctx.lineTo(0, -s);
        ctx.lineTo(s * 0.9, s * 0.35);
        ctx.closePath();
        ctx.fillStyle = p.c;
        ctx.fill();
        ctx.fillStyle = "rgba(58,42,107,0.18)";
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, s * 0.35); ctx.lineTo(s * 0.1, s * 0.4);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "confetti": {
        ctx.globalAlpha = fade;
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.t * 7 + p.seed));
        ctx.fillStyle = p.c;
        ctx.fillRect(-s * 0.5, -s * 0.28, s, s * 0.56);
        break;
      }
      case "rain": {
        ctx.globalAlpha = fade * 0.85;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = Math.max(1.2, s * 0.14);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-p.vx * 0.03, -p.vy * 0.03);
        ctx.stroke();
        break;
      }
      case "wisp": {
        const r = s * (0.8 + u * 0.8);
        ctx.translate(Math.sin(p.t * 2.2 + p.seed) * s * 0.6, 0);
        drawGlow(ctx, p.c, 0, 0, r, fade * 0.5);
        break;
      }
      case "plus": {
        ctx.globalAlpha = fade;
        ctx.rotate(Math.sin(p.t * 3 + p.seed) * 0.2);
        ctx.fillStyle = p.c;
        const w = s * 0.34;
        ctx.beginPath();
        ctx.roundRect(-s, -w, s * 2, w * 2, w * 0.7);
        ctx.roundRect(-w, -s, w * 2, s * 2, w * 0.7);
        ctx.fill();
        break;
      }
    }
  }
}

/** Convenience: a colour with alpha from a palette hex. */
export const tint = (h: string, a: number): string => css(hex(h), clamp(a));
