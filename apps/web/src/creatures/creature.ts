/**
 * Creature state machine: springs, mood -> face targets, idle behaviour, scripted reactions.
 * Rendering lives in render.ts and only reads from this object.
 */
import type { Species } from "@jevagotchi/core";
import type { Accessories, CreatureParams, CreatureReaction, CreatureView } from "../contracts.js";
import { DEFS, FACE_KEYS, SHAPE_KEYS, baseHsl, type FaceDef, type Shape } from "./species.js";
import { TAU, Spring, clamp, damp, easeOutBack, env, lerp, rng, smooth, type HSL } from "./math.js";
import { drawCreature } from "./render.js";

export interface Face {
  open: number; lid: number; arc: number; lower: number; brow: number; browY: number;
  curve: number; mopen: number; mw: number; wav: number; blush: number; pupil: number; tear: number; cheek: number;
}
export const FACE_FIELDS = ["open", "lid", "arc", "lower", "brow", "browY", "curve", "mopen", "mw", "wav", "blush", "pupil", "tear", "cheek"] as const satisfies readonly (keyof Face)[];
const newFace = (): Face => ({ open: 1, lid: 0, arc: 0, lower: 0, brow: 0, browY: 0, curve: 0.3, mopen: 0, mw: 1, wav: 0, blush: 0.2, pupil: 1, tear: 0, cheek: 0 });

type Emit = "sparkle" | "heart" | "sweat" | "zzz" | "steam" | "note" | "star";

export interface Particle {
  on: boolean; kind: number; x: number; y: number; vx: number; vy: number; g: number;
  life: number; max: number; size: number; rot: number; vr: number; hue: number;
}
/** particle kinds */
export const PK = { spark: 0, dot: 1, drop: 2, crumb: 3, ring: 4, ray: 5, tear: 6 } as const;

const MOOD_FACE: Record<string, Partial<Face>> = {
  content: { curve: 0.4, blush: 0.25, browY: 0 },
  happy: { open: 1.1, pupil: 1.28, lower: 0.25, curve: 0.9, mopen: 0.5, blush: 0.65, brow: -0.1, browY: 2.5 },
  bored: { lid: 0.42, curve: -0.02, mw: 0.75, pupil: 0.9, blush: 0.05, brow: 0.05 },
  lonely: { open: 1.05, brow: -0.75, browY: 3, curve: -0.35, mopen: 0.06, pupil: 1.35, tear: 0.55, blush: 0.05, wav: 0.15 },
  grumpy: { lid: 0.3, brow: 0.95, browY: -2, curve: -0.6, mw: 0.95, blush: 0.05, pupil: 0.8 },
  anxious: { open: 1.15, brow: -0.55, browY: 4, curve: -0.12, mopen: 0.18, wav: 1, pupil: 0.66, blush: 0.05 },
  sick: { lid: 0.42, brow: -0.45, browY: 1, curve: -0.35, wav: 0.55, mopen: 0.08, blush: 0, pupil: 0.9 },
  sleepy: { lid: 0.62, brow: -0.15, curve: 0.08, mopen: 0.1, blush: 0.2, pupil: 0.9 },
};

const SAFE_SPECIES = (s: Species): Species => (DEFS[s] ? s : "blobule");

export class Creature implements CreatureView {
  onEmit?: NonNullable<CreatureView["onEmit"]>;
  p!: CreatureParams;
  hasParams = false;
  t = 0;
  size = 120;

  /* shown species / morphing data */
  shown: Species = "blobule";
  shape: Shape = { ...DEFS.blobule.shape };
  fd: FaceDef = { ...DEFS.blobule.face };
  base: HSL = { ...baseHsl("blobule") };
  attach: Record<Species, number> = { egg: 0, blobule: 1, jevling: 0, placid: 0, feral: 0, needy: 0, stoic: 0, insatiable: 0 };

  /* body springs */
  sq = new Spring(0, 240, 15);   // vertical stretch (+ tall/thin, - squat/wide)
  hop = new Spring(0, 300, 22);  // px up is negative
  tilt = new Spring(0, 220, 14);
  shear = new Spring(0, 200, 12);
  sway = new Spring(0, 90, 6);   // secondary motion for ears/antenna/tails
  sway2 = new Spring(0, 60, 4);
  modes = [new Spring(0, 160, 7), new Spring(0, 200, 8), new Spring(0, 260, 9), new Spring(0, 320, 10)];
  lookX = new Spring(0, 260, 24);
  lookY = new Spring(0, 260, 24);
  scaleS = new Spring(1, 180, 14);
  spinAngle = 0;
  breath = 0;

  /* accessories: what is worn, and the lag springs that let a hat trail the body */
  acc: Accessories = {};
  accY = new Spring(0, 130, 8);
  accR = new Spring(0, 110, 7);
  accLag = { y: 0, r: 0 };

  /* face */
  f: Face = newFace();
  tg: Face = newFace();
  ov: Face = newFace();
  ovW = 0;
  out: Face = newFace();
  blink = 0;
  blinkT = -1;
  nextBlink = 2;
  squintT = 0;
  nextSquint = 5;
  yawn = 0;
  yawnT = 0;

  /* gaze */
  wanderT = 1;
  wx = 0; wy = 0;
  dartT = 0;

  /* status blends */
  sickV = 0;
  ghost = 0;
  dyingT = 0;
  hungerV = 0;
  dirtV = 0;
  sleepV = 0;
  white = 0;
  glow = 0;
  sheenT = -1;
  eggT = 0;
  eggCrack = 0;
  eggNext = 3;
  eggRock = 0;
  bubble = 0; // snot bubble size
  bubblePhase = 0;
  drool = 0;
  cheekPuff = 0;
  gurgle = 0;
  gurgleT = 3;
  fidgetT = 3;
  happyHopT = 1;
  emitT: Record<string, number> = {};
  stinkT = 0;

  /* reactions */
  rn: CreatureReaction | null = null;
  rt = 0;
  pokeMean = false;
  chompLast = 0;
  shellT = -1;
  shellShown = false; // hatch: shell burst already happened
  holdSpecies: Species | null = null;
  burstDone = false;

  /* particles + queued emits */
  parts: Particle[] = [];
  rand = rng(1);
  queue: { kind: Emit; x: number; y: number }[] = [];
  speckle: { x: number; y: number; r: number; h: number }[] = [];
  bubbles: { x: number; y: number; r: number; ph: number; sp: number }[] = [];
  seed = -1;

  constructor() {
    for (let i = 0; i < 64; i++) this.parts.push({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, hue: 0 });
  }

  /* ------------------------------------------------------------------ helpers */

  emit(kind: Emit, x: number, y: number): void { this.queue.push({ kind, x, y }); }

  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, g = 0, hue = 0): void {
    for (const q of this.parts) {
      if (q.on) continue;
      q.on = true; q.kind = kind; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.g = g;
      q.life = 0; q.max = life; q.size = size; q.rot = this.rand() * TAU; q.vr = (this.rand() - 0.5) * 8; q.hue = hue;
      return;
    }
  }

  every(key: string, dt: number, interval: number, jitter = 0.4): boolean {
    const v = (this.emitT[key] ?? interval * this.rand()) - dt;
    if (v <= 0) { this.emitT[key] = interval * (1 - jitter / 2 + this.rand() * jitter); return true; }
    this.emitT[key] = v;
    return false;
  }

  reseed(h: number): void {
    this.seed = h;
    this.rand = rng(Math.floor(h * 100000) + 7);
    const r = rng(Math.floor(h * 100000) + 99);
    this.speckle.length = 0;
    for (let i = 0; i < 22; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.86;
      this.speckle.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.9 + r() * 2.4, h: [172, 340, 262, 45, 200][Math.floor(r() * 5)]! });
    }
    this.bubbles.length = 0;
    for (let i = 0; i < 5; i++) this.bubbles.push({ x: (r() - 0.5) * 1.3, y: (r() - 0.3) * 1.1, r: 1.6 + r() * 2.6, ph: r() * TAU, sp: 0.15 + r() * 0.25 });
  }

  /* --------------------------------------------------------------------- API */

  react(r: CreatureReaction): void {
    if (this.rn === "evolve" && this.rt < 3 && r !== "die") return;
    if (this.rn === "hatch" && this.rt < 2.6 && r !== "die") return;
    if ((this.rn === "hatch" || this.rn === "evolve") && this.rn === r && this.rt < 1.2) return;
    this.rn = r; this.rt = 0; this.chompLast = 0; this.burstDone = false;
    this.pokeMean = !!this.hasParams && (this.p.mood === "grumpy" || this.p.mood === "sick" || this.p.mood === "anxious");
    if (r === "poke") {
      this.sq.kick(-4.2); this.tilt.kick((this.rand() - 0.5) * 3.2);
      for (const m of this.modes) m.kick((this.rand() - 0.5) * 60);
      this.shear.kick((this.rand() - 0.5) * 60);
      this.eggRock = 1;
    } else if (r === "hatch") {
      this.holdSpecies = this.shown;
      this.shellT = -1; this.shellShown = false;
    } else if (r === "evolve") {
      this.holdSpecies = this.shown;
    } else if (r === "die") {
      this.dyingT = 4;
    } else if (r === "clean") {
      this.sheenT = -0.3;
    }
  }

  setAccessories(acc: Accessories): void {
    const a = this.acc;
    if (a.hat === acc.hat && a.face === acc.face && a.neck === acc.neck && a.held === acc.held) return;
    this.acc = { ...acc };
  }

  contains(px: number, py: number, cx: number, cy: number, size: number): boolean {
    const k = size / 100;
    const sh = this.shape;
    const yc = cy + (50 - sh.ry) * k + (this.hop.x - this.ghost * 26) * k;
    const rx = sh.rx * k * 0.95 * (1 + Math.max(0, -this.sq.x) * 0.5) + 6 * k;
    const ry = sh.ry * k * 1.02 * (1 + this.sq.x * 0.6) + 6 * k;
    const dx = (px - cx) / rx, dy = (py - yc) / ry;
    return dx * dx + dy * dy <= 1;
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    this.size = size;
    drawCreature(this, ctx, cx, cy, size);
    if (this.onEmit && this.queue.length) {
      const k = size / 100;
      const ox = cx, oy = cy + (50 - this.shape.ry) * k + (this.hop.x - this.ghost * 26) * k;
      for (const e of this.queue) this.onEmit({ kind: e.kind, x: ox + e.x * k, y: oy + e.y * k });
    }
    this.queue.length = 0;
  }

  /* -------------------------------------------------------------- update loop */

  update(dtRaw: number, p: CreatureParams): void {
    const dt = clamp(dtRaw, 0, 0.05);
    if (!this.hasParams || this.seed !== p.hueShift) this.reseed(p.hueShift);
    const prev = this.hasParams ? this.p : null;
    this.p = p; this.hasParams = true;
    this.t += dt;
    const sp = SAFE_SPECIES(p.species);
    const asleep = p.asleep && p.mood !== "dead";

    /* --- species change => auto transition, hold old silhouette until the flash --- */
    if (prev && SAFE_SPECIES(prev.species) !== sp && this.rn !== "hatch" && this.rn !== "evolve") {
      this.react(prev.species === "egg" ? "hatch" : "evolve");
      this.holdSpecies = SAFE_SPECIES(prev.species);
    }
    if (!prev) { this.shown = sp; this.snapShape(sp); }
    let target = sp;
    if (this.holdSpecies && (this.rn === "hatch" || this.rn === "evolve") && !this.burstDone) target = this.holdSpecies;
    else this.holdSpecies = null;
    if (target !== this.shown) this.shown = target;
    if (this.rn === "hatch" && this.burstDone && this.shown === "egg") this.shown = sp === "egg" ? "blobule" : sp;

    this.morph(dt);

    /* --- status blends --- */
    this.sickV += ((p.sick || p.mood === "sick" ? 1 : 0) - this.sickV) * damp(2.5, dt);
    const ghostT = p.mood === "dead" || this.dyingT > 0 ? 1 : 0;
    if (this.dyingT > 0) this.dyingT -= dt;
    this.ghost += clamp(ghostT - this.ghost, -dt * 0.8, dt * 0.36);
    this.sleepV += ((asleep ? 1 : 0) - this.sleepV) * damp(3, dt);
    this.hungerV += (clamp((p.hunger - 55) / 45) - this.hungerV) * damp(1.5, dt);
    this.dirtV += (clamp((38 - p.hygiene) / 38) - this.dirtV) * damp(1.5, dt);
    this.white += ((0) - this.white) * damp(6, dt);

    if (sp === "egg" || this.shown === "egg") this.updateEgg(dt);

    /* --- targets from mood --- */
    const moodKey = asleep ? "sleepy" : p.mood === "dead" ? "sick" : p.mood;
    const src = MOOD_FACE[moodKey] ?? MOOD_FACE.content!;
    const T = this.tg;
    T.open = 1; T.lid = 0; T.arc = 0; T.lower = 0; T.brow = 0; T.browY = 0; T.curve = 0.3; T.mopen = 0; T.mw = 1; T.wav = 0; T.blush = 0.2; T.pupil = 1; T.tear = 0; T.cheek = 0;
    Object.assign(T, src);
    if (p.sick && moodKey !== "sick") { T.lid = Math.max(T.lid, 0.3); T.wav = Math.max(T.wav, 0.4); T.curve -= 0.3; T.brow -= 0.3; T.blush *= 0.3; }
    if (p.energy < 30) T.lid = Math.max(T.lid, (30 - p.energy) / 30 * 0.45);
    if (this.hungerV > 0) { T.curve -= this.hungerV * 0.5; T.brow -= this.hungerV * 0.45; T.browY += this.hungerV * 2; T.pupil *= 1 + this.hungerV * 0.18; T.mopen = Math.max(T.mopen, this.hungerV * 0.12); }
    if (this.dirtV > 0) { T.curve -= this.dirtV * 0.25; T.lid = Math.max(T.lid, this.dirtV * 0.2); }
    if (p.mood === "dead") { T.open = 1; T.lid = 0; T.arc = 0; T.curve = -0.1; T.mopen = 0.4; T.mw = 0.4; T.brow = -0.5; T.blush = 0; T.pupil = 0.8; T.tear = 0.2; }
    if (asleep) {
      T.open = 0; T.arc = -1; T.curve = 0.25; T.lid = 0; T.mopen = 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(this.t * 1.7)); T.blush = 0.35; T.brow = -0.1;
    } else if (this.yawn > 0) {
      T.mopen = Math.max(T.mopen, this.yawn); T.lid = Math.max(T.lid, this.yawn * 0.7); T.curve = 0.1;
    }
    if (p.hesitant && !asleep) {
      const w = Math.sin(this.t * 8.7) * 0.5 + Math.sin(this.t * 13.1 + 2) * 0.5;
      T.curve += w * 0.4; T.brow += Math.sin(this.t * 6.1) * 0.5; T.browY += Math.sin(this.t * 7.3 + 1) * 2; T.wav = Math.max(T.wav, 0.45);
      T.mopen += Math.max(0, Math.sin(this.t * 4.4)) * 0.14; T.pupil *= 0.85 + 0.25 * Math.sin(this.t * 9);
    }
    // happy squint pulses and blinks
    if (!asleep) {
      this.squintT -= dt;
      if (p.mood === "happy" || p.mood === "content") {
        this.nextSquint -= dt;
        if (this.nextSquint <= 0) { this.squintT = 0.9; this.nextSquint = 4 + this.rand() * 5; }
      }
      if (this.squintT > 0) T.arc = Math.max(T.arc, Math.sin(clamp(this.squintT / 0.9) * Math.PI) * 0.95);
    }
    this.tickBlink(dt, asleep, p);

    const F = this.f;
    const fr = damp(p.hesitant ? 14 : 9, dt);
    for (const k of FACE_FIELDS) F[k] += (T[k] - F[k]) * fr;

    /* --- gaze --- */
    this.updateGaze(dt, p, asleep);

    /* --- body idle --- */
    let sqT = 0, hopT = 0, tiltT = 0, shearT = 0;
    const def = DEFS[this.shown];
    const br = Math.sin(this.t * TAU * 0.28 * def.breath * (asleep ? 0.55 : 1));
    this.breath = br;
    sqT += br * (asleep ? 0.05 : 0.026) * (this.shown === "stoic" ? 0.6 : 1);
    sqT -= this.hungerV * 0.06 + this.sickV * 0.05 + this.sleepV * 0.06;
    tiltT += this.sickV * Math.sin(this.t * 0.9) * 0.05 + this.sleepV * 0.05;
    if (p.mood === "anxious" && !asleep) { tiltT += Math.sin(this.t * 41) * 0.012; shearT += Math.sin(this.t * 37) * 0.6; }
    if (p.hesitant && !asleep) tiltT += Math.sin(this.t * 3.1) * 0.07;
    if (p.mood === "lonely" && !asleep) tiltT += Math.sin(this.t * 0.7) * 0.05;
    if (p.mood === "happy" && !asleep) {
      this.happyHopT -= dt;
      if (this.happyHopT <= 0) { this.happyHopT = 1.6 + this.rand() * 1.6; this.hop.kick(-70); this.sq.kick(1.2); }
    }
    if (!asleep && this.rn === null) this.fidget(dt, p);
    if (this.hungerV > 0.4 && !asleep) {
      this.gurgleT -= dt;
      if (this.gurgleT <= 0) { this.gurgleT = 2.4 + this.rand() * 2.6; this.gurgle = 1; for (const m of this.modes) m.kick(30 * this.hungerV); this.sq.kick(-1.2); }
    }
    this.gurgle *= Math.exp(-dt * 2.5);

    /* --- scripted reaction (writes targets / overrides) --- */
    this.ovW += (0 - this.ovW) * damp(10, dt);
    const sc = { sq: sqT, hop: hopT, tilt: tiltT, shear: shearT };
    if (this.rn) this.runReaction(dt, sc);
    this.stepBodies(dt, sc, p, asleep);
    this.updateEffects(dt, p, asleep);

    /* --- accessory lag: springs chase the head, the difference is how far a hat trails it --- */
    const head = this.hop.x - (this.sq.x * this.shape.ry * 1.6) / (1 + this.sq.x);
    this.accY.target = head; this.accY.step(dt);
    this.accR.target = this.tilt.x + this.spinAngle; this.accR.step(dt);
    this.accLag.y = clamp((this.accY.x - head) * 1.4, -14, 14);
    this.accLag.r = clamp((this.accR.x - this.accR.target) * 1.6, -0.35, 0.35);

    /* --- blend face with overrides --- */
    const O = this.out, ow = clamp(this.ovW);
    for (const k of FACE_FIELDS) O[k] = F[k] + (this.ov[k] - F[k]) * ow;
    this.cheekPuff += (O.cheek - this.cheekPuff) * damp(20, dt);
    const bl = this.blink;
    O.open *= 1 - bl;
    // eyes-shut states must beat the blink; ghost eyes drift
    this.glow += (0 - this.glow) * damp(3, dt);
  }

  /* ------------------------------------------------------------- shape morph */

  snapShape(sp: Species): void {
    const d = DEFS[sp];
    Object.assign(this.shape, d.shape); Object.assign(this.fd, d.face);
    Object.assign(this.base, baseHsl(sp));
    for (const k of Object.keys(this.attach) as Species[]) this.attach[k] = k === sp ? 1 : 0;
  }

  morph(dt: number): void {
    const d = DEFS[this.shown];
    const a = damp(this.rn === "evolve" || this.rn === "hatch" ? 14 : 5, dt);
    for (const k of SHAPE_KEYS) this.shape[k] += (d.shape[k] - this.shape[k]) * a;
    for (const k of FACE_KEYS) this.fd[k] += (d.face[k] - this.fd[k]) * a;
    const b = baseHsl(this.shown);
    let dh = b.h - this.base.h; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    this.base.h += dh * a; this.base.s += (b.s - this.base.s) * a; this.base.l += (b.l - this.base.l) * a;
    for (const k of Object.keys(this.attach) as Species[]) {
      const tgt = k === this.shown ? 1 : 0;
      this.attach[k] += (tgt - this.attach[k]) * damp(k === this.shown ? 7 : 12, dt);
    }
  }

  /* ---------------------------------------------------------------- blink/gaze */

  tickBlink(dt: number, asleep: boolean, p: CreatureParams): void {
    if (asleep) { this.blink = 0; this.blinkT = -1; return; }
    this.nextBlink -= dt;
    const dur = p.mood === "sleepy" ? 0.4 : 0.17;
    if (this.blinkT < 0 && this.nextBlink <= 0) { this.blinkT = 0; }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const u = this.blinkT / dur;
      this.blink = u >= 1 ? 0 : Math.sin(u * Math.PI);
      if (u >= 1) {
        this.blinkT = -1;
        this.nextBlink = this.rand() < 0.18 ? 0.12 : 1.8 + this.rand() * 4.2;
        if (p.hesitant) this.nextBlink *= 0.5;
      }
    } else this.blink = 0;
  }

  updateGaze(dt: number, p: CreatureParams, asleep: boolean): void {
    let gx = 0, gy = 0;
    if (asleep) { gx = 0; gy = 0.2; }
    else if (p.hesitant) {
      this.dartT -= dt;
      if (this.dartT <= 0) { this.dartT = 0.25 + this.rand() * 0.45; this.wx = (this.rand() * 2 - 1) * 1.1; this.wy = (this.rand() * 2 - 1) * 0.7; }
      gx = this.wx; gy = this.wy;
    } else if (p.gaze) {
      const s = this.size * 0.55 + 1;
      gx = p.gaze.x / s; gy = p.gaze.y / s;
      const m = Math.hypot(gx, gy);
      if (m > 1) { gx /= m; gy /= m; }
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 1.2 + this.rand() * 3; this.wx = (this.rand() * 2 - 1) * 0.6; this.wy = (this.rand() * 2 - 1) * 0.3; }
      gx = this.wx; gy = this.wy;
      if (p.mood === "bored") gy = Math.max(gy, 0.15) - 0.1;
      if (p.mood === "sick" || p.mood === "lonely") gy = 0.35;
    }
    this.lookX.target = gx; this.lookY.target = gy;
    this.lookX.k = this.lookY.k = p.hesitant ? 500 : 240;
    this.lookX.step(dt); this.lookY.step(dt);
  }

  fidget(dt: number, p: CreatureParams): void {
    this.fidgetT -= dt;
    if (this.fidgetT > 0) return;
    const u = clamp(p.urgency);
    this.fidgetT = lerp(4.5, 1.1, u) * (0.6 + this.rand() * 0.8);
    const s = 0.5 + u * 1.5;
    const r = this.rand();
    if (r < 0.28) { this.tilt.kick((this.rand() - 0.5) * 3 * s); this.shear.kick((this.rand() - 0.5) * 40 * s); }
    else if (r < 0.5) { this.hop.kick(-55 * s); this.sq.kick(0.9 * s); }
    else if (r < 0.7) { this.sq.kick(-1.6 * s); for (const m of this.modes) m.kick((this.rand() - 0.5) * 50 * s); }
    else if (r < 0.85) { this.sway.kick((this.rand() - 0.5) * 30 * s); this.tilt.kick(0.6 * s * (this.rand() < 0.5 ? -1 : 1)); }
    else if (p.mood === "bored" || p.mood === "sleepy") { this.yawnT = 0.001; }
    else { this.hop.kick(-40 * s); this.tilt.kick((this.rand() - 0.5) * 2); }
    if (u > 0.4 && (p.want === "food" || p.want === "attention" || p.want === "play")) { this.hop.kick(-40 * u); }
  }

  /* -------------------------------------------------------------------- egg */

  updateEgg(dt: number): void {
    this.eggT += dt;
    const prog = 1 - Math.exp(-this.eggT / 150);
    this.eggCrack = prog * 0.75;
    this.eggNext -= dt;
    if (this.eggNext <= 0) {
      this.eggNext = lerp(7, 2.2, prog) * (0.6 + this.rand() * 0.8);
      this.eggRock = 0.5 + prog * 0.9;
      this.tilt.kick((this.rand() < 0.5 ? -1 : 1) * (2 + prog * 3.5));
      this.hop.kick(-20 * prog);
      this.glow = 1;
    }
    this.eggRock *= Math.exp(-dt * 1.4);
  }

  /* --------------------------------------------------------------- reactions */

  runReaction(dt: number, sc: { sq: number; hop: number; tilt: number; shear: number }): void {
    const r = this.rn!;
    const t = (this.rt += dt);
    const ov = this.ov;
    const setOv = (o: Partial<Face>, w: number): void => {
      if (w > this.ovW) {
        for (const k of FACE_FIELDS) if (o[k] !== undefined) ov[k] = o[k]!; else if (this.ovW < 0.05) ov[k] = this.f[k];
        this.ovW = w;
      } else for (const k of FACE_FIELDS) if (o[k] !== undefined) ov[k] += (o[k]! - ov[k]) * 0.5;
    };
    const mx = 0, my = this.shape.ry * 0.35 + this.fd.mouthY * 0.5;
    let done = false;
    switch (r) {
      case "eat": {
        const dur = 2.5;
        const a = env(t, 0, 0.15, 2.1, 2.5);
        if (t < 0.3) { sc.sq += 0.14 * smooth(t / 0.3); setOv({ mopen: 1, open: 1.2, pupil: 1.4, curve: 0.6, cheek: 0 }, a); }
        else if (t < 1.75) {
          const ph = (t - 0.3) * 5.4;
          const open = 0.5 + 0.5 * Math.cos(ph * TAU);
          sc.sq += -0.09 * (1 - open) + 0.03;
          setOv({ mopen: 0.15 + open * 0.7, cheek: 1, arc: 0.55, curve: 0.5, open: 1 }, a);
          const idx = Math.floor(ph);
          if (idx > this.chompLast) {
            this.chompLast = idx;
            for (let i = 0; i < 2; i++) this.spawn(PK.crumb, mx + (this.rand() - 0.5) * 16, my + 4, (this.rand() - 0.5) * 60, -20 - this.rand() * 40, 0.6, 1.6 + this.rand() * 1.4, 220, 30 + this.rand() * 20);
            for (const m of this.modes) m.kick((this.rand() - 0.5) * 20);
          }
        } else {
          const u = (t - 1.75) / 0.75;
          sc.sq += 0.1 * Math.sin(clamp(u * 1.6) * Math.PI);
          setOv({ mopen: 0.2 * (1 - u), cheek: 1 - smooth(u * 2), arc: 0.85, curve: 1, blush: 0.9 }, a);
          if (!this.burstDone && t > 1.9) { this.burstDone = true; this.emit("heart", 10, -this.shape.ry * 0.8); this.emit("sparkle", -14, -this.shape.ry * 0.6); this.pulse(); }
        }
        done = t > dur; break;
      }
      case "play": {
        const H = 34, T = 0.58;
        const u = t / T;
        const h = t < 3 * T ? Math.abs(Math.sin(Math.PI * u)) : 0;
        sc.hop += -H * h * (t < 3 * T ? 1 : 0);
        sc.sq += lerp(-0.16, 0.13, clamp(h * 2.2));
        const spinU = clamp((t - T) / T);
        this.spinAngle = TAU * smooth(spinU);
        setOv({ mopen: 0.75, curve: 1, arc: h > 0.5 ? 0.6 : 0.1, open: 1.15, blush: 0.85, pupil: 1.3 }, env(t, 0, 0.1, 1.6, 2.0));
        const idx = Math.floor(u + 0.5);
        if (idx > this.chompLast && t < 3 * T) { this.chompLast = idx; this.emit("note", (idx % 2 ? 1 : -1) * 22, -this.shape.ry - 6); }
        if (t > 3 * T && !this.burstDone) { this.burstDone = true; this.emit("sparkle", 0, -this.shape.ry); this.emit("star", 18, -this.shape.ry * 0.5); this.pulse(); }
        if (t > 3 * T) sc.sq += 0.05 * Math.sin((t - 3 * T) * 14) * Math.exp(-(t - 3 * T) * 4);
        if (t > 1.9) this.spinAngle = 0;
        done = t > 2.1; break;
      }
      case "scold": {
        const a = env(t, 0, 0.1, 1.2, 1.9);
        sc.sq += -0.2 * env(t, 0, 0.09, 0.9, 1.6);
        sc.tilt += -0.16 * env(t, 0, 0.12, 1.1, 1.8) + Math.sin(t * 46) * 0.03 * Math.exp(-t * 1.4);
        sc.shear += -5 * env(t, 0, 0.1, 1.0, 1.7);
        setOv({ lid: 0.55, brow: -0.9, browY: 4, curve: -0.9, mopen: 0, mw: 0.62, tear: 1, pupil: 1.2, arc: 0, blush: 0.15, wav: 0.4, open: 1 }, a);
        if (!this.burstDone && t > 0.25) { this.burstDone = true; this.emit("sweat", 26, -this.shape.ry * 0.7); this.spawn(PK.tear, -this.fd.eyeSp, this.fd.eyeY + 4, -10, 10, 1.1, 2.4, 140); this.spawn(PK.tear, this.fd.eyeSp, this.fd.eyeY + 4, 10, 10, 1.1, 2.4, 140); }
        done = t > 1.9; break;
      }
      case "medicine": {
        const a = env(t, 0, 0.12, 2.3, 2.9);
        if (t < 0.45) { sc.sq += 0.1; sc.tilt += -0.1 * smooth(t / 0.4); setOv({ mopen: 0.95, open: 1.15, pupil: 1.1, curve: 0.2, brow: -0.2 }, a); }
        else if (t < 1.0) { const g = Math.sin((t - 0.45) / 0.55 * Math.PI); sc.sq += -0.1 * g; setOv({ mopen: 0.05, cheek: 1, arc: -1, open: 0, brow: 0.7, curve: -0.5, mw: 0.7 }, a); }
        else if (t < 1.75) { const s = Math.exp(-(t - 1.0) * 1.2); sc.tilt += Math.sin(t * 62) * 0.075 * s; sc.shear += Math.sin(t * 55) * 3 * s; sc.sq += Math.sin(t * 40) * 0.03 * s; setOv({ mopen: 0.12, arc: -1, open: 0, brow: 0.9, browY: -2, curve: -0.9, wav: 1, mw: 0.7 }, a); }
        else { const u = (t - 1.75) / 1.1; sc.sq += 0.12 * Math.sin(clamp(u) * Math.PI); setOv({ mopen: 0.25 * (1 - u), arc: 0.8, curve: 0.9, blush: 0.8, open: 1, brow: -0.2 }, a);
          if (!this.burstDone) { this.burstDone = true; this.emit("sparkle", -12, -this.shape.ry * 0.7); this.emit("sparkle", 14, -this.shape.ry * 0.3); this.emit("heart", 6, -this.shape.ry - 4); this.pulse(); } }
        done = t > 2.9; break;
      }
      case "clean": {
        sc.sq += -0.08 * env(t, 0, 0.2, 0.25, 0.4) + 0.1 * env(t, 1.5, 1.8, 2.0, 2.4);
        const s = Math.max(0, t - 0.2);
        const dec = Math.exp(-s * 1.5);
        sc.tilt += Math.sin(s * 38) * 0.24 * dec * (t > 0.2 ? 1 : 0);
        sc.shear += Math.sin(s * 38 + 1.4) * 6 * dec;
        if (t > 0.2 && t < 1.5) for (const m of this.modes) m.kick(Math.sin(s * 38) * 6);
        setOv({ arc: 0.85, mopen: 0.4, curve: 0.9, blush: 0.7, open: 1 }, env(t, 0.15, 0.3, 1.9, 2.4));
        if (t > 0.2 && t < 1.6 && this.every("cleanspark", dt, 0.1, 0.3)) {
          const a = this.rand() * TAU, d = 24 + this.rand() * 26;
          this.spawn(PK.spark, Math.cos(a) * d, Math.sin(a) * d * 0.9 - 6, 0, -14, 0.7, 3 + this.rand() * 2.5, 0, 50 + this.rand() * 130);
          if (this.rand() < 0.5) this.emit("sparkle", Math.cos(a) * d, Math.sin(a) * d * 0.9 - 6);
          // water flick
          this.spawn(PK.drop, Math.cos(a) * 34, Math.sin(a) * 18, Math.cos(a) * 110, -50 + Math.sin(a) * 40, 0.7, 2, 260, 195);
        }
        if (t > 0.4) this.sheenT = (t - 0.4) / 1.1;
        done = t > 2.5; break;
      }
      case "poke": {
        const dur = 1.3;
        if (this.pokeMean) {
          setOv({ lid: 0.3, brow: 1, browY: -2, curve: -0.7, mopen: 0.1, open: 1, pupil: 0.8, blush: 0.2 }, env(t, 0, 0.08, 0.8, 1.3));
          sc.tilt += Math.sin(t * 40) * 0.03 * Math.exp(-t * 4);
          if (!this.burstDone && t > 0.15) { this.burstDone = true; this.emit("steam", 12, -this.shape.ry - 2); }
        } else {
          if (t < 0.16) setOv({ mopen: 0.55, open: 1.3, pupil: 0.65, curve: 0, brow: -0.3, browY: 4 }, 1);
          else {
            const g = env(t, 0.1, 0.25, 1.0, 1.35);
            sc.sq += Math.sin((t - 0.16) * 28) * 0.05 * Math.exp(-(t - 0.16) * 3.2);
            sc.hop += -3.5 * Math.abs(Math.sin((t - 0.16) * 14)) * Math.exp(-(t - 0.16) * 2.4);
            setOv({ arc: 0.95, mopen: 0.8, curve: 1, blush: 0.95, open: 1 }, g);
            if (!this.burstDone) { this.burstDone = true; this.emit("heart", 12, -this.shape.ry * 0.8); }
          }
        }
        done = t > dur; break;
      }
      case "happy": {
        const c = env(t, 0, 0.16, 0.2, 0.3);
        sc.sq += -0.15 * c;
        const j = clamp((t - 0.16) / 0.55);
        const h = Math.sin(j * Math.PI);
        sc.hop += -30 * h;
        sc.sq += 0.12 * h - 0.14 * env(t, 0.7, 0.75, 0.82, 1.0);
        setOv({ arc: 0.85, mopen: 0.8, curve: 1, blush: 0.9, open: 1, pupil: 1.3 }, env(t, 0.1, 0.22, 0.8, 1.2));
        if (!this.burstDone && t > 0.35) { this.burstDone = true; this.emit("sparkle", -14, -this.shape.ry - 4); this.emit("heart", 12, -this.shape.ry - 6); }
        done = t > 1.2; break;
      }
      case "refuse": {
        const dec = Math.exp(-t * 1.9);
        const s = Math.sin(t * 21) * dec;
        sc.shear += s * 7; sc.tilt += s * 0.13;
        setOv({ lid: 0.5, brow: 0.7, browY: -1, curve: -0.35, mopen: 0, mw: 0.7, arc: 0, open: 1, pupil: 0.9 }, env(t, 0, 0.1, 0.6, 1.0));
        this.lookX.target = -s * 1.2;
        if (!this.burstDone && t > 0.1) { this.burstDone = true; this.emit("sweat", -24, -this.shape.ry * 0.6); }
        done = t > 1.1; break;
      }
      case "die": {
        const a = env(t, 0, 0.3, 4, 5);
        sc.sq += -0.22 * smooth(t / 0.9);
        sc.tilt += 0.25 * smooth(t / 0.9);
        setOv({ arc: -1, open: 0, curve: -1, mopen: 0.25, brow: -1, browY: 3, blush: 0, tear: 0 }, a);
        if (!this.burstDone && t > 0.8) { this.burstDone = true; for (let i = 0; i < 6; i++) this.spawn(PK.dot, (this.rand() - 0.5) * 30, -10, (this.rand() - 0.5) * 30, -20 - this.rand() * 30, 1.6, 2 + this.rand() * 2, -10, 190); }
        done = t > 3.2; break;
      }
      case "hatch": {
        const B = 1.15;
        if (t < B) {
          const u = t / B;
          const rock = Math.sin(t * (18 + u * 26)) * (0.05 + u * 0.22);
          sc.tilt += rock; sc.sq += Math.sin(t * 31) * 0.03 * u;
          this.eggCrack = Math.max(this.eggCrack, 0.35 + u * 0.65);
          this.glow = Math.max(this.glow, u);
        } else if (!this.burstDone) {
          this.burstDone = true; this.shellT = 0;
          this.sq.kick(9); this.hop.kick(-160); this.white = 1;
          for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (this.rand() - 0.5) * 2.4, sp = 70 + this.rand() * 110; this.spawn(PK.spark, 0, -10, Math.cos(a) * sp, Math.sin(a) * sp, 0.9, 2.5 + this.rand() * 3, 160, 45 + this.rand() * 150); }
          this.emit("star", 0, -20); this.emit("sparkle", -20, -30); this.emit("sparkle", 20, -34);
        }
        if (t >= B) {
          const u = t - B;
          sc.sq += Math.sin(u * 20) * 0.1 * Math.exp(-u * 3.5);
          setOv({ open: 1.25, pupil: 1.3, mopen: 0.6 * Math.exp(-u * 1.4), curve: 0.8, arc: 0, blush: 0.6 }, env(t, B, B + 0.1, B + 1.0, B + 1.7));
        }
        if (this.shellT >= 0) this.shellT += dt;
        done = t > 3.0; break;
      }
      case "evolve": {
        const B = 1.7;
        const w = t < B ? smooth(t / B) : 1 - smooth((t - B) / 1.3);
        this.white = Math.max(this.white, w);
        this.glow = Math.max(this.glow, t < B ? smooth(t / B) : 1 - smooth((t - B) / 1.8));
        sc.sq += (t < B ? Math.sin(t * (7 + t * 9)) * 0.06 * (t / B) : 0);
        sc.tilt += t < B ? Math.sin(t * (9 + t * 6)) * 0.04 * (t / B) : 0;
        if (t < B) this.scaleS.target = 1 + 0.1 * smooth(t / B); else this.scaleS.target = 1;
        setOv({ arc: 0.9, open: 0, mopen: 0.1, curve: 0.5, brow: 0 }, env(t, 0, 0.3, B - 0.1, B + 0.15));
        if (t >= B && !this.burstDone) {
          this.burstDone = true; this.sq.kick(10); this.hop.kick(-90); this.scaleS.kick(3); this.pulse();
          for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, sp = 90 + this.rand() * 80; this.spawn(i % 3 === 0 ? PK.spark : PK.dot, 0, -6, Math.cos(a) * sp, Math.sin(a) * sp, 1.1, 2 + this.rand() * 3, 20, 40 + this.rand() * 160); }
          this.spawn(PK.ring, 0, 0, 0, 0, 0.9, 20);
          for (let i = 0; i < 8; i++) this.emit("star", Math.cos(i) * 30, Math.sin(i * 2) * 30 - 10);
          this.emit("sparkle", 0, -this.shape.ry);
        }
        if (t >= B) setOv({ open: 1.25, pupil: 1.25, mopen: 0.4 * Math.exp(-(t - B) * 2), curve: 0.9, arc: 0, blush: 0.6 }, env(t, B, B + 0.2, B + 1.0, B + 1.8));
        done = t > 3.1; break;
      }
    }
    if (done) { this.rn = null; this.holdSpecies = null; this.spinAngle = 0; this.scaleS.target = 1; }
  }

  pulse(): void { this.glow = Math.max(this.glow, 0.8); }

  /* ------------------------------------------------------- integrate springs */

  stepBodies(dt: number, sc: { sq: number; hop: number; tilt: number; shear: number }, p: CreatureParams, asleep: boolean): void {
    const j = DEFS[this.shown].jelly;
    this.sq.target = sc.sq; this.hop.target = sc.hop; this.tilt.target = sc.tilt; this.shear.target = sc.shear;
    const pv = this.hop.x, ps = this.sq.v, pt = this.tilt.x;
    this.sq.k = 240 / Math.sqrt(j); this.sq.d = 15 / Math.pow(j, 0.25);
    this.sq.step(dt); this.hop.step(dt); this.tilt.step(dt); this.shear.step(dt); this.scaleS.step(dt);
    // secondary motion from body motion
    const vy = dt > 0 ? (this.hop.x - pv) / dt : 0;
    this.sway.kick(-vy * dt * 0.9 - (this.tilt.x - pt) * 10 * 0.6);
    this.sway2.kick(-vy * dt * 0.5 + this.shear.x * dt * 0.4);
    this.sway.target = 0; this.sway2.target = 0;
    this.sway.step(dt); this.sway2.step(dt);
    this.modes.forEach((m, i) => { m.kick((ps - this.sq.v) * 0.05 * (i % 2 ? -1 : 1) + vy * dt * 0.02 * (i === 0 ? 1 : -0.5)); m.step(dt); });
    if (asleep) this.modes[0]!.kick(this.breath * 0.15);
    if (this.yawnT > 0) { this.yawnT += dt; if (this.yawnT > 1.8) this.yawnT = 0; }
    this.yawn = this.yawnT > 0 ? Math.sin((this.yawnT / 1.8) * Math.PI) : 0;
    if (!this.rn) this.spinAngle *= Math.exp(-dt * 8);
  }

  /* ------------------------------------------------------- ambient effects */

  updateEffects(dt: number, p: CreatureParams, asleep: boolean): void {
    const ry = this.shape.ry, rx = this.shape.rx;
    const dead = this.ghost > 0.5;
    if (!asleep) { this.bubble += (0 - this.bubble) * damp(6, dt); }
    else {
      // snot bubble: inflate slowly with breath, pop occasionally
      this.bubblePhase += dt * 0.42;
      const cyc = this.bubblePhase % 1;
      this.bubble = cyc < 0.85 ? Math.pow(cyc / 0.85, 0.8) * (0.7 + 0.3 * this.breath) : 0;
      if (this.every("zzz", dt, 2.4, 0.3) && !dead) this.emit("zzz", rx * 0.6, -ry * 0.7);
    }
    if (this.f.tear > 0.4 && !asleep && !dead && this.every("tear", dt, 2.6)) { const s = this.rand() < 0.5 ? -1 : 1; this.spawn(PK.tear, s * this.fd.eyeSp, this.fd.eyeY + this.fd.eyeRy, s * 4, 6, 1.0, 2.3, 130); }
    if (dead) { if (this.every("ghostspark", dt, 0.9, 0.5)) this.emit("sparkle", (this.rand() - 0.5) * rx * 1.6, -ry - 10 - this.rand() * 20); return; }
    if (!asleep) {
      if (p.mood === "anxious" && this.every("sweat", dt, 2.0)) this.emit("sweat", rx * 0.75, -ry * 0.6);
      if (p.sick && this.every("sicksweat", dt, 2.6)) this.emit("sweat", -rx * 0.7, -ry * 0.5);
      if (p.mood === "grumpy" && this.every("steam", dt, 2.4)) this.emit("steam", (this.rand() - 0.5) * 20, -ry - 2);
      if (p.mood === "happy" && this.every("happy", dt, 4.2)) this.emit(this.rand() < 0.5 ? "heart" : "note", (this.rand() < 0.5 ? -1 : 1) * rx * 0.6, -ry - 4);
      if (this.dirtV > 0.3 && this.every("stink", dt, 2.0)) this.emit("steam", (this.rand() - 0.5) * rx, -ry * 0.4);
      if (this.hungerV > 0.7 && this.every("hungry", dt, 5)) this.emit("sweat", -rx * 0.8, -ry * 0.3);
    }
    // particles
    for (const q of this.parts) {
      if (!q.on) continue;
      q.life += dt;
      if (q.life >= q.max) { q.on = false; continue; }
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.kind === PK.spark || q.kind === PK.dot) { q.vx *= Math.exp(-dt * 1.5); q.vy *= Math.exp(-dt * (q.g > 0 ? 0.5 : 1.5)); }
    }
    this.sickV = clamp(this.sickV);
    // reduce sickness tint while medicine relief plays
    if (this.rn === "medicine" && this.rt > 1.4) this.sickV *= 0.985;
  }
}

export { easeOutBack };
