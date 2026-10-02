/** Time-of-day keyframes. timeOfDay: 0 midnight .. 0.5 noon .. 1 midnight. */
import { hex, mix, type RGB, clamp } from "./util.js";

interface Key { t: number; top: RGB; bot: RGB; amb: RGB; sun: number; star: number; lc: RGB }
const k = (t: number, top: string, bot: string, amb: string, sun: number, star: number, lc: string): Key =>
  ({ t, top: hex(top), bot: hex(bot), amb: hex(amb), sun, star, lc: hex(lc) });

const KEYS: Key[] = [
  k(0.0, "#0d0a26", "#2b2060", "#5c5ba4", 0, 1, "#9db4ff"),
  k(0.2, "#1f1a4d", "#5a3d7f", "#7a6aae", 0.05, 0.7, "#b0a8ff"),
  k(0.27, "#7f86c9", "#ffb58a", "#ffd8c2", 0.55, 0.1, "#ffb58a"),
  k(0.36, "#86c3f0", "#ffeccc", "#fff4e8", 0.9, 0, "#ffe3a8"),
  k(0.5, "#4fa9ef", "#c9ecff", "#ffffff", 1, 0, "#fff1c4"),
  k(0.64, "#78bcef", "#ffecc9", "#fff2e0", 0.9, 0, "#ffdca0"),
  k(0.72, "#7565b8", "#ff9a7a", "#ffc4ae", 0.6, 0, "#ffa070"),
  k(0.78, "#3f2e73", "#ff5c7a", "#c29ac8", 0.25, 0.35, "#ff7a8a"),
  k(0.86, "#1b1638", "#3a2a6b", "#6a68ac", 0, 0.9, "#9db4ff"),
  k(1.0, "#0d0a26", "#2b2060", "#5c5ba4", 0, 1, "#9db4ff"),
];

export interface SkyState {
  top: RGB; bot: RGB; amb: RGB; lc: RGB;
  /** 0..1 sunlight strength (drives shafts, lamp need, window dim). */
  day: number;
  star: number;
  /** Overall directional light amount (sun or moon). */
  light: number;
  /** 0..1 progress of sun / moon across the sky, or -1 when below the horizon. */
  sunU: number;
  moonU: number;
  /** Fraction of the night [0..1], for fireflies etc. */
  night: number;
}

export function makeSky(): SkyState {
  return { top: [0, 0, 0], bot: [0, 0, 0], amb: [0, 0, 0], lc: [0, 0, 0], day: 0, star: 0, light: 0, sunU: -1, moonU: -1, night: 1 };
}

export function skyAt(tod: number, o: SkyState): SkyState {
  const t = ((tod % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && t >= KEYS[i + 1]!.t) i++;
  const a = KEYS[i]!, b = KEYS[i + 1]!;
  const f = clamp((t - a.t) / (b.t - a.t));
  const e = f * f * (3 - 2 * f);
  mix(a.top, b.top, e, o.top);
  mix(a.bot, b.bot, e, o.bot);
  mix(a.amb, b.amb, e, o.amb);
  mix(a.lc, b.lc, e, o.lc);
  o.day = a.sun + (b.sun - a.sun) * e;
  o.star = a.star + (b.star - a.star) * e;
  o.light = Math.max(o.day, o.star * 0.42);
  const su = (t - 0.23) / 0.54;
  o.sunU = su >= 0 && su <= 1 ? su : -1;
  const tt = t >= 0.5 ? t : t + 1;
  const mu = (tt - 0.72) / 0.56;
  o.moonU = mu >= 0 && mu <= 1 ? mu : -1;
  o.night = clamp(1 - o.day * 1.3);
  return o;
}
