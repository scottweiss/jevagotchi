/**
 * What the caretaker can do. Pure state transitions on the body — how the pet
 * *feels* about any of it is Jev's call, never decided here.
 */
import { clamp, type Action, type PetState } from "./state.js";
import { MINUTE, POOP_DELAY_MINUTES } from "./physics.js";

/** Actions the pet will not accept right now, and why. */
export function refusalFor(pet: PetState, action: Action): string | null {
  if (pet.dead) return "gone";
  if (pet.asleep && action !== "wake") return "asleep";
  if (!pet.asleep && action === "wake") return "already awake";
  if (action === "medicine" && pet.meters.sickness <= 0) return "not sick";
  if (action === "feed" && pet.meters.hunger < 5) return "too full";
  if (action === "clean" && pet.meters.hygiene > 95 && pet.messes === 0) return "already clean";
  if (pet.stage === "egg") return "still an egg";
  return null;
}

const RECENT_ACTION_CAP = 16;

export function apply(pet: PetState, action: Action, now: number): PetState {
  if (refusalFor(pet, action) !== null) return pet;

  const m = { ...pet.meters };
  let { weight, asleep, timesDisciplined, careStreakStartedAt, happiness, messes, poopTimer } = pet;

  switch (action) {
    case "feed":
      m.hunger = clamp(m.hunger - 30);
      m.energy = clamp(m.energy + 3);
      weight += 2;
      happiness = clamp(happiness + 3);
      poopTimer = poopTimer === null ? POOP_DELAY_MINUTES : Math.min(poopTimer, POOP_DELAY_MINUTES);
      break;
    case "play":
      m.energy = clamp(m.energy - 8);
      m.hunger = clamp(m.hunger + 5);
      m.hygiene = clamp(m.hygiene - 3);
      weight = Math.max(1, weight - 0.5);
      // Diminishing returns: a joyful pet gains less, so play cannot be spammed into a flat 100.
      happiness = clamp(happiness + 18 * (1 - happiness / 120));
      break;
    case "clean":
      m.hygiene = 100;
      messes = 0;
      happiness = clamp(happiness + 2);
      break;
    case "sleep":
      asleep = true;
      break;
    case "wake":
      asleep = false;
      break;
    case "medicine":
      m.sickness = 0;
      m.health = clamp(m.health + 5);
      break;
    case "scold":
      timesDisciplined += 1;
      happiness = clamp(happiness - 8);
      break;
  }

  // Any attention at all restarts the care streak if the pet had been left alone.
  const last = pet.recentActions[pet.recentActions.length - 1];
  if (!last || now - last.at > 60 * MINUTE) careStreakStartedAt = now;

  return {
    ...pet,
    meters: m,
    happiness,
    messes,
    poopTimer,
    weight: Math.round(weight * 10) / 10,
    asleep,
    timesDisciplined,
    careStreakStartedAt,
    recentActions: [...pet.recentActions, { action, at: now }].slice(-RECENT_ACTION_CAP),
  };
}

/** Jev decided the pet is tipping into illness; physics takes it from there. */
export function fallIll(pet: PetState): PetState {
  if (pet.meters.sickness > 0 || pet.dead) return pet;
  return { ...pet, meters: { ...pet.meters, sickness: 12 }, timesSick: pet.timesSick + 1 };
}

/** Jev decided the pet feels abandoned. Recorded so future thinks can see the pattern. */
export function recordNeglect(pet: PetState): PetState {
  return { ...pet, neglectEvents: pet.neglectEvents + 1 };
}

/**
 * Tap-to-scoop: clear a single mess. `index` is which mess on the floor (0-based);
 * all messes are equivalent physically, so it only validates the range.
 * Not a full `clean`: it recovers some hygiene but does not reset it.
 */
export function clearMess(pet: PetState, index: number, now: number): PetState {
  if (pet.dead || pet.asleep || pet.stage === "egg") return pet;
  if (!Number.isInteger(index) || index < 0 || index >= pet.messes) return pet;
  const last = pet.recentActions[pet.recentActions.length - 1];
  return {
    ...pet,
    messes: pet.messes - 1,
    meters: { ...pet.meters, hygiene: clamp(pet.meters.hygiene + 12) },
    happiness: clamp(pet.happiness + 1),
    careStreakStartedAt: !last || now - last.at > 60 * MINUTE ? now : pet.careStreakStartedAt,
  };
}

/**
 * Extra per-think chance of falling ill from a neglected floor. Jev's own
 * `is_getting_sick` noul still applies; this only adds the physical cause it
 * can't see arithmetic for. 0 with up to two messes, then climbing.
 */
export function messSicknessChance(pet: PetState): number {
  if (pet.dead || pet.meters.sickness > 0) return 0;
  return Math.max(0, pet.messes - 2) * 0.12;
}

export interface MinigameResult { score: number; stars: 0 | 1 | 2 | 3 }

export function minigameRefusal(pet: PetState): string | null {
  const r = refusalFor(pet, "play");
  if (r) return r;
  if (pet.meters.energy < 10) return "too tired";
  return null;
}

/**
 * A finished minigame: joy up (more for more stars), body pays a little.
 * Recorded as a `play` so Jev sees the attention in the pet's history.
 */
export function applyMinigame(pet: PetState, result: MinigameResult, now: number): PetState {
  if (minigameRefusal(pet) !== null) return pet;
  const stars = Math.max(0, Math.min(3, Math.round(result.stars)));
  const m = { ...pet.meters };
  m.energy = clamp(m.energy - 6);
  m.hunger = clamp(m.hunger + 6);
  m.hygiene = clamp(m.hygiene - 2);
  const gain = (10 + stars * 8) * (1 - pet.happiness / 140);
  const last = pet.recentActions[pet.recentActions.length - 1];
  return {
    ...pet,
    meters: m,
    happiness: clamp(pet.happiness + gain),
    affection: Math.min(1, pet.affection + 0.02 * stars),
    weight: Math.max(1, Math.round((pet.weight - 0.3) * 10) / 10),
    careStreakStartedAt: !last || now - last.at > 60 * MINUTE ? now : pet.careStreakStartedAt,
    recentActions: [...pet.recentActions, { action: "play" as Action, at: now }].slice(-RECENT_ACTION_CAP),
  };
}
