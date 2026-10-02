/**
 * Shared contracts between the parallel workstreams. Types only — no behaviour.
 * Each module owner implements their side; nobody edits this file without
 * reason (additive changes only, and say so in your report).
 */
import type { Action, Mood, Species, Stage, Want, Weather } from "@jevagotchi/core";

/* ---- creatures/ (art) --------------------------------------------------- */

export type CreatureReaction =
  | "eat" | "play" | "scold" | "medicine" | "clean" | "poke"
  | "hatch" | "evolve" | "happy" | "refuse" | "die";

export interface CreatureParams {
  species: Species;
  stage: Stage;
  /** "dead" renders a ghost/fade-out pose instead of a live creature. */
  mood: Mood | "dead";
  asleep: boolean;
  sick: boolean;
  /** 0-100, hunger is bad when high. Drives belly/posture. */
  hunger: number;
  energy: number;
  hygiene: number;
  /** 0-1: how insistently it wants something; drives fidgeting. */
  urgency: number;
  want: Want;
  /** True when Jev is undecided: eyes wander, expression wavers. */
  hesitant: boolean;
  /** Where the creature should look, in world px relative to its own centre. */
  gaze: { x: number; y: number } | null;
  /** 0-1 seed-ish personality so two blobs of one species differ a little. */
  hueShift: number;
}

/** Additive: ids of worn items per slot. */
export interface Accessories { hat?: string; face?: string; neck?: string; held?: string }

export interface CreatureView {
  /** Advance animation. dt in seconds (clamped by caller to <= 0.05). */
  update(dt: number, p: CreatureParams): void;
  /** Draw centred at (cx, cy) where the resting body is ~`size` px tall. Canvas is already DPR-scaled. */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void;
  /** Fire a one-shot animation (squash, chew, recoil, glow...). */
  react(r: CreatureReaction): void;
  /** Hit-test in the same coordinate space as draw(), for poking. */
  contains(px: number, py: number, cx: number, cy: number, size: number): boolean;
  /** Additive: what the creature is wearing/holding. Ids come from core's wardrobe catalogue; unknown ids draw nothing. */
  setAccessories?(acc: Accessories): void;
  /** Emits particles/sfx hints back to the scene ("blink" etc. not needed). */
  onEmit?: (e: { kind: "sparkle" | "heart" | "sweat" | "zzz" | "steam" | "note" | "star"; x: number; y: number }) => void;
}

/* ---- scene/ (world) ----------------------------------------------------- */

export interface SceneFrame {
  params: CreatureParams;
  /** Poop / mess count on the floor (0-4). */
  messes: number;
  /** Ambient light: 0 midnight .. 0.5 noon, from the real clock. */
  timeOfDay: number;
  /** Lights switched off by the player. */
  lightsOff: boolean;
  /** Short line the creature "says", shown in a bubble; null for none. */
  speech: string | null;
  /** Currently-active alarm/want icon for the thought bubble. */
  wantIcon: Want | null;
  name: string;
  /** Additive: the room's dressing (wallpaper, rug, lamp, wall art ids). Absent = the default room. */
  room?: { wallpaper?: string; rug?: string; lamp?: string; wall?: string };
  /** Additive: what the creature wears; forwarded to CreatureView.setAccessories. */
  accessories?: Accessories;
  /** Additive: weather override (dev/tests). Stage derives it from the real date when omitted. */
  weather?: Weather;
}

/* ---- game events (game.ts emits, UI/scene/audio consume) ---------------- */

export type GameEvent =
  | { type: "action"; action: Action }
  | { type: "refused"; action: Action; reason: string }
  | { type: "hatched"; species: Species }
  | { type: "evolved"; from: Species; to: Species; stage: Stage }
  | { type: "died"; cause: NonNullable<import("@jevagotchi/core").PetState["causeOfDeath"]> }
  | { type: "fell-ill" }
  | { type: "recovered" }
  | { type: "mess" }
  | { type: "born"; name: string }
  | { type: "minigame-result"; game: string; score: number; stars: 0 | 1 | 2 | 3; /** wardrobe stars paid for the round */ earned?: number }
  | { type: "milestone"; id: string; title: string; text: string; /** wardrobe stars gifted with it */ stars?: number }
  | { type: "stars"; amount: number; reason: "care-streak" };

/* ---- audio.ts ------------------------------------------------------------ */

export type SfxName =
  | "tap" | "feed" | "play" | "clean" | "medicine" | "scold" | "refuse"
  | "hatch" | "evolve" | "die" | "alarm" | "poke" | "happy" | "sleep" | "wake"
  | "milestone" | "coin" | "miss" | "star" | "poop" | "chirp";

/* ---- minigames/ ----------------------------------------------------------- */

export interface MinigameContext {
  /** Host element to mount into (fills it). */
  host: HTMLElement;
  species: Species;
  mood: Mood;
  /** Called exactly once when finished or abandoned (score 0). */
  done: (result: { score: number; stars: 0 | 1 | 2 | 3 }) => void;
  sfx: (n: SfxName) => void;
}
