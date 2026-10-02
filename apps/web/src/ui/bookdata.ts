import { MILESTONES } from "@jevagotchi/core";
import type { Game } from "../game.js";
import type { BookView } from "./book.js";
import { duration } from "./util.js";

export function bookView(game: Game): BookView {
  const { codex, journal, graveyard, pet } = game.save;
  const discovered = new Set<string>(["egg", ...codex.species]);
  if (pet.species !== "egg") discovered.add(pet.species);
  const records: { label: string; value: string }[] = [];
  if (codex.longestLifeMinutes) records.push({ label: "Longest life", value: duration(codex.longestLifeMinutes) });
  records.push({ label: "Pets hatched", value: String(codex.totalHatched) });
  records.push({ label: "Raised to adult", value: String(codex.totalRaised) });
  records.push({ label: "Meals served", value: String(codex.totalMeals) });
  for (const [id, s] of Object.entries(codex.bestScores)) {
    records.push({ label: `Best at ${id}`, value: `${s.score}, ${s.stars} star${s.stars === 1 ? "" : "s"}` });
  }
  const done = new Set(codex.milestones);
  return {
    petName: pet.name,
    journal: journal.map((j) => ({ at: j.at, text: j.text })),
    discovered,
    records,
    milestones: MILESTONES.map((m) => ({ id: m.id, title: m.title, text: m.text, done: done.has(m.id) }))
      .sort((a, b) => Number(b.done) - Number(a.done)),
    graves: graveyard,
  };
}
