/**
 * Species design data. Everything numeric here is lerped when a creature evolves,
 * so the silhouette morphs instead of popping. Units: body height ~100, origin at body centre.
 */
import type { Species } from "@jevagotchi/core";
import { hexToHsl, type HSL } from "./math.js";

export interface Shape {
  rx: number; ry: number;
  /** superellipse exponents for the upper / lower halves (2 = ellipse, 4 = squircle) */
  nTop: number; nBot: number;
  /** >0 wider at the bottom (pear), <0 wider at the top (shoulders) */
  pear: number;
  /** soft lumps on top of the head (cloud bun) */
  lump: number;
  /** top-heavy taper toward a point (egg) */
  point: number;
}

export interface FaceDef {
  /** half distance between eyes, eye centre y, eye radii */
  eyeSp: number; eyeY: number; eyeRx: number; eyeRy: number;
  /** 0 glossy-dark eye, 1 white sclera with pupil */
  scl: number;
  /** iris size relative to eye */
  ir: number;
  /** resting upper-lid coverage (0..1) */
  lidBase: number;
  /** resting brow angle, + = angry */
  browBase: number;
  /** brow thickness (px) */
  browW: number;
  mouthY: number; mouthW: number; mouthDepth: number;
  /** 0..1 sharp fangs */
  fang: number;
  blushBase: number;
  /** tilt of eye ellipses; + = outer corners up (angry) */
  eyeTilt: number;
}

export interface SpeciesDef {
  hex: string;
  shape: Shape;
  face: FaceDef;
  /** how much the species idles: breath speed multiplier, jitter, wobble stiffness */
  breath: number;
  jitter: number;
  jelly: number;
  name: string;
}

const S = (rx: number, ry: number, nTop: number, nBot: number, pear = 0, lump = 0, point = 0): Shape => ({ rx, ry, nTop, nBot, pear, lump, point });

export const DEFS: Record<Species, SpeciesDef> = {
  egg: {
    name: "egg", hex: "#F3EEFF", breath: 0.6, jitter: 0, jelly: 0.5,
    shape: S(36, 48, 2.0, 2.2, 0.12, 0, 0.22),
    face: { eyeSp: 12, eyeY: 4, eyeRx: 6, eyeRy: 8, scl: 0, ir: 0.85, lidBase: 0, browBase: 0, browW: 3, mouthY: 20, mouthW: 10, mouthDepth: 8, fang: 0, blushBase: 0, eyeTilt: 0 },
  },
  blobule: {
    name: "blobule", hex: "#38D6B8", breath: 1.2, jitter: 0.3, jelly: 1.3,
    shape: S(43, 40, 2.35, 2.9, 0.16, 0, 0.0),
    face: { eyeSp: 15.5, eyeY: -2, eyeRx: 10.5, eyeRy: 12.5, scl: 0, ir: 0.86, lidBase: 0, browBase: 0, browW: 2.6, mouthY: 17, mouthW: 12, mouthDepth: 9, fang: 0, blushBase: 0.3, eyeTilt: 0 },
  },
  jevling: {
    name: "jevling", hex: "#C8F26B", breath: 1.0, jitter: 0.5, jelly: 1.0,
    shape: S(40, 46, 2.3, 2.7, 0.1, 0, 0.0),
    face: { eyeSp: 15, eyeY: -4, eyeRx: 9.5, eyeRy: 11.5, scl: 0, ir: 0.85, lidBase: 0, browBase: 0, browW: 2.8, mouthY: 15, mouthW: 12, mouthDepth: 9, fang: 0, blushBase: 0.3, eyeTilt: 0 },
  },
  placid: {
    name: "placid", hex: "#8FA8FF", breath: 0.55, jitter: 0.1, jelly: 1.5,
    shape: S(55, 43, 2.2, 3.4, 0.05, 1, 0.0),
    face: { eyeSp: 20, eyeY: 0, eyeRx: 9, eyeRy: 10, scl: 0, ir: 0.86, lidBase: 0.34, browBase: -0.15, browW: 2.6, mouthY: 15, mouthW: 11, mouthDepth: 8, fang: 0, blushBase: 0.55, eyeTilt: -0.05 },
  },
  feral: {
    name: "feral", hex: "#FF7A45", breath: 1.7, jitter: 1.4, jelly: 0.8,
    shape: S(43, 47, 2.6, 2.7, -0.1, 0, 0.0),
    face: { eyeSp: 17, eyeY: -5, eyeRx: 9.5, eyeRy: 8.5, scl: 1, ir: 0.6, lidBase: 0.16, browBase: 0.6, browW: 4.2, mouthY: 17, mouthW: 17, mouthDepth: 9, fang: 1, blushBase: 0.05, eyeTilt: 0.25 },
  },
  needy: {
    name: "needy", hex: "#FF8FC7", breath: 1.4, jitter: 1.0, jelly: 1.5,
    shape: S(43, 42, 2.15, 2.7, 0.12, 0, 0.0),
    face: { eyeSp: 15, eyeY: -1, eyeRx: 13.5, eyeRy: 15.5, scl: 0, ir: 0.9, lidBase: 0, browBase: -0.35, browW: 2.4, mouthY: 20, mouthW: 8, mouthDepth: 7, fang: 0, blushBase: 0.55, eyeTilt: -0.08 },
  },
  stoic: {
    name: "stoic", hex: "#5F8F9E", breath: 0.45, jitter: 0.0, jelly: 0.45,
    shape: S(50, 45, 4.4, 4.6, -0.03, 0, 0.0),
    face: { eyeSp: 18, eyeY: -3, eyeRx: 8, eyeRy: 8.5, scl: 1, ir: 0.55, lidBase: 0.38, browBase: 0.08, browW: 9, mouthY: 17, mouthW: 10, mouthDepth: 5, fang: 0, blushBase: 0, eyeTilt: 0 },
  },
  insatiable: {
    name: "insatiable", hex: "#B36BFF", breath: 0.8, jitter: 0.5, jelly: 1.6,
    shape: S(58, 47, 2.15, 2.5, 0.27, 0, 0.0),
    face: { eyeSp: 18, eyeY: -14, eyeRx: 8.5, eyeRy: 10, scl: 0, ir: 0.86, lidBase: 0, browBase: 0.05, browW: 3, mouthY: 12, mouthW: 30, mouthDepth: 16, fang: 0.15, blushBase: 0.3, eyeTilt: 0 },
  },
};

export const SHAPE_KEYS = ["rx", "ry", "nTop", "nBot", "pear", "lump", "point"] as const satisfies readonly (keyof Shape)[];
export const FACE_KEYS = ["eyeSp", "eyeY", "eyeRx", "eyeRy", "scl", "ir", "lidBase", "browBase", "browW", "mouthY", "mouthW", "mouthDepth", "fang", "blushBase", "eyeTilt"] as const satisfies readonly (keyof FaceDef)[];

export interface Palette {
  light: string; core: string; mid: string; dark: string; deep: string;
  rim: string; hi: string; belly: string; bellyEdge: string; accent: string; accentDark: string;
  base: HSL;
}

const baseCache = new Map<string, HSL>();
export function baseHsl(sp: Species): HSL {
  let b = baseCache.get(sp);
  if (!b) { b = hexToHsl(DEFS[sp].hex); baseCache.set(sp, b); }
  return b;
}
