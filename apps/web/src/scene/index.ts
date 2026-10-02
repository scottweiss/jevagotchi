/**
 * Jevagotchi world: a cozy lit-from-within diorama drawn on one canvas.
 * Public API is `Stage`; everything else in this folder is internal.
 */
import type { CreatureParams, CreatureReaction, CreatureView, SceneFrame } from "../contracts.js";
import { createCreature } from "../creatures/index.js";
import { Bubbles } from "./bubbles.js";
import { Decor } from "./decor.js";
import { FxManager, drawCandle, type FxHost, type FxName } from "./fx.js";
import { Particles } from "./particles.js";
import { bakeAll, bakeShaft, computeLayout, drawSky, type Layers, type Layout } from "./room.js";
import { makeSky, skyAt } from "./sky.js";
import { WeatherFx } from "./weather.js";
import { weatherAt, type Weather } from "@jevagotchi/core";
import { P, SPECIES_HUE, clamp, css, drawGlow, easeOutCubic, ellipse, hex, lerp, mix, mulberry, smooth, type RGB } from "./util.js";

type Ctx = CanvasRenderingContext2D;
type Fx = "feed" | "play" | "clean" | "medicine" | "scold" | "sleep" | "wake" | "hatch" | "evolve" | "die" | "refuse" | "poke" | "milestone" | "newborn";

const MAX_DPR = 2;
const DARK_TINT = hex("#6a66ac");

interface Firefly { bx: number; by: number; ax: number; ay: number; f1: number; f2: number; ph: number; hue: string }
interface Mote { a: number; sp: number; ph: number; wob: number }

export class Stage {
  onTapMess?: (index: number) => void;
  onCreatureTap?: () => void;
  /** Thunder is due now (intensity 0-1): connect to audio.thunder(). */
  onThunder?: (intensity: number) => void;

  private readonly ctx: Ctx;
  private readonly creature: CreatureView = createCreature();
  private readonly particles = new Particles(380);
  private readonly fx = new FxManager();
  private readonly decor = new Decor();
  private readonly bubbles = new Bubbles();
  private readonly sky = makeSky();
  private readonly wfx = new WeatherFx();
  private wxDate: { at: number; w: Weather } | null = null;
  private readonly params: CreatureParams;
  private L: Layout;
  private layers: Layers | null = null;
  private shaftKey = -1;
  private shaftDx = 0;
  private dirty = true;
  private lastNow = -1;
  private time = 0;
  private dark = 0;
  private death = 0;
  private par = { x: 0, y: 0 };
  private pointer: { x: number; y: number } | null = null;
  private frame: SceneFrame | null = null;
  private reducedMq: MediaQueryList | null;
  private reduced = false;
  private ro: ResizeObserver | null = null;
  private cc: HTMLCanvasElement = document.createElement("canvas");
  private ccx: CanvasRenderingContext2D = this.cc.getContext("2d")!;
  private emitOff = { x: 0, y: 0 };
  private fireflies: Firefly[] = [];
  private motes: Mote[] = [];
  private lift = 0;
  private hovering = false;
  private readonly rnd = mulberry(77);
  private maxDpr = MAX_DPR;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "manipulation";
    this.L = computeLayout(Math.max(1, canvas.clientWidth || 360), Math.max(1, canvas.clientHeight || 640), 1);
    this.params = {
      species: "blobule", stage: "baby", mood: "content", asleep: false, sick: false, hunger: 20, energy: 80, hygiene: 80,
      urgency: 0, want: "nothing", hesitant: false, gaze: null, hueShift: 0.5,
    };
    this.reducedMq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.reduced = !!this.reducedMq?.matches;
    this.reducedMq?.addEventListener?.("change", () => { this.reduced = !!this.reducedMq?.matches; });

    const r = mulberry(31);
    for (let i = 0; i < 11; i++) this.fireflies.push({ bx: r(), by: r(), ax: 0.03 + r() * 0.07, ay: 0.02 + r() * 0.05, f1: 0.15 + r() * 0.3, f2: 0.6 + r() * 1.2, ph: r() * 6.3, hue: r() < 0.7 ? "#DFFF8A" : P.butter });
    for (let i = 0; i < 26; i++) this.motes.push({ a: r(), sp: 0.02 + r() * 0.04, ph: r(), wob: r() * 6.3 });

    this.wfx.onThunder = (i) => { this.onThunder?.(i); };
    this.wfx.onStrike = () => {
      if (this.params.asleep || this.rnd() > 0.5) return;
      this.particles.spawn("sweat", this.L.cx + this.L.size * 0.25, this.L.cy - this.L.size * 0.3, EMIT_MOTION("sweat", this.L.size));
    };
    this.creature.onEmit = (e) => {
      const s = this.L.size;
      this.particles.spawn(e.kind, e.x + this.emitOff.x, e.y + this.emitOff.y, EMIT_MOTION(e.kind, s));
    };

    const parent = canvas.parentElement ?? canvas;
    if (typeof ResizeObserver === "function") {
      this.ro = new ResizeObserver(() => { this.dirty = true; });
      this.ro.observe(parent);
      if (parent !== canvas) this.ro.observe(canvas);
    }
    canvas.addEventListener("pointermove", (e) => {
      const p = this.local(e); this.pointer = p;
      const hit = this.hitMess(p.x, p.y) >= 0 || this.creatureHit(p.x, p.y);
      if (hit !== this.hovering) { this.hovering = hit; canvas.style.cursor = hit ? "pointer" : ""; }
    });
    canvas.addEventListener("pointerleave", () => { this.pointer = null; });
    canvas.addEventListener("pointercancel", () => { this.pointer = null; });
    canvas.addEventListener("pointerdown", (e) => {
      const p = this.local(e);
      if (e.pointerType !== "mouse") this.pointer = p;
      this.poke(p.x, p.y);
    });
    canvas.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") this.pointer = null; });
  }

  /* ---- public API -------------------------------------------------------- */

  setPointer(p: { x: number; y: number } | null): void { this.pointer = p; }

  /** Current backing-store scale cap, and a way to lower it when frames run long. Never raised again (no flapping). */
  get renderScale(): number { return Math.min(window.devicePixelRatio || 1, this.maxDpr); }
  lowerRenderScale(): boolean {
    const next = this.maxDpr > 1.5 ? 1.5 : this.maxDpr > 1 ? 1 : 1;
    if (next >= this.maxDpr) return false;
    this.maxDpr = next; this.dirty = true;
    return true;
  }

  /** Current (target) weather, for audio: kind, intensity, wind. */
  get weather(): Weather { return this.wfx.now; }
  /** Trigger a lightning strike (dev). */
  strike(): void { this.wfx.strike(); }

  poke(x: number, y: number): boolean {
    const mi = this.hitMess(x, y);
    if (mi >= 0) {
      const m = this.messSlot(mi);
      this.particles.burst("sparkle", m.x, m.y - 6, 8, this.L.size * 0.6, { life: 0.7, s: this.L.size * 0.045, c: P.lagoon });
      this.particles.burst("bubble", m.x, m.y - 6, 4, this.L.size * 0.4, { life: 1, s: this.L.size * 0.05, g: -this.L.size * 0.2 });
      this.onTapMess?.(mi);
      return false;
    }
    if (!this.creatureHit(x, y)) return false;
    this.play("poke");
    this.onCreatureTap?.();
    return true;
  }

  creatureRect(): { x: number; y: number; w: number; h: number } {
    const { cx, cy, size } = this.L;
    const w = size * 1.05;
    return { x: cx - w / 2, y: cy - size / 2, w, h: size };
  }

  play(fx: Fx, extra?: { from?: string; to?: string }): void {
    if (fx === "poke") this.creature.react("poke");
    if (fx === "sleep" || fx === "wake") { /* lights are driven by frame.lightsOff */ }
    this.fx.add(fx as FxName, extra ?? {}, this.host());
  }

  render(frame: SceneFrame, nowMs: number): void {
    this.frame = frame;
    const dtRaw = this.lastNow < 0 ? 1 / 60 : (nowMs - this.lastNow) / 1000;
    this.lastNow = nowMs;
    const dt = clamp(dtRaw, 0, 0.05);
    this.ensureLayout();
    const L = this.L;
    if (L.W < 2 || L.H < 2) return;
    this.particles.reduced = this.reduced;
    this.time += dt;

    const sky = skyAt(frame.timeOfDay, this.sky);
    this.wfx.update(dt, frame.weather ?? this.dateWeather(), this.reduced);
    this.wfx.gradeSky(sky);
    const bucket = Math.round(((frame.timeOfDay % 1) + 1) % 1 * 96);
    if (!this.layers || this.shaftKey !== bucket) this.rebuildShaft(bucket, frame.timeOfDay);

    // ---- update
    this.dark += (Number(frame.lightsOff) - this.dark) * (1 - Math.exp(-dt * 3.2));
    const dead = frame.params.mood === "dead";
    this.death += ((dead ? 1 : 0) - this.death) * (1 - Math.exp(-dt * 0.9));
    if (!dead && this.death < 0.004) this.death = 0;

    const h = this.host();
    this.fx.update(dt, h);
    const sdt = dt * this.fx.slow;

    Object.assign(this.params, frame.params);
    const g = this.pointer && !this.reduced ? { x: this.pointer.x - L.cx, y: this.pointer.y - L.cy } : this.pointer ? { x: this.pointer.x - L.cx, y: this.pointer.y - L.cy } : null;
    this.params.gaze = g ?? this.wfx.gaze(L, frame.params.asleep);
    this.creature.setAccessories?.(frame.accessories ?? {});
    this.decor.setRoom(frame.room);
    this.creature.update(sdt, this.params);
    const hop = (this.creature as unknown as { hop?: { x: number } }).hop;
    const lf = hop ? clamp(-hop.x * L.size / 100 / (L.size * 0.5)) : 0;
    this.lift += (lf - this.lift) * (1 - Math.exp(-dt * 20));
    this.particles.update(sdt);
    this.bubbles.update(dt, frame.speech, frame.wantIcon, frame.params.urgency, L, this.ctx);

    // parallax target
    const tx = this.pointer ? clamp((this.pointer.x / L.W - 0.5) * 2, -1, 1) : Math.sin(nowMs * 0.00022) * 0.5;
    const ty = this.pointer ? clamp((this.pointer.y / L.H - 0.5) * 2, -1, 1) : Math.cos(nowMs * 0.00017) * 0.3;
    const k = this.reduced ? 0 : 1 - Math.exp(-dt * 3);
    this.par.x += (tx - this.par.x) * k;
    this.par.y += (ty - this.par.y) * k;

    this.draw(frame, nowMs, sky.day, dt);
  }

  /* ---- internals --------------------------------------------------------- */

  private host(): FxHost {
    const L = this.L;
    return {
      L, p: this.particles, reduced: this.reduced,
      hue: SPECIES_HUE[this.params.species] ?? P.lagoon,
      react: (r: CreatureReaction) => this.creature.react(r),
      hueOf: (s) => SPECIES_HUE[s ?? this.params.species] ?? P.lagoon,
    };
  }

  /** Weather from the real local date, refreshed every 20s (cheap, deterministic). */
  private dateWeather(): Weather {
    const t = Date.now();
    if (!this.wxDate || t - this.wxDate.at > 20000) this.wxDate = { at: t, w: weatherAt(new Date(t)) };
    return this.wxDate.w;
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private creatureHit(x: number, y: number): boolean {
    const L = this.L;
    return this.creature.contains(x, y, L.cx, L.cy, L.size);
  }

  private messSlot(i: number): { x: number; y: number } {
    const { cx, feetY, size: s, H } = this.L;
    const slots: [number, number][] = [[0.98, 0.1], [0.55, 0.32], [-0.5, 0.34], [-0.98, 0.62]];
    const [fx, fy] = slots[i % 4]!;
    return { x: cx + fx * s * 1.05 + (i >= 4 ? s * 0.2 : 0), y: Math.min(feetY + fy * s, H - 128) };
  }
  private hitMess(x: number, y: number): number {
    const n = this.frame?.messes ?? 0;
    const r = Math.max(26, this.L.size * 0.2);
    for (let i = n - 1; i >= 0; i--) {
      const m = this.messSlot(i);
      if (Math.hypot(x - m.x, (y - (m.y - r * 0.4)) * 0.85) < r) return i;
    }
    return -1;
  }

  private ensureLayout(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const W = Math.round(this.canvas.clientWidth), H = Math.round(this.canvas.clientHeight);
    const need = this.dirty || W !== Math.round(this.L.W) || H !== Math.round(this.L.H) || dpr !== this.L.dpr;
    if (!need) return;
    this.dirty = false;
    if (W < 2 || H < 2) return;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.L = computeLayout(W, H, dpr);
    const b = bakeAll(this.L);
    this.layers = { ...b, shaft: this.layers?.shaft ?? document.createElement("canvas") };
    this.shaftKey = -1;
    const cs = Math.ceil(this.L.size * 3);
    this.cc.width = Math.ceil(cs * dpr); this.cc.height = Math.ceil(cs * dpr);
  }

  private rebuildShaft(bucket: number, tod: number): void {
    if (!this.layers) return;
    this.shaftKey = bucket;
    const t = bucket / 96;
    const sky = skyAt(t, makeSky());
    this.layers.shaft = bakeShaft(this.L, sky, t);
    this.shaftDx = clamp((0.5 - t) * 3.2, -1.2, 1.2) * this.L.W * 0.26;
    void tod;
  }

  private draw(f: SceneFrame, now: number, _day: number, dt: number): void {
    const ctx = this.ctx, L = this.L, sky = this.sky, layers = this.layers!;
    const { W, H, M, cx, cy, size: s, U } = L;
    const d = this.dark;
    const A = 5 * U;
    const fx = this.fx;
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.ink;
    ctx.fillRect(0, 0, W, H);

    // screen shake
    const sa = fx.shakeAmp;
    const sx = sa > 0.05 ? Math.sin(now * 0.091) * sa + Math.sin(now * 0.157) * sa * 0.4 : 0;
    const sy = sa > 0.05 ? Math.cos(now * 0.113) * sa * 0.8 : 0;
    ctx.save();
    ctx.translate(sx, sy);

    const wallO = { x: -this.par.x * A * 0.5, y: -this.par.y * A * 0.25 };
    const floorO = { x: -this.par.x * A * 0.85, y: -this.par.y * A * 0.5 };
    const propO = { x: -this.par.x * A * 1.3, y: -this.par.y * A * 0.75 };
    const lw = W + M * 2, lh = H + M * 2;
    ctx.drawImage(layers.wall, -M + wallO.x, -M + wallO.y, lw, lh);
    this.decor.drawWall(ctx, L, wallO);
    ctx.drawImage(layers.floor, -M + floorO.x, -M + floorO.y, lw, lh);
    this.decor.drawFloor(ctx, L, floorO);
    ctx.drawImage(layers.props, -M + propO.x, -M + propO.y, lw, lh);
    const decorLit = clamp(0.28 + 0.72 * Math.max(d, sky.night));
    this.decor.drawLamp(ctx, L, wallO, now, decorLit, this.reduced);

    // messes are lit like the room, so they go under the ambient pass
    const nm = f.messes;
    for (let i = 0; i < nm; i++) { const m = this.messSlot(i); drawMess(ctx, m.x + propO.x * 0.4, m.y + propO.y * 0.4, s * 0.15, now, i); }

    // ambient light (multiply)
    const amb = mix(sky.amb, [sky.amb[0] * DARK_TINT[0] / 255, sky.amb[1] * DARK_TINT[1] / 255, sky.amb[2] * DARK_TINT[2] / 255], d) as RGB;
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = css(amb);
    ctx.fillRect(-M, -M, lw, lh);
    ctx.globalCompositeOperation = "source-over";
    const bright = (amb[0] * 0.3 + amb[1] * 0.5 + amb[2] * 0.2) / 255;

    // light shafts, then the sky in the glass
    const shaftA = sky.light * (1 - d * 0.65 * sky.day) * (this.death > 0.5 ? 0.6 : 1) * 0.9;
    if (shaftA > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(shaftA * 0.85);
      ctx.drawImage(layers.shaft, -M + floorO.x, -M + floorO.y, lw, lh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    drawSky(ctx, L, sky, now, wallO.x - this.par.x * 2.5 * U, wallO.y, d * 0.55 * sky.day + fx.windowDim, this.wfx.hooks(sky, d));

    // additive light sources
    ctx.globalCompositeOperation = "lighter";
    this.decor.drawGlow(ctx, L, wallO, now, decorLit);
    const lamp = (1 - d) * clamp(1.05 - sky.day * 0.9);
    const lampX = L.lamp.x + propO.x, lampY = L.lamp.shadeY + propO.y + 18 * U;
    if (lamp > 0.01) {
      drawGlow(ctx, P.butter, lampX, lampY, s * 1.9, 0.5 * lamp);
      drawGlow(ctx, P.peach, lampX, lampY, s * 3.0, 0.22 * lamp);
      drawGlow(ctx, "#ffe9a8", lampX, lampY + 12 * U, 26 * U, 0.4 * lamp);
      drawGlow(ctx, P.peach, lampX - s * 0.3, L.floorY + (H - L.floorY) * 0.42, s * 1.5, 0.28 * lamp, 0.32);
    }
    const snug = this.wfx.snug * d;
    const nl = clamp(d * 0.95 + (1 - d) * 0.1 * sky.night + snug * 0.3);
    if (nl > 0.01) {
      const nx = L.nightlight.x + propO.x, ny = L.nightlight.y + propO.y;
      drawGlow(ctx, P.butter, nx, ny, s * 1.3, 0.55 * nl);
      drawGlow(ctx, P.peach, nx, ny, s * 2.4, 0.22 * nl);
      drawGlow(ctx, "#fff4c2", nx, ny - 3 * U, 14 * U, 0.85 * nl);
      drawGlow(ctx, P.peach, nx - s * 0.2, L.floorY + (H - L.floorY) * 0.3, s * 1.1, 0.2 * nl, 0.3);
    }
    // string lights
    const gi = clamp(0.3 + sky.night * 0.65 + d * 0.15);
    for (let i = 0; i < L.bulbs.length; i++) {
      const b = L.bulbs[i]!;
      const tw = 0.82 + 0.18 * Math.sin(now * 0.0031 + i * 1.7);
      const bx = b.x + wallO.x, by = b.y + wallO.y;
      drawGlow(ctx, b.c, bx, by, 15 * U, 0.75 * gi * tw);
      drawGlow(ctx, "#ffffff", bx, by, 4.5 * U, 0.85 * gi * tw);
    }
    // dust motes in the beam
    this.drawMotes(ctx, now, sky.light * (1 - d * 0.6), wallO);
    this.wfx.drawRoomLight(ctx, L, sky, this.shaftDx, wallO, shaftA, W, H);
    // fireflies
    this.drawFireflies(ctx, now, Math.max(sky.night, this.wfx.fireflyBoost(sky)) * (0.55 + d * 0.45));
    ctx.globalCompositeOperation = "source-over";

    // ---- creature layer
    fx.drawBack(ctx, this.host(), now);

    // shadow
    const lift = this.lift;
    const shx = cx - clamp(this.shaftDx / L.W, -0.3, 0.3) * s * 0.35 * sky.day * (1 - d);
    ctx.globalAlpha = (0.42 - 0.18 * lift) * (0.6 + 0.4 * bright);
    const rx = s * 0.44 * (1 - lift * 0.32) * (1 + Math.sin(now * 0.0018) * 0.012);
    const sg = ctx.createRadialGradient(shx, L.feetY + s * 0.01, 0, shx, L.feetY + s * 0.01, rx);
    sg.addColorStop(0, "rgba(38,18,52,0.9)"); sg.addColorStop(0.55, "rgba(38,18,52,0.4)"); sg.addColorStop(1, "rgba(38,18,52,0)");
    ctx.save();
    ctx.translate(shx, L.feetY + s * 0.01); ctx.scale(1, 0.24); ctx.translate(-shx, -(L.feetY + s * 0.01));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(shx, L.feetY + s * 0.01, rx, 0, 6.3); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    this.drawCreature(ctx, amb, bright, now);

    // creature's own luminescence + window rim light
    const hue = SPECIES_HUE[this.params.species] ?? P.lagoon;
    ctx.globalCompositeOperation = "lighter";
    const lum = (0.05 + 0.34 * d + 0.08 * sky.night + 0.16 * snug) * (1 - this.death * 0.8);
    drawGlow(ctx, hue, cx + fx.jitterX, cy - s * 0.02, s * (0.9 + 0.05 * Math.sin(now * 0.002)), lum);
    if (sky.light > 0.05 && d < 0.9) drawGlow(ctx, "#" + rgbHex(sky.lc), cx - s * 0.35, cy - s * 0.2, s * 0.8, 0.09 * sky.light * (1 - d));
    ctx.globalCompositeOperation = "source-over";

    // candle beside a departed pet
    if (f.params.mood === "dead" && !fx.has("die")) drawCandle(ctx, cx + s * 0.86, L.feetY + s * 0.06, s, easeOutCubic(this.death * 1.6), now);

    fx.drawFront(ctx, this.host(), now);
    this.particles.draw(ctx, false);
    ctx.globalCompositeOperation = "lighter";
    this.particles.draw(ctx, true);
    ctx.globalCompositeOperation = "source-over";

    // ---- grading
    if (this.death > 0.01) {
      ctx.globalCompositeOperation = "saturation";
      ctx.globalAlpha = clamp(this.death * 0.92);
      ctx.fillStyle = "#808080";
      ctx.fillRect(-M, -M, lw, lh);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = this.death * 0.18;
      ctx.fillStyle = P.ink; ctx.fillRect(-M, -M, lw, lh);
      ctx.globalAlpha = 1;
    }
    if (fx.dim > 0.01) { ctx.fillStyle = css(hex(P.ink), fx.dim * 0.8); ctx.fillRect(-M, -M, lw, lh); }
    fx.drawFlash(ctx, L);
    ctx.restore();

    // seasons + weather grade (screen-space, not shaken)
    this.wfx.drawGrade(ctx, W, H, d);

    // vignette + gentle grade (screen-space, not shaken)
    const vg = ctx.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.32, W / 2, H * 0.52, Math.hypot(W, H) * 0.56);
    vg.addColorStop(0, "rgba(27,22,56,0)");
    vg.addColorStop(1, `rgba(27,22,56,${(0.42 + d * 0.3).toFixed(3)})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = css(mix(sky.lc, [255, 200, 170], 0.4));
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // bubbles ride on top of the grade
    const headY = cy - s * 0.5 - s * 0.08 * this.lift * 0 - this.lift * s * 0.12;
    this.bubbles.draw(ctx, L, now, headY, f.params.asleep);
    void dt;
  }

  private drawCreature(ctx: Ctx, amb: RGB, bright: number, now: number): void {
    const { L, fx } = { L: this.L, fx: this.fx };
    const { cx, cy, size: s, dpr } = L;
    const cs = Math.ceil(s * 3);
    const c = this.ccx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, cs, cs);
    const ox = cs / 2, oy = cs / 2;
    this.emitOff.x = cx - ox + fx.jitterX; this.emitOff.y = cy - oy + fx.jitterY;
    this.creature.draw(c, ox, oy, s);
    // tint toward the room's ambience (only needed when it is dim)
    const a = (1 - bright) * 0.5;
    if (a > 0.015) {
      c.globalCompositeOperation = "source-atop";
      c.fillStyle = css(mix(hex(P.plum), amb, 0.45), a);
      c.fillRect(0, 0, cs, cs);
    }
    if (fx.silhouette > 0.01) {
      c.globalCompositeOperation = "source-atop";
      c.fillStyle = `rgba(255,252,240,${clamp(fx.silhouette).toFixed(3)})`;
      c.fillRect(0, 0, cs, cs);
    }
    c.globalCompositeOperation = "source-over";
    void now;
    ctx.drawImage(this.cc, 0, 0, this.cc.width, this.cc.height, cx - ox + fx.jitterX, cy - oy + fx.jitterY, cs, cs);
  }

  private drawMotes(ctx: Ctx, now: number, amt: number, off: { x: number; y: number }): void {
    if (this.reduced || amt < 0.05) return;
    const { win, floorY, H, U, W } = this.L;
    const farY = floorY + (H - floorY) * 0.42;
    const y0 = win.y + win.h * 0.6;
    const dx = this.shaftDx;
    const col = "#" + rgbHex(this.sky.lc);
    for (const m of this.motes) {
      const u = (m.ph + now * 0.001 * m.sp) % 1;
      const y = lerp(y0, farY, u);
      const spread = 1 + 0.55 * u;
      const x = win.x + win.w / 2 + (m.a - 0.5) * win.w * spread + dx * (0.35 + 0.65 * u) * 0.9 + Math.sin(now * 0.0007 + m.wob) * 8 * U;
      const a = Math.sin(Math.PI * u) * (0.55 + 0.45 * Math.sin(now * 0.002 + m.wob * 3)) * amt;
      drawGlow(ctx, col, x + off.x, y + off.y, 3.4 * U, a * 0.9);
    }
    void W;
  }

  private drawFireflies(ctx: Ctx, now: number, amt: number): void {
    if (this.reduced || amt < 0.06) return;
    const { W, H, floorY, U } = this.L;
    const top = floorY * 0.45, bot = H - 140;
    for (const f of this.fireflies) {
      const t = now * 0.001;
      const x = (f.bx + Math.sin(t * f.f1 + f.ph) * f.ax + Math.sin(t * f.f1 * 2.3 + f.ph * 2) * f.ax * 0.4) * W;
      const y = lerp(top, bot, f.by) + Math.sin(t * f.f1 * 1.4 + f.ph) * f.ay * H;
      const p = Math.pow(Math.max(0, Math.sin(t * f.f2 + f.ph)), 2);
      const a = (0.25 + 0.75 * p) * amt;
      drawGlow(ctx, f.hue, x, y, 13 * U, a * 0.8);
      drawGlow(ctx, "#ffffff", x, y, 2.6 * U, a);
    }
  }
}

/** Sensible ballistic motion for particles the creature emits. */
function EMIT_MOTION(kind: string, s: number): { vx?: number; vy?: number; g?: number; life?: number; s?: number; drag?: number } {
  switch (kind) {
    case "heart": return { vy: -s * 0.4, vx: (Math.random() - 0.5) * s * 0.15, life: 1.4, s: s * 0.075 };
    case "sparkle": return { vy: -s * 0.15, vx: (Math.random() - 0.5) * s * 0.3, life: 0.9, s: s * 0.045 };
    case "sweat": return { vy: -s * 0.1, vx: s * 0.1, g: s * 1.4, life: 0.9, s: s * 0.06 };
    case "zzz": return { vy: -s * 0.2, vx: s * 0.06, life: 2.1, s: s * 0.15 };
    case "steam": return { vy: -s * 0.3, life: 1.0, s: s * 0.12 };
    case "note": return { vy: -s * 0.35, vx: (Math.random() - 0.5) * s * 0.2, life: 1.3, s: s * 0.11 };
    case "star": return { vy: -s * 0.3, vx: (Math.random() - 0.5) * s * 0.5, g: s * 0.4, life: 1.1, s: s * 0.085 };
    default: return {};
  }
}

const rgbHex = (c: RGB): string => [c[0], c[1], c[2]].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");

/** A little swirl of mess with flies. `r` is its base half-width. */
function drawMess(ctx: Ctx, x: number, y: number, r: number, now: number, i: number): void {
  ctx.save();
  ctx.translate(x, y);
  const wob = Math.sin(now * 0.003 + i * 2) * 0.03;
  // shadow
  const sg = ctx.createRadialGradient(0, 2, 0, 0, 2, r * 1.6);
  sg.addColorStop(0, "rgba(58,30,60,0.45)"); sg.addColorStop(1, "rgba(58,30,60,0)");
  ctx.save(); ctx.scale(1, 0.3); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 6, r * 1.6, 0, 6.3); ctx.fill(); ctx.restore();
  ctx.rotate(wob);
  const tiers: [number, number, number][] = [[0, r, r * 0.62], [-r * 0.72, r * 0.72, r * 0.5], [-r * 1.28, r * 0.42, r * 0.4]];
  const g = ctx.createLinearGradient(-r, -r * 1.8, r, 0);
  g.addColorStop(0, "#b47a68"); g.addColorStop(0.5, "#8a5460"); g.addColorStop(1, "#5e3450");
  for (const [dy, rw, rh] of tiers) {
    ellipse(ctx, 0, dy - rh * 0.5, rw, rh); ctx.fillStyle = g; ctx.fill();
  }
  // tip curl
  ctx.beginPath(); ctx.moveTo(-r * 0.16, -r * 1.55); ctx.quadraticCurveTo(r * 0.12, -r * 2.1, r * 0.26, -r * 1.7); ctx.quadraticCurveTo(r * 0.02, -r * 1.7, -r * 0.16, -r * 1.55); ctx.fillStyle = "#8a5460"; ctx.fill();
  // highlights
  ctx.strokeStyle = "rgba(255,225,205,0.5)"; ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.lineCap = "round";
  for (const [dy, rw] of [[-r * 0.62, r * 0.6], [-r * 1.18, r * 0.36]] as const) { ctx.beginPath(); ctx.arc(0, dy, rw, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke(); }
  // sleepy little face
  ctx.fillStyle = "#2a1630";
  ctx.beginPath(); ctx.arc(-r * 0.24, -r * 0.5, r * 0.07, 0, 6.3); ctx.arc(r * 0.24, -r * 0.5, r * 0.07, 0, 6.3); ctx.fill();
  ctx.strokeStyle = "#2a1630"; ctx.lineWidth = r * 0.05;
  ctx.beginPath(); ctx.arc(0, -r * 0.42, r * 0.11, 0.2, Math.PI - 0.2); ctx.stroke();
  // stink wiggles
  ctx.strokeStyle = "rgba(190,230,160,0.55)"; ctx.lineWidth = Math.max(1.4, r * 0.08);
  for (let k = -1; k <= 1; k += 2) {
    ctx.beginPath();
    const ph = now * 0.004 + k;
    for (let j = 0; j <= 8; j++) { const t = j / 8; const px = k * r * 0.7 + Math.sin(t * 6 + ph) * r * 0.1, py = -r * 1.7 - t * r * 0.9; if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // flies
  for (let k = 0; k < 2; k++) {
    const a = now * 0.006 * (k ? -1 : 1) + k * 3 + i;
    const fx = Math.cos(a) * r * 1.3 + Math.sin(now * 0.017 + k) * 1.2, fy = -r * 1.8 + Math.sin(a * 1.3) * r * 0.5;
    ctx.fillStyle = "rgba(236,233,255,0.6)";
    const fl = Math.sin(now * 0.09 + k * 2) > 0 ? 1 : 0.4;
    ctx.beginPath(); ctx.ellipse(fx - 1.5, fy - 1.6, 2.2 * fl, 1.2, -0.5, 0, 6.3); ctx.ellipse(fx + 1.5, fy - 1.6, 2.2 * fl, 1.2, 0.5, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#1B1638"; ctx.beginPath(); ctx.arc(fx, fy, 1.9, 0, 6.3); ctx.fill();
  }
  ctx.restore();
  void smooth;
}
