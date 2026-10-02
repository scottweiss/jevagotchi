/** Pure state shapes. No behaviour, no I/O — everything else operates on these. */

export const STAGES = ["egg", "baby", "child", "teen", "adult"] as const;
export type Stage = (typeof STAGES)[number];

export const SPECIES = [
  "egg", "blobule", "jevling",
  // adult branches
  "placid", "feral", "needy", "stoic", "insatiable",
] as const;
export type Species = (typeof SPECIES)[number];

export const ACTIONS = ["feed", "play", "clean", "sleep", "wake", "medicine", "scold"] as const;
export type Action = (typeof ACTIONS)[number];

/** All meters run 0-100. `hunger` and `sickness` are bad when high; the rest are bad when low. */
export interface Meters {
  hunger: number;
  energy: number;
  hygiene: number;
  health: number;
  sickness: number;
}

export interface ActionRecord {
  action: Action;
  at: number;
}

export interface PetState {
  id: string;
  name: string;
  species: Species;
  stage: Stage;

  bornAt: number;
  /** Physics has been integrated up to this instant. */
  simulatedTo: number;
  /** Sub-step remainder carried between calls so `advance` is exactly time-additive. */
  remainderMs: number;

  ageMinutes: number;
  weight: number;
  asleep: boolean;

  meters: Meters;

  /** Joy, 0-100 (higher is better). Beside `meters` so older fixtures stay valid. Driven by play, attention, minigames. */
  happiness: number;
  /** Uncleaned poops on the floor, 0-4. */
  messes: number;
  /** Minutes until the next poop lands (set by eating); null when nothing is digesting. */
  poopTimer: number | null;

  /** Jevons multiplier on consumption. Pinned at 1 until the teen stage. */
  metabolism: number;
  /** EMA of Jev's `care_efficiency`, normalised 0-1. Null until the first think. */
  careEfficiencyEma: number | null;
  /** EMA of Jev's `affection`, normalised 0-1. */
  affection: number;
  /** EMA of Jev's `is_spoiled` noul. */
  spoiled: number;

  recentActions: ActionRecord[];
  neglectEvents: number;
  timesSick: number;
  timesDisciplined: number;
  careStreakStartedAt: number;

  dead: boolean;
  diedAt: number | null;
  causeOfDeath: "starvation" | "illness" | "filth" | "exhaustion" | null;
}

export interface Grave {
  id: string;
  name: string;
  species: Species;
  stage: Stage;
  lifespanMinutes: number;
  peakAffection: number;
  causeOfDeath: PetState["causeOfDeath"];
  diedAt: number;
}

export function newEgg(now: number, name: string, id: string): PetState {
  return {
    id,
    name,
    species: "egg",
    stage: "egg",
    bornAt: now,
    simulatedTo: now,
    remainderMs: 0,
    ageMinutes: 0,
    weight: 5,
    asleep: false,
    meters: { hunger: 20, energy: 90, hygiene: 100, health: 100, sickness: 0 },
    happiness: 60,
    messes: 0,
    poopTimer: null,
    metabolism: 1,
    careEfficiencyEma: null,
    affection: 0.5,
    spoiled: 0,
    recentActions: [],
    neglectEvents: 0,
    timesSick: 0,
    timesDisciplined: 0,
    careStreakStartedAt: now,
    dead: false,
    diedAt: null,
    causeOfDeath: null,
  };
}

export const clamp = (v: number, lo = 0, hi = 100): number => (v < lo ? lo : v > hi ? hi : v);
