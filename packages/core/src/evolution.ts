/**
 * Growing up. Two gates, deliberately different in kind:
 *
 *   - Hatching is pure time. An egg is not a personality yet and there is nothing
 *     for Jev to judge.
 *   - Every later stage needs BOTH a minimum age and Jev's readiness signal, so a
 *     pet that has been raised badly genuinely lags behind one that has not.
 *
 * The adult form comes from Jev's `evolution_direction`, which is argmax rather
 * than sampled — see interpret.ts. Who your pet becomes should be earned, not rolled.
 */
import type { Direction } from "./psyche.js";
import type { PetState, Species, Stage } from "./state.js";

export const HATCH_MINUTES = 3;

/** Minimum age before Jev is even consulted about the next stage. */
const MIN_AGE: Record<Stage, number> = {
  egg: HATCH_MINUTES,
  baby: 30,
  child: 120,
  teen: 360,
  adult: Infinity,
};

const NEXT_STAGE: Record<Stage, Stage | null> = {
  egg: "baby", baby: "child", child: "teen", teen: "adult", adult: null,
};

const ADULT_SPECIES: Record<Direction, Species> = {
  sweet: "placid", feral: "feral", needy: "needy", stoic: "stoic", insatiable: "insatiable",
};

export interface Evolution {
  from: { stage: Stage; species: Species };
  to: { stage: Stage; species: Species };
}

/**
 * Returns the evolution that should happen now, or null.
 * `ready` is Jev's gated readiness verdict; ignored for hatching.
 */
export function pendingEvolution(pet: PetState, ready: boolean, direction: Direction): Evolution | null {
  if (pet.dead) return null;

  const next = NEXT_STAGE[pet.stage];
  if (!next) return null;
  if (pet.ageMinutes < MIN_AGE[pet.stage]) return null;
  if (pet.stage !== "egg" && !ready) return null;

  const species: Species =
    next === "baby" ? "blobule"
    : next === "child" || next === "teen" ? "jevling"
    : ADULT_SPECIES[direction];

  return { from: { stage: pet.stage, species: pet.species }, to: { stage: next, species } };
}

export function evolve(pet: PetState, evolution: Evolution): PetState {
  return { ...pet, stage: evolution.to.stage, species: evolution.to.species };
}
