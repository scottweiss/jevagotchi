/**
 * The pet's mind, declared as data.
 *
 * One Jev request per think. Every question the pet could need goes in it and we
 * discard what we don't use — the documented "speculative fan-out" pattern, which
 * is near-free because questions are answered in parallel against the same state.
 *
 * Two rules this file exists to enforce:
 *   1. Jev is never asked to count, subtract timestamps, or do arithmetic — the docs
 *      are explicit that it is unreliable at all three. We pre-compute and hand it
 *      plain, human-legible facts.
 *   2. The state stays small. Accuracy degrades as irrelevant detail accumulates, so
 *      we filter hard here rather than dumping PetState over the wire.
 */
import type { PetState } from "./state.js";
import { MINUTE } from "./physics.js";

/** Structural mirror of @typesafe-ai/sdk's question types; core stays dependency-free. */
export type NoulQ = { type: "noul"; instructions: string };
export type ChoiceQ = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type ScoreQ = { type: "score"; instructions: string; criteria: ScoreLevels };
/** At least two rubric levels — the API rejects fewer, so encode it in the type. */
export type ScoreLevels = readonly [string, string, ...string[]];
export type AnyQ = NoulQ | ChoiceQ | ScoreQ;

const noul = (instructions: string): NoulQ => ({ type: "noul", instructions });
const choice = (instructions: string, criteria: Record<string, string>): ChoiceQ => ({ type: "choice", instructions, criteria });
const score = <const T extends ScoreLevels>(instructions: string, criteria: T): ScoreQ => ({ type: "score", instructions, criteria });

export const MOODS = ["content", "happy", "bored", "lonely", "grumpy", "anxious", "sick", "sleepy"] as const;
export const WANTS = ["food", "play", "sleep", "cleaning", "attention", "medicine", "nothing"] as const;
export const REACTIONS = ["delighted", "pleased", "indifferent", "annoyed", "upset"] as const;
export const DIRECTIONS = ["sweet", "feral", "needy", "stoic", "insatiable"] as const;

export type Mood = (typeof MOODS)[number];
export type Want = (typeof WANTS)[number];
export type Reaction = (typeof REACTIONS)[number];
export type Direction = (typeof DIRECTIONS)[number];

export const QUESTIONS = {
  mood: choice("The pet's dominant emotional state right now", {
    content: "At ease; nothing is pressing",
    happy: "Actively delighted and playful",
    bored: "Under-stimulated; wants something to happen",
    lonely: "Wants its caretaker's presence specifically",
    grumpy: "Irritable, sulking, short-tempered",
    anxious: "Unsettled and worried about being left again",
    sick: "Physically unwell and withdrawn",
    sleepy: "Low on energy and wanting to rest",
  }),

  wants: choice("What the pet most wants from its caretaker right now", {
    food: "To be fed",
    play: "To be played with",
    sleep: "To be put to bed and left to rest",
    cleaning: "To have its mess cleaned up",
    attention: "Simply to be noticed and held",
    medicine: "To be treated for an illness",
    nothing: "Nothing; it is satisfied and self-contained",
  }),

  urgency: score("How urgently the pet needs the thing it wants", [
    "It can wait indefinitely",
    "It would like it reasonably soon",
    "It needs it now",
    "Real distress; it will be harmed if ignored",
  ]),

  // Speculative: discarded when there is no `lastInteraction` to react to.
  reaction: choice("How the pet felt about the last thing its caretaker did to it, described in `lastInteraction`", {
    delighted: "Thrilled; exactly what it wanted",
    pleased: "Glad enough",
    indifferent: "Barely registered it",
    annoyed: "Mildly irritated; wrong thing or wrong moment",
    upset: "Genuinely distressed or offended by it",
  }),

  feels_neglected: noul("The pet feels neglected by its caretaker"),
  is_overfed: noul("The pet has been fed more than it needs"),
  is_getting_sick: noul("The pet's condition is about to tip over into genuine illness"),

  affection: score("How much the pet likes its caretaker, weighing its whole history in `care`", [
    "Resents them",
    "Wary of them",
    "Neutral toward them",
    "Fond of them",
    "Devoted to them",
  ]),

  ready_to_evolve: noul("The pet has grown enough, and been cared for consistently enough, to be ready to change into its next form"),

  // Speculative: only read when an evolution actually fires.
  evolution_direction: choice("Given how this pet has been raised, the kind of creature it is becoming", {
    sweet: "Gentle and trusting, shaped by steady kindness",
    feral: "Wild and self-reliant, shaped by being left alone",
    needy: "Clingy and anxious, shaped by inconsistent attention",
    stoic: "Unbothered and tough, shaped by hardship endured",
    insatiable: "Perpetually wanting, shaped by having every need met instantly",
  }),

  // The Jevons pair.
  care_efficiency: score("How skillfully and efficiently this caretaker meets this pet's needs", [
    "Neglectful; needs go unmet for long stretches",
    "Erratic; sometimes attentive, often absent",
    "Adequate; needs are met eventually",
    "Attentive; needs are met promptly",
    "Flawlessly optimised; needs are met before they are even felt",
  ]),
  is_spoiled: noul("The pet has come to expect more care than it actually needs"),
} as const satisfies Record<string, AnyQ>;

export type QuestionId = keyof typeof QUESTIONS;

/** The filtered, pre-computed view of the pet that Jev actually sees. */
export type PsycheState = {
  pet: { name: string; species: string; stage: string; ageHours: number; weight: number };
  body: { hunger: number; energy: number; hygiene: number; health: number; sickness: number; uncleanedMesses?: number };
  /** Joy, pre-digested so Jev judges boredom from a plain fact rather than doing arithmetic. */
  fun?: { happiness: number; feeling: string; minutesSinceLastPlay: number | null };
  care: {
    recentActions: { action: string; minutesAgo: number }[];
    careStreakHours: number;
    neglectEvents: number;
    timesSick: number;
    timesDisciplined: number;
  };
  lastInteraction: { action: string; minutesAgo: number } | null;
  minutesSinceYouLeft: number;
};

/** Keep the window tight: more history is worse, not better, past this point. */
const RECENT_ACTION_LIMIT = 8;

const r = (n: number, dp = 0): number => Number(n.toFixed(dp));

export function happinessWord(h: number): string {
  return h >= 80 ? "delighted" : h >= 60 ? "cheerful" : h >= 40 ? "flat" : h >= 20 ? "bored and glum" : "miserable";
}

export function buildPsycheState(pet: PetState, now: number): PsycheState {
  const minutesAgo = (t: number): number => Math.max(0, Math.round((now - t) / MINUTE));

  const recent = pet.recentActions.slice(-RECENT_ACTION_LIMIT).map((a) => ({
    action: a.action,
    minutesAgo: minutesAgo(a.at),
  }));
  const last = pet.recentActions[pet.recentActions.length - 1];
  const lastPlay = [...pet.recentActions].reverse().find((a) => a.action === "play");

  return {
    pet: {
      name: pet.name,
      species: pet.species,
      stage: pet.stage,
      ageHours: r(pet.ageMinutes / 60, 1),
      weight: r(pet.weight),
    },
    body: {
      hunger: r(pet.meters.hunger),
      energy: r(pet.meters.energy),
      hygiene: r(pet.meters.hygiene),
      health: r(pet.meters.health),
      sickness: r(pet.meters.sickness),
      uncleanedMesses: pet.messes,
    },
    fun: {
      happiness: r(pet.happiness),
      feeling: happinessWord(pet.happiness),
      minutesSinceLastPlay: lastPlay ? minutesAgo(lastPlay.at) : null,
    },
    care: {
      recentActions: recent,
      careStreakHours: r((now - pet.careStreakStartedAt) / (60 * MINUTE), 1),
      neglectEvents: pet.neglectEvents,
      timesSick: pet.timesSick,
      timesDisciplined: pet.timesDisciplined,
    },
    lastInteraction: last ? { action: last.action, minutesAgo: minutesAgo(last.at) } : null,
    minutesSinceYouLeft: last ? minutesAgo(last.at) : minutesAgo(pet.bornAt),
  };
}
