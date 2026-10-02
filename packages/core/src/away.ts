/**
 * Offline catch-up that is fair to the pet.
 *
 * A closed tab is not neglect you can act on, so a long absence is softened:
 *   - Up to SLEEP_GRACE_HOURS of it, the pet sleeps through (slow hunger, no
 *     poops, energy restored), then wakes.
 *   - Past that it lives on awake, but if the remaining time would kill it and the
 *     whole absence was within MERCY_HOURS, it survives barely alive instead.
 *   - Beyond MERCY_HOURS it is left to nature. Truly abandoned pets do die.
 *
 * Short gaps (a throttled background tab, a laptop lid) below AWAY_THRESHOLD_MIN
 * are plain `advance` calls, identical to before.
 */
import { advance, MINUTE } from "./physics.js";
import type { PetState } from "./state.js";

export const AWAY_THRESHOLD_MIN = 20;
export const SLEEP_GRACE_HOURS = 6;
export const MERCY_HOURS = 72;

export interface AwayReport {
  minutes: number;
  summary: string;
}

export interface CatchUp {
  pet: PetState;
  /** Set only when the gap was long enough to count as an absence. */
  away: AwayReport | null;
}

const fmtDuration = (min: number): string =>
  min < 90 ? `${Math.round(min)} minutes` : min < 60 * 36 ? `${Math.round(min / 60)} hours` : `${Math.round(min / 1440)} days`;

export function catchUp(pet: PetState, now: number): CatchUp {
  if (pet.dead) return { pet, away: null };
  const gapMs = now - pet.simulatedTo;
  const minutes = gapMs / MINUTE;
  if (minutes < AWAY_THRESHOLD_MIN) return { pet: advance(pet, now), away: null };

  const graceMs = SLEEP_GRACE_HOURS * 60 * MINUTE;
  const asleepUntil = Math.min(now, pet.simulatedTo + graceMs);

  // Phase 1: slept through. Force the sleeping physics regardless of prior state.
  let p = advance({ ...pet, asleep: true }, asleepUntil);
  // Wake up rested. The player did not choose to leave it in the dark.
  p = { ...p, asleep: false };
  // Phase 2: the rest of the absence awake.
  p = advance(p, now);

  let mercy = false;
  if (p.dead) {
    if (minutes <= MERCY_HOURS * 60) {
      mercy = true;
      p = {
        ...p,
        dead: false, diedAt: null, causeOfDeath: null,
        meters: {
          hunger: Math.min(p.meters.hunger, 92),
          energy: Math.max(p.meters.energy, 12),
          hygiene: Math.max(p.meters.hygiene, 8),
          health: 10,
          sickness: Math.min(p.meters.sickness, 40),
        },
      };
    }
  }
  p = { ...p, neglectEvents: p.neglectEvents + (minutes >= 6 * 60 ? 1 : 0) };

  return { pet: p, away: { minutes: Math.round(minutes), summary: summarize(pet, p, minutes, mercy) } };
}

function summarize(before: PetState, after: PetState, minutes: number, mercy: boolean): string {
  const parts: string[] = [];
  const gone = fmtDuration(minutes);
  if (after.dead) return `You were gone ${gone}. ${after.name} did not make it.`;
  if (mercy) return `You were gone ${gone}. ${after.name} is barely hanging on. Feed it and clean up, quickly.`;
  if (minutes <= SLEEP_GRACE_HOURS * 60) parts.push(`${after.name} slept through it`);
  else parts.push(`${after.name} slept a while, then waited`);
  if (after.messes > before.messes) parts.push(after.messes >= 3 ? "left a lot of mess" : "left a mess");
  if (after.meters.hunger - before.meters.hunger > 25) parts.push("got hungry");
  if (after.happiness < 30) parts.push("missed you");
  if (after.stage !== before.stage) parts.push("grew");
  return `You were gone ${gone}. ${parts.join(", ")}.`;
}
