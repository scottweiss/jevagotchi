import { describe, it, expect } from "vitest";
import { interpret, type RawAnswers } from "../src/interpret.js";
import { makeRng } from "../src/rng.js";
import type { PsycheState } from "../src/psyche.js";

const ctx: PsycheState = {
  pet: { name: "T", species: "blobule", stage: "child", ageHours: 4, weight: 20 },
  body: { hunger: 50, energy: 50, hygiene: 50, health: 80, sickness: 0 },
  care: { recentActions: [], careStreakHours: 1, neglectEvents: 0, timesSick: 0, timesDisciplined: 0 },
  lastInteraction: { action: "feed", minutesAgo: 3 },
  minutesSinceYouLeft: 3,
};

const base = (over: Partial<RawAnswers> = {}): RawAnswers => ({
  mood: { type: "choice", choice: "happy", confidence: 0.9, probabilities: { happy: 1, content: 0, bored: 0, lonely: 0, grumpy: 0, anxious: 0, sick: 0, sleepy: 0 } },
  wants: { type: "choice", choice: "play", confidence: 0.9, probabilities: { play: 1, food: 0, sleep: 0, cleaning: 0, attention: 0, medicine: 0, nothing: 0 } },
  urgency: { type: "score", score: 1, confidence: 0.9, legend: { 0: "a", 1: "b", 2: "c", 3: "d" }, probabilities: { "1": 1 } },
  reaction: { type: "choice", choice: "pleased", confidence: 0.8, probabilities: { pleased: 1, delighted: 0, indifferent: 0, annoyed: 0, upset: 0 } },
  feels_neglected: { type: "noul", noul: 0.5 },
  is_overfed: { type: "noul", noul: 0.5 },
  is_getting_sick: { type: "noul", noul: 0.5 },
  affection: { type: "score", score: 2, confidence: 0.8, legend: { 0: "a", 1: "b", 2: "c", 3: "d", 4: "e" }, probabilities: { "2": 1 } },
  ready_to_evolve: { type: "noul", noul: 0.1 },
  evolution_direction: { type: "choice", choice: "sweet", confidence: 0.9, probabilities: { sweet: 1, feral: 0, needy: 0, stoic: 0, insatiable: 0 } },
  care_efficiency: { type: "score", score: 4, confidence: 0.8, legend: { 0: "a", 1: "b", 2: "c", 3: "d", 4: "e" }, probabilities: { "4": 1 } },
  is_spoiled: { type: "noul", noul: 0.25 },
  ...over,
});

describe("decision independence", () => {
  it("does not let the presence of a reaction change whether the pet gets sick", () => {
    // Identical answers; the only difference is whether there is something to react to.
    // The reaction draw must not shift the sickness draw.
    for (let seed = 0; seed < 100; seed++) {
      const withReaction = interpret(base(), ctx, makeRng(seed));
      const without = interpret(base(), { ...ctx, lastInteraction: null }, makeRng(seed));
      expect(without.gettingSick).toBe(withReaction.gettingSick);
      expect(without.feelsNeglected).toBe(withReaction.feelsNeglected);
      expect(without.isOverfed).toBe(withReaction.isOverfed);
      expect(without.mood).toBe(withReaction.mood);
      expect(without.want).toBe(withReaction.want);
    }
  });

  it("does not let the evolution short-circuit shift unrelated draws", () => {
    for (let seed = 0; seed < 100; seed++) {
      const cannotEvolve = interpret(base({ ready_to_evolve: { type: "noul", noul: 0.0 } }), ctx, makeRng(seed));
      const mightEvolve = interpret(base({ ready_to_evolve: { type: "noul", noul: 0.99 } }), ctx, makeRng(seed));
      expect(cannotEvolve.gettingSick).toBe(mightEvolve.gettingSick);
      expect(cannotEvolve.mood).toBe(mightEvolve.mood);
    }
  });

  it("keeps each noul on its own stream so they are not correlated", () => {
    let agree = 0;
    for (let seed = 0; seed < 600; seed++) {
      const b = interpret(base(), ctx, makeRng(seed));
      if (b.gettingSick === b.feelsNeglected) agree++;
    }
    // Two independent coin flips at p=0.5 agree about half the time.
    expect(agree / 600).toBeGreaterThan(0.4);
    expect(agree / 600).toBeLessThan(0.6);
  });

  it("still honours each noul's probability", () => {
    let sick = 0;
    for (let seed = 0; seed < 800; seed++) {
      if (interpret(base({ is_getting_sick: { type: "noul", noul: 0.25 } }), ctx, makeRng(seed)).gettingSick) sick++;
    }
    expect(sick / 800).toBeGreaterThan(0.17);
    expect(sick / 800).toBeLessThan(0.33);
  });
});

describe("degraded answers are visible, not silent", () => {
  it("reports nothing degraded on a clean response", () => {
    expect(interpret(base(), ctx, makeRng(1)).degraded).toEqual([]);
  });

  it("flags a question whose labels we do not recognise", () => {
    const b = interpret(base({
      mood: { type: "choice", choice: "ecstatic", confidence: 0.9, probabilities: { ecstatic: 0.7, elated: 0.3 } },
    }), ctx, makeRng(1));
    expect(b.degraded).toContain("mood");
  });

  it("flags a missing question rather than inventing a confident pet", () => {
    const partial = base();
    delete (partial as Record<string, unknown>)["wants"];
    expect(interpret(partial, ctx, makeRng(1)).degraded).toContain("wants");
  });

  it("flags every broken question when the whole response is garbage", () => {
    const b = interpret({} as RawAnswers, ctx, makeRng(1));
    expect(b.degraded).toEqual(expect.arrayContaining(["mood", "wants"]));
  });
});
