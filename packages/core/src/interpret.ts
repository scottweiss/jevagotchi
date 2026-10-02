/**
 * Jev answers -> observable behaviour. The only place that touches raw responses.
 *
 * Defensive by design, because the docs make three promises we must not lean on:
 *   - `probabilities` key order is unspecified (responses come back reordered)
 *   - score probability keys may be strings or numbers depending on SDK rekeying
 *   - `score` is a probability-weighted *mean* index, so it lands between levels
 *
 * And one thing we deliberately refuse to do: collapse a noul to a boolean with
 * `> 0.5`. A noul is a calibrated probability. Thresholding it throws away exactly
 * the thing that makes the pet feel alive, so nouls are *rolled*, not compared.
 */
import type { Rng } from "./rng.js";
import { MOODS, WANTS, REACTIONS, DIRECTIONS, type Mood, type Want, type Reaction, type Direction, type PsycheState } from "./psyche.js";

export interface RawChoice { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
export interface RawScore { type: "score"; score: number; confidence: number; legend: Record<string, unknown>; probabilities: Record<string, number> }
export interface RawNoul { type: "noul"; noul: number }
export type RawAnswer = RawChoice | RawScore | RawNoul;
export type RawAnswers = Record<string, RawAnswer>;

/** The docs' own three-band guidance. Thresholds scale with the stakes of the act. */
export const CONFIDENCE = { high: 0.7, medium: 0.4 } as const;

/** Irreversible acts need more than the default. Evolution is permanent. */
const EVOLUTION_CONFIDENCE = 0.6;
const EVOLUTION_READINESS = 0.6;

export type Demeanour = "decisive" | "hesitant" | "confused";

export interface Behavior {
  mood: Mood;
  /** The runner-up, shown only when the pet is visibly torn between two feelings. */
  alternateMood: Mood | null;
  want: Want;
  /** 0-1, normalised off the rubric length. */
  urgency: number;
  reaction: Reaction | null;
  demeanour: Demeanour;
  feelsNeglected: boolean;
  gettingSick: boolean;
  isOverfed: boolean;
  /** 0-1 signals, kept continuous for the caller to smooth into EMAs. */
  affection: number;
  careEfficiency: number;
  spoiled: number;
  readyToEvolve: boolean;
  direction: Direction;
  /**
   * Question ids whose answers were missing or unusable, so the value shown for
   * them is a fallback rather than anything Jev actually said. Empty is the normal
   * case. Surfaced instead of swallowed: a silently invented pet looks exactly like
   * a real one, which is the worst possible failure for a creature you get attached to.
   */
  degraded: string[];
}

const band = (confidence: number): Demeanour =>
  confidence >= CONFIDENCE.high ? "decisive" : confidence >= CONFIDENCE.medium ? "hesitant" : "confused";

/**
 * Restrict a response's probabilities to labels we actually know, preserving weight.
 * `ok` is false when nothing was recognisable and the uniform fallback was fabricated.
 */
function knownProbabilities<T extends string>(
  probabilities: Record<string, number> | undefined,
  allowed: readonly T[],
): { probabilities: Record<T, number>; ok: boolean } {
  const out = {} as Record<T, number>;
  let any = false;
  for (const label of allowed) {
    const v = probabilities?.[label];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[label] = v;
      any = true;
    }
  }
  // A response with nothing recognisable is a contract break, not a pet state.
  if (!any) for (const label of allowed) out[label] = 1 / allowed.length;
  return { probabilities: out, ok: any };
}

/** Most-likely known label. Used where an outcome is permanent and must not be a dice roll. */
function topLabel<T extends string>(probabilities: Record<T, number>): T {
  const ranked = (Object.entries(probabilities) as [T, number][])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return ranked[0]![0];
}

/** Second-most-likely label, used for the dithering animation. */
function runnerUp<T extends string>(probabilities: Record<T, number>, winner: T): T | null {
  const rest = (Object.entries(probabilities) as [T, number][])
    .filter(([k, v]) => k !== winner && v > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return rest[0]?.[0] ?? null;
}

/**
 * Normalise a score to 0-1 using the rubric length, per the docs' explicit guidance
 * that cross-scale comparison is the caller's job.
 */
function normalizeScore(answer: RawScore): number {
  const levels = Object.keys(answer.legend ?? {}).length || Object.keys(answer.probabilities ?? {}).length;
  const span = Math.max(1, levels - 1);
  const raw = Number.isFinite(answer.score) ? answer.score : 0;
  return Math.min(1, Math.max(0, raw / span));
}

const asChoice = (a: RawAnswer | undefined): RawChoice | null => (a?.type === "choice" ? a : null);
const asScore = (a: RawAnswer | undefined): RawScore | null => (a?.type === "score" ? a : null);
const noulOf = (a: RawAnswer | undefined): number => (a?.type === "noul" && Number.isFinite(a.noul) ? Math.min(1, Math.max(0, a.noul)) : 0);

export function interpret(answers: RawAnswers, state: PsycheState, rng: Rng): Behavior {
  const degraded: string[] = [];

  /** Reads one choice question onto its own stream, recording it if we had to guess. */
  const readChoice = <T extends string>(id: string, allowed: readonly T[]) => {
    const answer = asChoice(answers[id]);
    const { probabilities, ok } = knownProbabilities(answer?.probabilities, allowed);
    if (!answer || !ok) degraded.push(id);
    return { probabilities, confidence: answer?.confidence ?? 0, present: !!answer && ok };
  };

  const readScore = (id: string, fallback: number): number => {
    const answer = asScore(answers[id]);
    if (!answer) {
      degraded.push(id);
      return fallback;
    }
    return normalizeScore(answer);
  };

  const readNoul = (id: string): number => {
    const answer = answers[id];
    if (answer?.type !== "noul") degraded.push(id);
    return noulOf(answer);
  };

  const moodQ = readChoice("mood", MOODS);
  const mood = rng.derive("mood").sample(moodQ.probabilities);
  const demeanour = band(moodQ.confidence);

  const wantsQ = readChoice("wants", WANTS);
  const want = rng.derive("wants").sample(wantsQ.probabilities);

  const urgency = readScore("urgency", 0);

  // Speculative answer: asked every time, read only when there is something to react
  // to. Because it has its own stream, skipping it cannot disturb anything else.
  const reactionQ = readChoice("reaction", REACTIONS);
  const reaction = state.lastInteraction
    ? rng.derive("reaction").sample(reactionQ.probabilities)
    : null;
  if (!state.lastInteraction) {
    const i = degraded.indexOf("reaction");
    if (i >= 0) degraded.splice(i, 1); // Not degraded, just deliberately unused.
  }

  const affection = readScore("affection", 0.5);
  const careEfficiency = readScore("care_efficiency", 0.5);

  // Evolution is irreversible, so it needs both a strong readiness signal and a
  // model that actually knows what the pet is becoming. Nouls carry no confidence
  // of their own, so the direction question's confidence is what gates it.
  const directionQ = readChoice("evolution_direction", DIRECTIONS);
  const readiness = readNoul("ready_to_evolve");
  const readyToEvolve =
    readiness >= EVOLUTION_READINESS &&
    directionQ.confidence >= EVOLUTION_CONFIDENCE &&
    rng.derive("ready_to_evolve").chance(readiness);

  // Deliberately argmax, not sampled. Mood is transient and should vary; species is
  // permanent. Sampling here would occasionally hand the player a creature that
  // contradicts how they actually raised it, and they could never undo it.
  const direction = directionQ.present ? topLabel(directionQ.probabilities) : "sweet";

  return {
    mood,
    alternateMood: demeanour === "hesitant" ? runnerUp(moodQ.probabilities, mood) : null,
    want,
    urgency,
    reaction,
    demeanour,
    feelsNeglected: rng.derive("feels_neglected").chance(readNoul("feels_neglected")),
    gettingSick: rng.derive("is_getting_sick").chance(readNoul("is_getting_sick")),
    isOverfed: rng.derive("is_overfed").chance(readNoul("is_overfed")),
    affection,
    careEfficiency,
    spoiled: readNoul("is_spoiled"),
    readyToEvolve,
    direction,
    degraded,
  };
}
