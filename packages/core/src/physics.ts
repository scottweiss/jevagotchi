/**
 * Deterministic body simulation. No model, no randomness, no clock reads.
 *
 * Integrated in fixed one-minute steps so `advance` is *exactly* time-additive:
 * eight hours away produces bit-identical state to 480 one-minute ticks. That is
 * what makes offline catch-up a single cheap call instead of a replay loop.
 *
 * Physics owns the body. It never decides how the pet *feels* about the body,
 * and it never spontaneously starts an illness — those are Jev's job.
 */
import { clamp, type Meters, type PetState } from "./state.js";

export const MINUTE = 60_000;
const STEP_MS = MINUTE;

/** Hard ceiling on catch-up work: past ~90 days the pet is long dead anyway. */
const MAX_STEPS = 90 * 24 * 60;

/** Per-minute rates at metabolism 1.0. */
const RATE = {
  hungerAwake: 0.2,
  hungerAsleep: 0.07,
  energyAwake: -0.13,
  energyAsleep: 0.42,
  hygieneAwake: -0.1,
  hygieneAsleep: -0.04,
  sicknessProgression: 0.12,
  healthErosion: 0.25,
  healthRecovery: 0.08,
  /** Extra hygiene loss per minute, per uncleaned mess (awake). */
  hygienePerMess: 0.06,
  happinessAwake: -0.12,
  happinessAsleep: -0.02,
  /** Extra happiness loss while hungry, sick, or living in filth. */
  happinessHungry: -0.06,
  happinessSick: -0.08,
  happinessPerMess: -0.05,
} as const;

/** Minutes between eating and the resulting poop. */
export const POOP_DELAY_MINUTES = 18;
export const MAX_MESSES = 4;

type Distress = { starvation: number; filth: number; exhaustion: number; illness: number };

/** How badly each axis is hurting, 0-1. Shared by health erosion and cause of death. */
function distressOf(m: Meters): Distress {
  return {
    starvation: m.hunger > 80 ? (m.hunger - 80) / 20 : 0,
    filth: m.hygiene < 20 ? (20 - m.hygiene) / 20 : 0,
    exhaustion: m.energy < 15 ? (15 - m.energy) / 15 : 0,
    illness: m.sickness / 100,
  };
}

function worstOf(d: Distress): PetState["causeOfDeath"] {
  const ranked = (Object.entries(d) as [keyof Distress, number][]).sort((a, b) => b[1] - a[1]);
  const [axis, value] = ranked[0]!;
  if (value <= 0) return "illness";
  return { starvation: "starvation", filth: "filth", exhaustion: "exhaustion", illness: "illness" }[axis] as PetState["causeOfDeath"];
}

/** Advance the pet's body to `now`. Pure: returns a new state, never mutates. */
export function advance(state: PetState, now: number): PetState {
  if (state.dead) return state;

  const elapsed = now - state.simulatedTo + state.remainderMs;
  if (elapsed < STEP_MS) {
    // Not even one whole step: bank the time and leave the body alone.
    return elapsed <= state.remainderMs ? state : { ...state, simulatedTo: now, remainderMs: elapsed };
  }

  const steps = Math.min(Math.floor(elapsed / STEP_MS), MAX_STEPS);
  const remainderMs = elapsed % STEP_MS;

  const m: Meters = { ...state.meters };
  let ageMinutes = state.ageMinutes;
  let dead = false;
  let diedAt: number | null = null;
  let causeOfDeath: PetState["causeOfDeath"] = null;

  const met = state.metabolism;
  let { happiness, messes, poopTimer } = state;

  for (let i = 0; i < steps; i++) {
    ageMinutes += 1;

    if (state.asleep) {
      m.hunger = clamp(m.hunger + RATE.hungerAsleep * met);
      m.energy = clamp(m.energy + RATE.energyAsleep);
      m.hygiene = clamp(m.hygiene + RATE.hygieneAsleep * met);
    } else {
      m.hunger = clamp(m.hunger + RATE.hungerAwake * met);
      m.energy = clamp(m.energy + RATE.energyAwake * met);
      m.hygiene = clamp(m.hygiene + (RATE.hygieneAwake - RATE.hygienePerMess * messes) * met);
    }

    // Digestion: a poop lands on a schedule, only while awake.
    if (poopTimer !== null && !state.asleep) {
      poopTimer -= 1;
      if (poopTimer <= 0) {
        messes = Math.min(MAX_MESSES, messes + 1);
        poopTimer = null;
      }
    }

    // Joy drains with time and with discomfort.
    let dh = state.asleep ? RATE.happinessAsleep : RATE.happinessAwake;
    if (!state.asleep) {
      if (m.hunger > 70) dh += RATE.happinessHungry;
      if (m.sickness > 0) dh += RATE.happinessSick;
      dh += RATE.happinessPerMess * messes;
    }
    happiness = clamp(happiness + dh);

    // An illness already underway deepens until it is treated.
    if (m.sickness > 0) m.sickness = clamp(m.sickness + RATE.sicknessProgression);

    const d = distressOf(m);
    const total = d.starvation + d.filth + d.exhaustion + d.illness;

    if (total > 0) {
      m.health = clamp(m.health - total * RATE.healthErosion);
    } else if (m.health < 100) {
      m.health = clamp(m.health + RATE.healthRecovery);
    }

    if (m.health <= 0) {
      dead = true;
      diedAt = state.simulatedTo + (i + 1) * STEP_MS;
      causeOfDeath = worstOf(d);
      break;
    }
  }

  return {
    ...state,
    meters: m,
    happiness,
    messes,
    poopTimer,
    ageMinutes,
    simulatedTo: now,
    remainderMs: dead ? 0 : remainderMs,
    dead,
    diedAt,
    causeOfDeath,
  };
}
