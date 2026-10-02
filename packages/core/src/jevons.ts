/**
 * The Jevons paradox, as a mechanic.
 *
 * William Stanley Jevons observed that making coal use more efficient *increased*
 * total coal consumption. Jev is named after him, so the pet earns the same trap:
 * the better you get at keeping it satisfied, the more it consumes.
 *
 * Deliberately inert until the teen stage. Early play is a friendly, ordinary
 * virtual pet — the paradox is a twist you grow into, not a difficulty wall.
 */
import type { PetState } from "./state.js";

export const JEVONS_STAGE = "teen";
const EMA_ALPHA = 0.1;
export const METABOLISM_MIN = 1.0;
export const METABOLISM_MAX = 1.6;

const ema = (prev: number | null, next: number): number =>
  prev === null ? next : prev * (1 - EMA_ALPHA) + next * EMA_ALPHA;

export function unlocked(pet: PetState): boolean {
  return pet.stage === "teen" || pet.stage === "adult";
}

/**
 * Fold one think's efficiency and spoiling signals into the pet's long-run state.
 * Smoothed, because a single reading should never swing the whole game.
 */
export function applyJevons(pet: PetState, careEfficiency: number, spoiled: number): PetState {
  const careEfficiencyEma = ema(pet.careEfficiencyEma, careEfficiency);
  const spoiledEma = ema(pet.spoiled, spoiled);

  // Before the twist unlocks, we still *record* the signals — the pet's history is
  // what decides its adult form — but they do not touch consumption yet.
  const metabolism = unlocked(pet)
    ? METABOLISM_MIN + (METABOLISM_MAX - METABOLISM_MIN) * Math.min(1, Math.max(0, careEfficiencyEma))
    : METABOLISM_MIN;

  return { ...pet, careEfficiencyEma, spoiled: spoiledEma, metabolism };
}
