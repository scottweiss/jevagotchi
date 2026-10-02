// Jevagotchi audio: everything synthesized live with Web Audio. No assets.
// Key: D major pentatonic (D E F# A B) so any overlap is consonant.
import type { SfxName } from "./contracts.js";
import type { WeatherKind } from "@jevagotchi/core";

/* ------------------------------------------------------------------ utils */

const LS_MUTE = "jevagotchi.muted";
const LS_VOL = "jevagotchi.volume";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const PENT = [0, 2, 4, 7, 9];
/** Pentatonic degree -> Hz. Degree 0 = D4; 5 = D5; -5 = D3. */
function sc(deg: number): number {
  const oct = Math.floor(deg / 5);
  const i = ((deg % 5) + 5) % 5;
  const midi = 62 + oct * 12 + PENT[i]!;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
const cents = (c: number) => Math.pow(2, c / 1200);

/* ----------------------------------------------------------------- engine */

/** Where a sound plays: `out` feeds dry bus + reverb send. */
export interface Engine {
  ctx: BaseAudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02; // gentle pinking; keeps hiss soft
    d[i] = w * 0.6 + last * 6;
  }
  // normalise
  let m = 0;
  for (let i = 0; i < len; i++) m = Math.max(m, Math.abs(d[i]!));
  for (let i = 0; i < len; i++) d[i] = d[i]! / m;
  return b;
}

function makeImpulse(ctx: BaseAudioContext, seconds = 1.8, decay = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * (0.55 - 0.4 * t); // darker tail
      d[i] = lp * Math.pow(1 - t, decay) * Math.min(1, i / 400);
    }
  }
  return b;
}

/** Cleanup helper: disconnect once a source ends. */
function autoFree(src: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
  src.onended = () => {
    try { src.disconnect(); } catch { /* */ }
    for (const n of nodes) try { n.disconnect(); } catch { /* */ }
  };
}

interface ToneOpts {
  t: number; f: number; dur: number; gain: number;
  f2?: number; type?: OscillatorType; a?: number; detune?: number;
  vib?: [rate: number, depthCents: number]; lp?: number;
}
/** Simple enveloped oscillator, optional pitch glide / vibrato / lowpass. */
function tone(e: Engine, o: ToneOpts) {
  const { ctx } = e;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? "sine";
  const f = o.f * cents(o.detune ?? 0);
  osc.frequency.setValueAtTime(f, o.t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2 * cents(o.detune ?? 0), o.t + o.dur * 0.85);
  const a = o.a ?? 0.006;
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.linearRampToValueAtTime(o.gain, o.t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  const extras: AudioNode[] = [];
  let tail: AudioNode = osc;
  if (o.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = o.lp; lp.Q.value = 0.5;
    osc.connect(lp); tail = lp; extras.push(lp);
  }
  tail.connect(g); g.connect(e.out);
  if (o.vib) {
    const l = ctx.createOscillator(); const lg = ctx.createGain();
    l.frequency.value = o.vib[0]; lg.gain.value = f * (cents(o.vib[1]) - 1);
    l.connect(lg); lg.connect(osc.frequency);
    l.start(o.t); l.stop(o.t + o.dur + 0.05);
    autoFree(l, lg);
  }
  osc.start(o.t); osc.stop(o.t + o.dur + 0.05);
  autoFree(osc, g, ...extras);
}

/** Glass/music-box bell: gentle FM (ratio 3) + octave shimmer partial. */
function bell(e: Engine, t: number, f: number, gain: number, dur = 1.2) {
  const { ctx } = e;
  f *= cents(rnd(-6, 6));
  const car = ctx.createOscillator(); const mod = ctx.createOscillator();
  const mg = ctx.createGain(); const g = ctx.createGain();
  car.frequency.value = f; mod.frequency.value = f * 3;
  mg.gain.setValueAtTime(f * 1.6, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.35);
  mod.connect(mg); mg.connect(car.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g);
  // octave-up shimmer, shorter
  const s = ctx.createOscillator(); const sg = ctx.createGain();
  s.frequency.value = f * 2;
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.linearRampToValueAtTime(gain * 0.18, t + 0.004);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4);
  s.connect(sg); sg.connect(g);
  g.connect(e.out);
  for (const o of [car, mod, s]) { o.start(t); o.stop(t + dur + 0.05); }
  autoFree(car, g, mg, sg); autoFree(mod); autoFree(s);
}

/** Marimba/kalimba pluck: sine + fast-decaying 4x partial + tiny tick. */
function pluck(e: Engine, t: number, f: number, gain: number, dur = 0.5, bend = 0) {
  f *= cents(rnd(-8, 8));
  tone(e, bend ? { t, f: f * (1 - bend), f2: f, dur, gain, a: 0.003 } : { t, f, dur, gain, a: 0.003 });
  tone(e, { t, f: f * 4, dur: dur * 0.18, gain: gain * 0.22, a: 0.002 });
  noise(e, { t, dur: 0.02, f: 3000, q: 1, gain: gain * 0.15, type: "bandpass" });
}

interface NoiseOpts {
  t: number; dur: number; f: number; gain: number; q?: number; f2?: number;
  type?: BiquadFilterType; a?: number;
}
function noise(e: Engine, o: NoiseOpts) {
  const { ctx } = e;
  const src = ctx.createBufferSource(); src.buffer = e.noise; src.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = o.type ?? "bandpass";
  flt.frequency.setValueAtTime(o.f, o.t);
  if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, o.t + o.dur);
  flt.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, o.t);
  g.gain.linearRampToValueAtTime(o.gain, o.t + (o.a ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
  src.connect(flt); flt.connect(g); g.connect(e.out);
  src.start(o.t, Math.random() * 1.5); src.stop(o.t + o.dur + 0.05);
  autoFree(src, flt, g);
}

/* ------------------------------------------------------------ sfx library */

let coinN = 0, coinT = 0, starN = 0, starT = 0;
const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

type SfxFn = (e: Engine, t: number) => void;

const SFX: Record<SfxName, SfxFn> = {
  tap(e, t) {
    const f = sc(pick([5, 7, 9])) * cents(rnd(-10, 10));
    tone(e, { t, f, f2: f * 0.8, dur: 0.07, gain: 0.5, a: 0.002 });
    noise(e, { t, dur: 0.03, f: 2400, q: 0.8, gain: 0.12 });
  },
  feed(e, t) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * rnd(0.11, 0.14);
      noise(e, { t: tt, dur: 0.09, f: rnd(800, 1000), f2: 380, q: 1.8, gain: 0.55, a: 0.008 });
      tone(e, { t: tt, f: rnd(220, 260), f2: 140, dur: 0.08, gain: 0.35, type: "triangle", lp: 700 });
    }
    tone(e, { t: t + 0.3, f: 330, f2: 130, dur: 0.09, gain: 0.4, a: 0.01 }); // gulp
    bell(e, t + 0.4, sc(pick([5, 7, 9])), 0.28, 0.6); // pop
  },
  play(e, t) {
    const d = pick([0, 2]);
    [0, 2, 3, 5].forEach((k, i) => {
      pluck(e, t + i * rnd(0.075, 0.09), sc(d + k), 0.34, 0.35, 0.12);
    });
    tone(e, { t, f: 200, f2: 420, dur: 0.22, gain: 0.16, type: "triangle", vib: [22, 60], lp: 900 });
  },
  clean(e, t) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.07 + rnd(0, 0.03);
      const f = 380 + i * 70 + rnd(0, 80);
      tone(e, { t: tt, f, f2: f * rnd(1.6, 2), dur: rnd(0.05, 0.08), gain: 0.32, a: 0.008 });
    }
    noise(e, { t, dur: 0.5, f: 1200, f2: 3000, q: 0.7, gain: 0.07, a: 0.15 });
    [7, 9, 11, 12].forEach((d, i) => bell(e, t + 0.5 + i * 0.07, sc(d), 0.2, 0.7));
  },
  medicine(e, t) {
    for (let i = 0; i < 2; i++)
      tone(e, { t: t + i * 0.16, f: 380, f2: 160, dur: 0.1, gain: 0.4, a: 0.01, lp: 900 });
    [3, 5, 7].forEach((d, i) => bell(e, t + 0.4 + i * 0.13, sc(d), 0.3, 1.1));
  },
  scold(e, t) {
    tone(e, { t, f: 240, f2: 105, dur: 0.38, gain: 0.55, type: "triangle", a: 0.02, lp: 600 });
    tone(e, { t: t + 0.02, f: 120, f2: 52, dur: 0.4, gain: 0.35, a: 0.03 });
  },
  refuse(e, t) {
    tone(e, { t, f: sc(3), dur: 0.13, gain: 0.42, type: "triangle", a: 0.015, lp: 1100 });
    tone(e, { t: t + 0.19, f: sc(1), dur: 0.2, gain: 0.42, type: "triangle", a: 0.015, lp: 1000 });
  },
  hatch(e, t) {
    for (let i = 0; i < 7; i++)
      noise(e, { t: t + i * 0.08 + rnd(0, 0.07), dur: rnd(0.015, 0.04), f: rnd(2500, 5000), q: 1.5, gain: rnd(0.25, 0.5), type: "highpass" });
    tone(e, { t: t + 0.2, f: 180, f2: 90, dur: 0.12, gain: 0.3 });
    [0, 2, 4, 5, 7, 9, 10].forEach((d, i) => bell(e, t + 0.65 + i * 0.09, sc(d + 2), 0.26, 0.9));
    [7, 9, 12].forEach((d) => bell(e, t + 1.4, sc(d), 0.22, 1.6));
  },
  evolve(e, t) {
    const { ctx } = e;
    // swelling pad
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 2.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    lp.connect(g); g.connect(e.out);
    for (const d of [-5, -1, 0, 2]) {
      for (const dt of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(sc(d) * cents(dt), t);
        o.frequency.exponentialRampToValueAtTime(sc(d + 3) * cents(dt), t + 2.5);
        o.connect(lp); o.start(t); o.stop(t + 3.7); autoFree(o);
      }
    }
    // ascending progression
    const prog = [[0, 2, 4], [2, 4, 7], [4, 7, 9], [7, 9, 12]];
    prog.forEach((c, i) => c.forEach((d, j) => pluck(e, t + i * 0.55 + j * 0.08, sc(d + 2), 0.26, 0.9)));
    // shimmer
    for (let i = 0; i < 22; i++) bell(e, t + 0.4 + i * 0.11 + rnd(0, 0.06), sc(pick([10, 11, 12, 14, 15])), 0.09 + i * 0.004, 0.9);
    noise(e, { t: t + 0.3, dur: 2.4, f: 3000, f2: 9000, q: 0.5, gain: 0.05, a: 1.6, type: "bandpass" });
    // arrival
    [7, 9, 12, 14].forEach((d, i) => bell(e, t + 2.4 + i * 0.03, sc(d), 0.3, 2.4));
  },
  die(e, t) {
    [7, 5, 4, 2, 0].forEach((d, i) => bell(e, t + i * 0.75, sc(d), 0.32 - i * 0.03, 2.4));
    const { ctx } = e;
    for (const d of [-5, 0, 2]) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = sc(d - (d === 2 ? 5 : 0));
      g.gain.setValueAtTime(0.0001, t + 0.5);
      g.gain.linearRampToValueAtTime(0.09, t + 2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      o.connect(g); g.connect(e.out); o.start(t + 0.5); o.stop(t + 6.1); autoFree(o, g);
    }
  },
  alarm(e, t) {
    for (let r = 0; r < 2; r++) {
      const tt = t + r * 0.55;
      pluck(e, tt, sc(7), 0.4, 0.3);
      pluck(e, tt + 0.17, sc(4), 0.4, 0.4);
    }
  },
  poke(e, t) {
    for (let i = 0; i < 3; i++) {
      const f = rnd(900, 1300) * (1 + i * 0.12);
      tone(e, { t: t + i * 0.075, f, f2: f * 1.5, dur: 0.06, gain: 0.3, a: 0.005, vib: [40, 40] });
    }
  },
  happy(e, t) {
    tone(e, { t, f: sc(4), f2: sc(8), dur: 0.16, gain: 0.4, a: 0.01, vib: [14, 20] });
    bell(e, t + 0.14, sc(9), 0.26, 0.7);
  },
  sleep(e, t) {
    [7, 4, 2].forEach((d, i) => bell(e, t + i * 0.42, sc(d) , 0.26 - i * 0.03, 1.5));
  },
  wake(e, t) {
    [2, 4, 7].forEach((d, i) => pluck(e, t + i * 0.13, sc(d), 0.36, 0.5));
  },
  milestone(e, t) {
    const seq: [number, number][] = [[0, 0], [2, 0.11], [4, 0.22], [7, 0.33], [4, 0.5], [7, 0.61], [9, 0.72]];
    seq.forEach(([d, dt]) => pluck(e, t + dt, sc(d + 2), 0.32, 0.5));
    [9, 12, 14].forEach((d) => bell(e, t + 0.95, sc(d), 0.26, 1.6));
  },
  coin(e, t) {
    const n = nowMs();
    if (n - coinT > 1500) coinN = 0;
    coinT = n;
    const d = 5 + Math.min(coinN++, 7);
    bell(e, t, sc(d), 0.34, 0.5);
    tone(e, { t, f: sc(d) * 2, dur: 0.06, gain: 0.1 });
  },
  star(e, t) {
    const n = nowMs();
    if (n - starT > 1500) starN = 0;
    starT = n;
    const d = 7 + Math.min(starN++, 6);
    bell(e, t, sc(d), 0.3, 0.9);
    bell(e, t + 0.06, sc(d + 2), 0.16, 0.7);
    noise(e, { t, dur: 0.25, f: 6000, q: 0.5, gain: 0.04, type: "highpass" });
  },
  miss(e, t) {
    tone(e, { t, f: 150, f2: 62, dur: 0.16, gain: 0.55, a: 0.004 });
    noise(e, { t, dur: 0.07, f: 300, q: 0.7, gain: 0.3, type: "lowpass" });
  },
  poop(e, t) {
    tone(e, { t, f: 180, f2: 520, dur: 0.11, gain: 0.45, a: 0.01, vib: [30, 80] });
    tone(e, { t: t + 0.1, f: 520, f2: 130, dur: 0.14, gain: 0.45, a: 0.01 });
    noise(e, { t: t + 0.12, dur: 0.1, f: 500, f2: 250, q: 2, gain: 0.25 });
    tone(e, { t: t + 0.27, f: 700, f2: 400, dur: 0.05, gain: 0.2 });
  },
  chirp(e, t) {
    voiceAt(e, t, pick(["happy", "excited", "happy"] as const), undefined, 0.8);
  },
};

/** Per-sfx trim (linear) so loudness is consistent; measured offline. */
const TRIM: Partial<Record<SfxName, number>> = {
  happy: 1.1, poke: 1.6, feed: 1.4, scold: 0.65, evolve: 0.62, miss: 0.75, clean: 1.25, sleep: 1.2, refuse: 1.2, star: 1.1, hatch: 1.05,
};
/** Reverb send per sfx (0..1). */
const WET: Partial<Record<SfxName, number>> = {
  evolve: 0.5, die: 0.6, hatch: 0.4, milestone: 0.35, sleep: 0.5, tap: 0.08, miss: 0.1, scold: 0.15, chirp: 0.25,
};

/* ------------------------------------------------------------------ voice */

export type VoiceKind = "happy" | "sad" | "grumpy" | "sleepy" | "excited";

interface Profile { base: number; speed: number; formant: number; rasp: number; whine: number; gurgle: number; }
function profileFor(species?: string): Profile {
  const s = (species ?? "").toLowerCase();
  const P = (base: number, speed: number, formant: number, rasp = 0, whine = 0, gurgle = 0): Profile =>
    ({ base, speed, formant, rasp, whine, gurgle });
  if (s.includes("baby") || s.includes("egg") || s.includes("hatchling")) return P(560, 1.25, 1.25);
  if (s.includes("placid")) return P(230, 0.7, 0.9);
  if (s.includes("feral")) return P(300, 1.0, 1.0, 0.7);
  if (s.includes("needy")) return P(430, 1.0, 1.15, 0, 1);
  if (s.includes("stoic")) return P(170, 0.8, 0.8);
  if (s.includes("insatiable")) return P(260, 0.95, 0.95, 0, 0, 1);
  return P(360, 1, 1);
}

// vowel formants F1/F2/F3 (Hz)
const VOWEL = {
  a: [800, 1200, 2600], e: [500, 1900, 2600], i: [320, 2300, 3000], o: [500, 900, 2500], u: [330, 800, 2400],
} as const;

/** Pitch contour multipliers over [0..1] of the syllable. */
type Syl = { vowel: keyof typeof VOWEL; dur: number; c: number[]; gain: number; lp?: number };
function contourFor(kind: VoiceKind): { syl: Syl[]; gap: number } {
  switch (kind) {
    case "happy": return { syl: [{ vowel: "a", dur: 0.2, c: [0.85, 1.0, 1.25], gain: 1 }, { vowel: "i", dur: 0.14, c: [1.25, 1.4, 1.2], gain: 0.8 }], gap: 0.02 };
    case "sad": return { syl: [{ vowel: "o", dur: 0.5, c: [1.15, 1.0, 0.7], gain: 0.9 }, { vowel: "u", dur: 0.4, c: [0.9, 0.8, 0.55], gain: 0.6 }], gap: 0.06 };
    case "grumpy": return { syl: [{ vowel: "o", dur: 0.16, c: [1.0, 0.8, 0.65], gain: 0.9, lp: 1400 }, { vowel: "u", dur: 0.22, c: [0.75, 0.7, 0.5], gain: 0.9, lp: 1200 }], gap: 0.05 };
    case "sleepy": return { syl: [{ vowel: "a", dur: 0.7, c: [0.8, 1.15, 0.7], gain: 0.7, lp: 1800 }], gap: 0 };
    case "excited": return { syl: [0, 1, 2].map((i) => ({ vowel: (["a", "e", "i"] as const)[i]!, dur: 0.1, c: [0.9 + i * 0.15, 1.15 + i * 0.15, 1.3 + i * 0.15], gain: 0.9 })), gap: 0.03 };
  }
}

function voiceAt(e: Engine, t0: number, kind: VoiceKind, species: string | undefined, level = 1) {
  const { ctx } = e;
  const p = profileFor(species);
  const { syl, gap } = contourFor(kind);
  let t = t0;
  const base = p.base * rnd(0.94, 1.06);
  for (const s of syl) {
    const dur = (s.dur / p.speed) * rnd(0.92, 1.08);
    const osc = ctx.createOscillator(); osc.type = "sawtooth";
    // snap base to key loosely: pick nearest pentatonic degree for consonance
    const f0 = base * s.c[0]!, f1 = base * s.c[1]!, f2 = base * s.c[2]!;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f1, t + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(f2, t + dur);
    // vibrato (whine = faster/deeper)
    const vib = ctx.createOscillator(); const vg = ctx.createGain();
    vib.frequency.value = p.whine ? 9 : 5.5;
    vg.gain.value = base * (p.whine ? 0.035 : kind === "sad" ? 0.02 : 0.008);
    vib.connect(vg); vg.connect(osc.frequency);
    // amplitude envelope (+ rasp / gurgle AM)
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.85 * s.gain * level, t + Math.min(0.03, dur * 0.3));
    amp.gain.setValueAtTime(0.85 * s.gain * level, t + dur * 0.7);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const am = ctx.createOscillator(); const amg = ctx.createGain(); const bias = ctx.createGain();
    const amDepth = p.gurgle ? 0.5 : p.rasp ? 0.35 : 0;
    const extras: AudioNode[] = [];
    let src: AudioNode = osc;
    if (amDepth || kind === "grumpy") {
      const depth = amDepth || 0.25;
      am.frequency.value = p.gurgle ? 22 : 45 + rnd(0, 20);
      amg.gain.value = depth; bias.gain.value = 1 - depth;
      const mix = ctx.createGain(); mix.gain.value = 0;
      am.connect(amg); amg.connect(mix.gain);
      const dc = ctx.createConstantSource(); dc.offset.value = 1 - depth; dc.connect(mix.gain);
      dc.start(t); dc.stop(t + dur + 0.05); autoFree(dc);
      osc.connect(mix); src = mix; extras.push(mix);
      am.start(t); am.stop(t + dur + 0.05); autoFree(am, amg, bias);
    }
    // formant bank
    const v = VOWEL[s.vowel];
    const sum = ctx.createGain(); sum.gain.value = 1;
    const gains = [1, 0.7, 0.35];
    v.forEach((fc, i) => {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
      bp.frequency.value = fc * p.formant; bp.Q.value = 6 + i * 2;
      const fg = ctx.createGain(); fg.gain.value = gains[i]! * 1.2;
      src.connect(bp); bp.connect(fg); fg.connect(sum);
      extras.push(bp, fg);
    });
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.value = s.lp ?? 3800; lp.Q.value = 0.4;
    sum.connect(lp); lp.connect(amp); amp.connect(e.out);
    extras.push(sum, lp, amp);
    if (p.rasp) noise(e, { t, dur, f: 2200, q: 1.2, gain: 0.1 * p.rasp * level, a: 0.02 });
    osc.start(t); osc.stop(t + dur + 0.05);
    vib.start(t); vib.stop(t + dur + 0.05);
    autoFree(osc, ...extras); autoFree(vib, vg);
    t += dur + gap;
  }
}

/* ---------------------------------------------------- offline (dev) render */

export async function renderOffline(
  what: { sfx: SfxName } | { voice: VoiceKind; species?: string },
  seconds = 3, sampleRate = 44100,
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
  const g = ctx.createGain();
  const name = "sfx" in what ? what.sfx : "chirp";
  g.gain.value = TRIM[name] ?? 1;
  g.connect(ctx.destination);
  const e: Engine = { ctx, out: g, noise: makeNoise(ctx) };
  if ("sfx" in what) SFX[what.sfx](e, 0.02);
  else voiceAt(e, 0.02, what.voice, what.species);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}
export const SFX_NAMES = Object.keys(SFX) as SfxName[];

/* ---------------------------------------------------------- live graph */

interface Live {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  ambBus: GainNode;
  duck: GainNode;
  verb: ConvolverNode;
  verbIn: GainNode;
  noise: AudioBuffer;
  layers: { pad: GainNode; mel: GainNode; bird: GainNode; cricket: GainNode; heart: GainNode; shim: GainNode };
  padLp: BiquadFilterNode;
  /** Weather bed: looping filtered noise (rain hiss + body, wind, thunder rumble) and a one-shot bus. */
  wx: { bus: GainNode; ticks: GainNode; hiss: GainNode; hissLp: BiquadFilterNode; body: GainNode; wind: GainNode; windBp: BiquadFilterNode; rumble: GainNode };
  timer: number | null;
}

let live: Live | null = null;
let muted = false;
let volume = 0.8;
try {
  muted = localStorage.getItem(LS_MUTE) === "1";
  const v = parseFloat(localStorage.getItem(LS_VOL) ?? "");
  if (Number.isFinite(v)) volume = clamp(v, 0, 1);
} catch { /* storage unavailable */ }

const masterTarget = () => (muted ? 0 : volume);

let amb = { timeOfDay: 0.5, asleep: false, tension: 0 };
let wxNow: { kind: WeatherKind; intensity: number; wind: number } = { kind: "clear", intensity: 0.5, wind: 0 };
let ambChanged = true;

function build(ctx: AudioContext): Live {
  const master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6;
  comp.attack.value = 0.004; comp.release.value = 0.2;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = 0.001; limiter.release.value = 0.08;
  master.connect(comp); comp.connect(limiter); limiter.connect(ctx.destination);

  const sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
  const duck = ctx.createGain(); duck.gain.value = 1;
  const ambBus = ctx.createGain(); ambBus.gain.value = 0.32;
  duck.connect(ambBus); ambBus.connect(master);

  const verbIn = ctx.createGain(); verbIn.gain.value = 1;
  const verb = ctx.createConvolver(); verb.buffer = makeImpulse(ctx);
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
  verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(master);

  const mk = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(duck); g.connect(verbIn); return g; };
  const padLp = ctx.createBiquadFilter(); padLp.type = "lowpass"; padLp.frequency.value = 900; padLp.Q.value = 0.4;
  const layers = { pad: mk(), mel: mk(), bird: mk(), cricket: mk(), heart: mk(), shim: mk() };
  padLp.connect(layers.pad);

  const noiseBuf = makeNoise(ctx);
  const wx = buildWeather(ctx, noiseBuf, master, verbIn);
  const l: Live = { ctx, master, sfxBus, ambBus, duck, verb, verbIn, noise: noiseBuf, layers, padLp, wx, timer: null };
  return l;
}

/** Weather bed. Sources loop forever at gain 0 (cheap); levels are crossfaded by applyWeather. */
function buildWeather(ctx: AudioContext, noiseBuf: AudioBuffer, master: GainNode, verbIn: GainNode): Live["wx"] {
  const bus = ctx.createGain(); bus.gain.value = 0.55; bus.connect(master);
  const send = ctx.createGain(); send.gain.value = 0.18; bus.connect(send); send.connect(verbIn);
  const loop = (): AudioBufferSourceNode => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.start(0, Math.random() * 1.8);
    return src;
  };
  const gain = (): GainNode => { const g = ctx.createGain(); g.gain.value = 0; g.connect(bus); return g; };
  // rain: airy hiss over a rounder body
  const hiss = gain(), body = gain();
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900; hp.Q.value = 0.4;
  const hissLp = ctx.createBiquadFilter(); hissLp.type = "lowpass"; hissLp.frequency.value = 5200; hissLp.Q.value = 0.3;
  loop().connect(hp); hp.connect(hissLp); hissLp.connect(hiss);
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 0.35;
  loop().connect(bp); bp.connect(body);
  // wind: a slowly wandering band with a breathing swell
  const wind = gain();
  const windBp = ctx.createBiquadFilter(); windBp.type = "bandpass"; windBp.frequency.value = 420; windBp.Q.value = 0.8;
  loop().connect(windBp); windBp.connect(wind);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
  const lfoF = ctx.createGain(); lfoF.gain.value = 170; lfo.connect(lfoF); lfoF.connect(windBp.frequency);
  const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07;
  const swell = ctx.createGain(); swell.gain.value = 0.8; swell.connect(bus);
  wind.disconnect(); wind.connect(swell);
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.3; lfo2.connect(lfoG); lfoG.connect(swell.gain);
  lfo.start(); lfo2.start();
  // storm rumble: deep, slow
  const rumble = gain();
  const rl = ctx.createBiquadFilter(); rl.type = "lowpass"; rl.frequency.value = 120; rl.Q.value = 0.6;
  loop().connect(rl); rl.connect(rumble);
  const ticks = ctx.createGain(); ticks.gain.value = 1; ticks.connect(bus);
  return { bus, ticks, hiss, hissLp, body, wind, windBp, rumble };
}

/** Target levels for the weather bed given the current weather. */
function weatherLevels() {
  const { kind, intensity: i } = wxNow;
  const w = clamp(wxNow.wind, 0, 1);
  const rain = kind === "drizzle" ? 0.22 + 0.22 * i : kind === "rain" ? 0.5 + 0.3 * i : kind === "storm" ? 0.78 + 0.22 * i : 0;
  const wind = kind === "storm" ? 0.26 + 0.22 * w : kind === "snow" ? 0.06 + 0.16 * w : kind === "clear" || kind === "cloudy" ? 0.03 * w : 0.06 * w;
  const rumble = kind === "storm" ? 0.3 + 0.35 * i : 0;
  const tickRate = kind === "drizzle" ? 2.5 : kind === "rain" ? 5 + 3 * i : kind === "storm" ? 8 + 4 * i : 0;
  const cosy = kind === "clear" ? 0 : kind === "cloudy" ? 0.25 : kind === "snow" ? 0.85 : 0.7 + 0.3 * i * (kind === "storm" ? 1 : 0.5);
  return { rain, wind, rumble, tickRate, cosy: clamp(cosy, 0, 1) };
}

/* ------------------------------------------------------- ambience engine */

const cursor = { pad: 0, mel: 0, bird: 0, cricket: 0, heart: 0, shim: 0, drip: 0 };
let melDeg = 4, melStep = 0, melPattern: boolean[] = [], padRoot = 0;

function euclid(k: number, n: number): boolean[] {
  const out: boolean[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += k; if (acc >= n) { acc -= n; out.push(true); } else out.push(false); }
  const rot = Math.floor(Math.random() * n);
  return out.map((_, i) => out[(i + rot) % n]!);
}

function layerTargets() {
  const dayness = smooth(0.3, 0.7, 0.5 - 0.5 * Math.cos(amb.timeOfDay * Math.PI * 2));
  const awake = amb.asleep ? 0 : 1;
  const ten = clamp(amb.tension, 0, 1);
  return {
    dayness,
    pad: amb.asleep ? 1 : 0.85,
    mel: awake * (0.5 + 0.5 * dayness) * (1 - 0.5 * ten),
    bird: awake * dayness * (1 - ten * 0.7),
    cricket: awake * (1 - dayness) * 0.9 + (amb.asleep ? (1 - dayness) * 0.35 : 0),
    heart: ten > 0.35 ? smooth(0.35, 1, ten) : 0,
    shim: ten > 0.2 ? smooth(0.2, 1, ten) * awake : 0,
  };
}

function weatherAdjusted() {
  const T = layerTargets(), c = weatherLevels().cosy;
  // rain and snow hush the birds and crickets and leave the pad warm and close
  return { ...T, pad: T.pad * (1 + 0.14 * c), mel: T.mel * (1 - 0.3 * c), bird: T.bird * (1 - 0.85 * c), cricket: T.cricket * (1 - 0.45 * c) };
}

function applyAmbience(L: Live) {
  const T = weatherAdjusted();
  const W = weatherLevels();
  const now = L.ctx.currentTime;
  const set = (g: GainNode, v: number, tc = 1.6) => g.gain.setTargetAtTime(v, now, tc);
  set(L.layers.pad, T.pad * 0.9); set(L.layers.mel, T.mel * 0.8);
  set(L.layers.bird, T.bird * 0.6); set(L.layers.cricket, T.cricket * 0.5);
  set(L.layers.heart, T.heart * 0.9, 0.8); set(L.layers.shim, T.shim * 0.6, 0.8);
  L.padLp.frequency.setTargetAtTime((amb.asleep ? 450 : 500 + 900 * T.dayness) * (1 - 0.25 * W.cosy), now, 2);
  const wx = L.wx;
  set(wx.hiss, W.rain * 0.2, 2.2); set(wx.body, W.rain * 0.16, 2.2);
  wx.hissLp.frequency.setTargetAtTime(3800 + 3200 * W.rain, now, 2);
  set(wx.wind, W.wind, 2.5); set(wx.rumble, W.rumble * 0.5, 2.5);
  wx.windBp.Q.setTargetAtTime(wxNow.kind === "snow" ? 0.4 : 0.8, now, 2);
  ambChanged = false;
}

function tickAmbience(L: Live) {
  const ctx = L.ctx;
  if (ctx.state !== "running") return;
  if (ambChanged) applyAmbience(L);
  const now = ctx.currentTime;
  if (muted) { for (const k of Object.keys(cursor) as (keyof typeof cursor)[]) cursor[k] = 0; return; }
  const ahead = now + 1.5;
  const T = weatherAdjusted();
  const e = (dest: GainNode): Engine => ({ ctx, out: dest, noise: L.noise });
  for (const k of Object.keys(cursor) as (keyof typeof cursor)[]) if (cursor[k] < now) cursor[k] = now + 0.05;

  // pad: slowly changing pentatonic chords, overlapping long notes
  const padLen = amb.asleep ? 9 : T.dayness > 0.5 ? 6 : 7.5;
  while (cursor.pad < ahead) {
    const t = cursor.pad;
    padRoot = clamp(padRoot + pick([-2, -1, 0, 1, 2]), -3, 3);
    const chord = [0, 2, 4].map((d) => d + padRoot);
    const oct = amb.asleep || T.dayness < 0.4 ? -5 : 0;
    const life = padLen * 1.5;
    chord.forEach((d, i) => {
      const f = sc(d + oct - 5 + (i === 2 ? 5 : 0));
      for (const dt of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = amb.asleep ? "sine" : "triangle";
        o.frequency.value = f * cents(dt + rnd(-2, 2));
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.09, t + life * 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + life);
        o.connect(g); g.connect(L.padLp);
        o.start(t); o.stop(t + life + 0.1); autoFree(o, g);
      }
    });
    cursor.pad += padLen;
  }

  // music-box melody: euclidean rhythm over 8 steps, random-walk pitch
  if (T.mel > 0.02) {
    const stepDur = amb.asleep ? 0.9 : 0.5;
    while (cursor.mel < ahead) {
      if (melStep % 8 === 0) melPattern = euclid(T.dayness > 0.5 ? 3 : 2, 8);
      if (melPattern[melStep % 8]) {
        melDeg = clamp(melDeg + pick([-2, -1, -1, 0, 1, 1, 2]), 0, 11);
        bell(e(L.layers.mel), cursor.mel + rnd(0, 0.03), sc(melDeg), 0.16, 1.6);
        if (Math.random() < 0.15) bell(e(L.layers.mel), cursor.mel + stepDur * 0.5, sc(melDeg + 2), 0.1, 1.2);
      }
      melStep++; cursor.mel += stepDur;
    }
  } else cursor.mel = ahead;

  // birds (day)
  if (T.bird > 0.05) {
    while (cursor.bird < ahead) {
      const t = cursor.bird;
      const n = 2 + Math.floor(Math.random() * 3);
      const base = pick([sc(15), sc(17), sc(19)]);
      for (let i = 0; i < n; i++) {
        tone(e(L.layers.bird), { t: t + i * 0.09, f: base * cents(rnd(-30, 30)), f2: base * rnd(1.2, 1.5), dur: 0.07, gain: 0.12, a: 0.01 });
      }
      cursor.bird += rnd(2.5, 7);
    }
  } else cursor.bird = ahead;

  // crickets (night)
  if (T.cricket > 0.05) {
    while (cursor.cricket < ahead) {
      const t = cursor.cricket;
      const f = rnd(4200, 4800);
      const pulses = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pulses; i++)
        tone(e(L.layers.cricket), { t: t + i * 0.07, f, dur: 0.04, gain: 0.05, a: 0.008 });
      cursor.cricket += rnd(0.6, 2.2);
    }
  } else cursor.cricket = ahead;

  // heartbeat (tension)
  if (T.heart > 0.02) {
    const period = 60 / (62 + amb.tension * 45);
    while (cursor.heart < ahead) {
      const t = cursor.heart;
      tone(e(L.layers.heart), { t, f: 78, f2: 52, dur: 0.16, gain: 0.5, a: 0.008 });
      tone(e(L.layers.heart), { t: t + period * 0.28, f: 70, f2: 48, dur: 0.14, gain: 0.32, a: 0.008 });
      cursor.heart += period;
    }
  } else cursor.heart = ahead;

  // raindrop ticks on the sill and glass
  const rate = weatherLevels().tickRate;
  if (rate > 0) {
    while (cursor.drip < ahead) {
      const t = cursor.drip;
      const eng = e(L.wx.ticks);
      if (Math.random() < 0.7) noise(eng, { t, dur: 0.035, f: rnd(2600, 6800), q: 5, gain: rnd(0.03, 0.08), type: "bandpass", a: 0.002 });
      else tone(eng, { t, f: rnd(1500, 3000), f2: rnd(900, 1400), dur: 0.06, gain: rnd(0.012, 0.03), a: 0.002 });
      cursor.drip += (1 / rate) * rnd(0.3, 1.7);
    }
  } else cursor.drip = ahead;

  // rising shimmer (tension): consonant pentatonic arpeggio climbing
  if (T.shim > 0.02) {
    while (cursor.shim < ahead) {
      const rise = Math.floor(amb.tension * 4);
      const d = 7 + ((cursor.shim * 2 | 0) % 5) + rise;
      bell(e(L.layers.shim), cursor.shim, sc(d), 0.07, 1.1);
      cursor.shim += rnd(0.35, 0.7) / (0.6 + amb.tension);
    }
  } else cursor.shim = ahead;
}

function startTimer(L: Live) {
  if (L.timer != null) return;
  L.timer = window.setInterval(() => tickAmbience(L), 300);
}
function stopTimer(L: Live) {
  if (L.timer != null) { clearInterval(L.timer); L.timer = null; }
}

function onVisibility() {
  if (!live) return;
  if (document.hidden) { stopTimer(live); void live.ctx.suspend(); }
  else { void live.ctx.resume().then(() => { if (live) { for (const k of Object.keys(cursor) as (keyof typeof cursor)[]) cursor[k] = 0; startTimer(live); } }); }
}

/* --------------------------------------------------------------- public */

function setMaster(L: Live) {
  const now = L.ctx.currentTime;
  L.master.gain.cancelScheduledValues(now);
  L.master.gain.setTargetAtTime(masterTarget(), now, muted ? 0.03 : 0.05);
}

export const audio = {
  /** Must be called from a user gesture once; safe to call repeatedly. */
  unlock(): void {
    if (typeof window === "undefined") return;
    try {
      if (!live) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        live = build(new AC());
        document.addEventListener("visibilitychange", onVisibility);
        ambChanged = true;
      }
      if (!document.hidden) {
        void live.ctx.resume().then(() => {
          if (!live) return;
          setMaster(live);
          applyAmbience(live);
          startTimer(live);
        });
      }
    } catch { /* audio unavailable: stay silent */ }
  },

  sfx(n: SfxName): void {
    const L = live;
    if (!L || muted || L.ctx.state !== "running") return;
    const fn = SFX[n];
    if (!fn) return;
    try {
      const g = L.ctx.createGain();
      g.gain.value = TRIM[n] ?? 1;
      const send = L.ctx.createGain(); send.gain.value = WET[n] ?? 0.22;
      g.connect(L.sfxBus); g.connect(send); send.connect(L.verbIn);
      fn({ ctx: L.ctx, out: g, noise: L.noise }, L.ctx.currentTime + 0.01);
      window.setTimeout(() => { try { g.disconnect(); send.disconnect(); } catch { /* */ } }, 8000);
    } catch { /* */ }
  },

  /** Creature vocalisation. */
  voice(kind: VoiceKind, species?: string): void {
    const L = live;
    if (!L || muted || L.ctx.state !== "running") return;
    try {
      const g = L.ctx.createGain();
      const send = L.ctx.createGain(); send.gain.value = 0.25;
      g.connect(L.sfxBus); g.connect(send); send.connect(L.verbIn);
      voiceAt({ ctx: L.ctx, out: g, noise: L.noise }, L.ctx.currentTime + 0.01, kind, species);
      window.setTimeout(() => { try { g.disconnect(); send.disconnect(); } catch { /* */ } }, 4000);
    } catch { /* */ }
  },

  setMuted(m: boolean): void {
    muted = m;
    try { localStorage.setItem(LS_MUTE, m ? "1" : "0"); } catch { /* */ }
    if (live) setMaster(live);
  },

  isMuted(): boolean { return muted; },

  setVolume(v: number): void {
    volume = clamp(Number.isFinite(v) ? v : 0.8, 0, 1);
    try { localStorage.setItem(LS_VOL, String(volume)); } catch { /* */ }
    if (live) setMaster(live);
  },

  /** Briefly lower the ambience under a big moment. */
  duck(ms: number): void {
    const L = live;
    if (!L) return;
    const now = L.ctx.currentTime;
    const p = L.duck.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(0.2, now, 0.06);
    p.setTargetAtTime(1, now + Math.max(0.1, ms / 1000), 0.5);
  },

  /**
   * Weather bed: rain / storm / snow-wind under the ambience, crossfaded over a couple of seconds.
   * Cheap and idempotent: call it as often as you like. `wind` (0-1) is optional.
   */
  setWeather(kind: WeatherKind, intensity: number, wind = 0): void {
    const i = clamp(Number.isFinite(intensity) ? intensity : 0.5, 0, 1);
    const w = clamp(Number.isFinite(wind) ? wind : 0, 0, 1);
    if (kind === wxNow.kind && Math.abs(i - wxNow.intensity) < 0.03 && Math.abs(w - wxNow.wind) < 0.05) return;
    wxNow = { kind, intensity: i, wind: w };
    ambChanged = true;
    if (live && live.ctx.state === "running") applyAmbience(live);
  },

  /** One clap of thunder (intensity 0-1): a crack, then a long rolling rumble. Call when the lightning's delay is up. */
  thunder(intensity = 0.7): void {
    const L = live;
    if (!L || muted || L.ctx.state !== "running") return;
    try {
      const i = clamp(intensity, 0.1, 1);
      const g = L.ctx.createGain();
      g.gain.value = 0.9;
      const send = L.ctx.createGain(); send.gain.value = 0.4;
      g.connect(L.wx.bus); g.connect(send); send.connect(L.verbIn);
      const e: Engine = { ctx: L.ctx, out: g, noise: L.noise };
      const t = L.ctx.currentTime + 0.01;
      noise(e, { t, dur: 0.22, f: 3200, f2: 500, q: 0.7, gain: 0.34 * i, type: "bandpass", a: 0.004 });
      noise(e, { t: t + 0.03, dur: 3.4 + 2 * i, f: 380, f2: 45, q: 0.5, gain: 0.85 * i, type: "lowpass", a: 0.18 });
      noise(e, { t: t + 0.55, dur: 3 + 1.5 * i, f: 240, f2: 40, q: 0.5, gain: 0.55 * i, type: "lowpass", a: 0.4 });
      tone(e, { t: t + 0.05, f: 58, f2: 30, dur: 2.8, gain: 0.5 * i, a: 0.12 });
      const p = L.duck.gain, now = L.ctx.currentTime;
      p.cancelScheduledValues(now); p.setTargetAtTime(0.55, now, 0.05); p.setTargetAtTime(1, now + 1.2, 0.8);
      window.setTimeout(() => { try { g.disconnect(); send.disconnect(); } catch { /* */ } }, 9000);
    } catch { /* */ }
  },

  /** Ambient bed follows the scene: time of day, asleep, mood tension 0-1. Cheap + idempotent. */
  setAmbience(o: { timeOfDay: number; asleep: boolean; tension: number }): void {
    const td = ((o.timeOfDay % 1) + 1) % 1;
    const ten = clamp(o.tension || 0, 0, 1);
    if (Math.abs(td - amb.timeOfDay) < 0.005 && o.asleep === amb.asleep && Math.abs(ten - amb.tension) < 0.02) return;
    amb = { timeOfDay: td, asleep: o.asleep, tension: ten };
    ambChanged = true;
    if (live && live.ctx.state === "running") applyAmbience(live);
  },
};
