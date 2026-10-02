/**
 * Collection, milestones and the life diary. Pure data transforms; the Game
 * decides when to call them and turns the results into events.
 */
import { MINUTE } from "./physics.js";
import type { PetState, Species } from "./state.js";

export const ADULT_FORMS = ["placid", "feral", "needy", "stoic", "insatiable"] as const satisfies readonly Species[];

export interface Codex {
  /** Every species this player has seen (excluding the egg). */
  species: Species[];
  /** Adult forms discovered. */
  adults: Species[];
  /** Best result per minigame id. */
  bestScores: Record<string, { score: number; stars: number }>;
  longestLifeMinutes: number;
  /** Pets hatched, and pets that reached adulthood. */
  totalHatched: number;
  totalRaised: number;
  totalMeals: number;
  /** Milestone ids already granted; each fires once, ever. */
  milestones: string[];
}

export const emptyCodex = (): Codex => ({
  species: [], adults: [], bestScores: {}, longestLifeMinutes: 0,
  totalHatched: 0, totalRaised: 0, totalMeals: 0, milestones: [],
});

/* ---- journal ------------------------------------------------------------ */

export interface JournalEntry { at: number; text: string }
export const JOURNAL_MAX = 40;

/** Newest last. Ring buffer: the oldest lines fall off. */
export function pushJournal(journal: readonly JournalEntry[], at: number, text: string): JournalEntry[] {
  return [...journal, { at, text }].slice(-JOURNAL_MAX);
}

/* ---- milestones --------------------------------------------------------- */

export interface Milestone { id: string; title: string; text: string }

export const MILESTONES: readonly Milestone[] = [
  { id: "first-meal", title: "First meal", text: "Its very first bite." },
  { id: "first-hatch", title: "Hatched", text: "Something was in there after all." },
  { id: "first-evolution", title: "Growing up", text: "Your pet changed shape for the first time." },
  { id: "first-play", title: "Playtime", text: "You finished a game together." },
  { id: "three-stars", title: "Perfect round", text: "Three stars in a minigame." },
  { id: "first-mess", title: "Clean-up crew", text: "You scooped your first mess." },
  { id: "first-recovery", title: "Better now", text: "Medicine worked. It's back on its feet." },
  { id: "survive-1h", title: "One hour", text: "Your pet has lived for an hour." },
  { id: "care-streak", title: "Steady hands", text: "Three hours of unbroken care." },
  { id: "neglect-death", title: "A hard lesson", text: "A pet was lost to neglect. The next one will be better cared for." },
  ...ADULT_FORMS.map((s) => ({
    id: `adult-${s}`, title: `Discovered ${s}`, text: `You raised a ${s}.`,
  })),
  { id: "all-adults", title: "Completionist", text: "Every adult form discovered." },
];

/** Tags describing what just happened; the Game passes the ones that apply. */
export type MilestoneTag = "meal" | "hatch" | "evolve" | "minigame" | "three-stars" | "mess-cleared" | "recovered" | "died";

/**
 * Grant any milestones newly earned. Returns the updated codex and only the
 * milestones granted by this call, so each fires exactly once.
 */
export function checkMilestones(
  codex: Codex, pet: PetState, now: number, tags: readonly MilestoneTag[] = [],
): { codex: Codex; unlocked: Milestone[] } {
  const has = new Set(codex.milestones);
  const t = new Set(tags);
  const earned: string[] = [];
  const grant = (id: string, cond: boolean): void => { if (cond && !has.has(id)) { has.add(id); earned.push(id); } };

  grant("first-meal", t.has("meal"));
  grant("first-hatch", t.has("hatch"));
  grant("first-evolution", t.has("evolve"));
  grant("first-play", t.has("minigame"));
  grant("three-stars", t.has("three-stars"));
  grant("first-mess", t.has("mess-cleared"));
  grant("first-recovery", t.has("recovered"));
  grant("survive-1h", !pet.dead && pet.ageMinutes >= 60);
  grant("care-streak", !pet.dead && now - pet.careStreakStartedAt >= 180 * MINUTE && pet.recentActions.length > 0);
  grant("neglect-death", t.has("died") && (pet.causeOfDeath === "starvation" || pet.causeOfDeath === "filth" || pet.causeOfDeath === "exhaustion"));
  for (const s of ADULT_FORMS) grant(`adult-${s}`, pet.stage === "adult" && pet.species === s);
  grant("all-adults", ADULT_FORMS.every((s) => codex.adults.includes(s) || (pet.stage === "adult" && pet.species === s)));

  const unlocked = earned.map((id) => MILESTONES.find((m) => m.id === id)!);
  return { codex: { ...codex, milestones: [...has] }, unlocked };
}

/* ---- codex updates ------------------------------------------------------ */

export function discover(codex: Codex, species: Species, stage: PetState["stage"]): Codex {
  if (species === "egg") return codex;
  const known = codex.species.includes(species);
  const adult = stage === "adult" && !codex.adults.includes(species);
  if (known && !adult) return codex;
  return {
    ...codex,
    species: known ? codex.species : [...codex.species, species],
    adults: adult ? [...codex.adults, species] : codex.adults,
  };
}

export function recordScore(codex: Codex, game: string, score: number, stars: number): Codex {
  const best = codex.bestScores[game];
  if (best && best.score >= score) return codex;
  return { ...codex, bestScores: { ...codex.bestScores, [game]: { score, stars: Math.max(stars, best?.stars ?? 0) } } };
}

export const noteLife = (codex: Codex, minutes: number): Codex =>
  minutes > codex.longestLifeMinutes ? { ...codex, longestLifeMinutes: Math.round(minutes) } : codex;
