/** Save shape and migration. Never lose a pet: unknown/old shapes are repaired, not discarded. */
import { emptyCodex, type Codex, type JournalEntry } from "./codex.js";
import { migrateWardrobe, starterWardrobe, type Wardrobe } from "./wardrobe.js";
import { newEgg, clamp, SPECIES, STAGES, type Grave, type PetState } from "./state.js";

export const SAVE_VERSION = 2;

export interface Save {
  version: number;
  pet: PetState;
  graveyard: Grave[];
  thinkCount: number;
  peakAffection: number;
  codex: Codex;
  journal: JournalEntry[];
  /** Stars, owned items, what is worn and how the room is dressed. Added after v2; old saves get defaults. */
  wardrobe: Wardrobe;
}

export const newSave = (now: number, name: string, id: string): Save => ({
  version: SAVE_VERSION,
  pet: newEgg(now, name, id),
  graveyard: [], thinkCount: 0, peakAffection: 0,
  codex: emptyCodex(), journal: [], wardrobe: starterWardrobe([]),
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Fill any missing/garbled pet fields from a fresh egg, keeping everything that is valid. */
export function migratePet(raw: unknown, now: number): PetState | null {
  if (!isObj(raw)) return null;
  const base = newEgg(now, typeof raw["name"] === "string" ? raw["name"] : "Blobule", typeof raw["id"] === "string" ? raw["id"] : `pet-${now}`);
  const rm = isObj(raw["meters"]) ? raw["meters"] : {};
  const meters = {
    hunger: clamp(num(rm["hunger"], base.meters.hunger)),
    energy: clamp(num(rm["energy"], base.meters.energy)),
    hygiene: clamp(num(rm["hygiene"], base.meters.hygiene)),
    health: clamp(num(rm["health"], base.meters.health)),
    sickness: clamp(num(rm["sickness"], base.meters.sickness)),
  };
  const merged = { ...base, ...(raw as Partial<PetState>), meters } as PetState;
  if (!(SPECIES as readonly string[]).includes(merged.species)) merged.species = base.species;
  if (!(STAGES as readonly string[]).includes(merged.stage)) merged.stage = base.stage;
  merged.happiness = clamp(num(raw["happiness"], 60));
  merged.messes = Math.max(0, Math.min(4, Math.round(num(raw["messes"], 0))));
  merged.poopTimer = typeof raw["poopTimer"] === "number" ? raw["poopTimer"] : null;
  merged.recentActions = Array.isArray(raw["recentActions"]) ? (raw["recentActions"] as PetState["recentActions"]) : [];
  merged.simulatedTo = num(raw["simulatedTo"], now);
  return merged;
}

/** Accepts a v1 or v2 save (or junk). Returns null only if there is no pet to recover. */
export function migrateSave(raw: unknown, now: number): Save | null {
  if (!isObj(raw)) return null;
  const pet = migratePet(raw["pet"], now);
  if (!pet) return null;
  const cx = isObj(raw["codex"]) ? (raw["codex"] as Partial<Codex>) : {};
  const empty = emptyCodex();
  const codex: Codex = { ...empty, ...cx };
  // v1 has no codex: seed it from what we know so early adopters don't restart their collection.
  if (!isObj(raw["codex"])) {
    if (pet.species !== "egg") codex.species = [pet.species];
    if (pet.stage === "adult") codex.adults = [pet.species];
    codex.longestLifeMinutes = Math.round(pet.ageMinutes);
    for (const g of Array.isArray(raw["graveyard"]) ? (raw["graveyard"] as Grave[]) : []) {
      codex.longestLifeMinutes = Math.max(codex.longestLifeMinutes, num(g.lifespanMinutes, 0));
    }
  }
  return {
    version: SAVE_VERSION,
    pet,
    graveyard: Array.isArray(raw["graveyard"]) ? (raw["graveyard"] as Grave[]) : [],
    thinkCount: num(raw["thinkCount"], 0),
    peakAffection: num(raw["peakAffection"], 0),
    codex,
    journal: Array.isArray(raw["journal"]) ? (raw["journal"] as JournalEntry[]).slice(-40) : [],
    wardrobe: migrateWardrobe(raw["wardrobe"], Array.isArray(codex.milestones) ? codex.milestones : []),
  };
}
