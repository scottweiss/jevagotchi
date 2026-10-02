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

const answers = (over: Partial<RawAnswers> = {}): RawAnswers => ({
  mood: { type: "choice", choice: "happy", confidence: 0.9, probabilities: { happy: 1, content: 0, bored: 0, lonely: 0, grumpy: 0, anxious: 0, sick: 0, sleepy: 0 } },
  wants: { type: "choice", choice: "play", confidence: 0.9, probabilities: { play: 1, food: 0, sleep: 0, cleaning: 0, attention: 0, medicine: 0, nothing: 0 } },
  urgency: { type: "score", score: 3, confidence: 0.9, legend: { 0: "a", 1: "b", 2: "c", 3: "d" }, probabilities: { "3": 1 } },
  reaction: { type: "choice", choice: "pleased", confidence: 0.8, probabilities: { pleased: 1, delighted: 0, indifferent: 0, annoyed: 0, upset: 0 } },
  feels_neglected: { type: "noul", noul: 0 },
  is_overfed: { type: "noul", noul: 0 },
  is_getting_sick: { type: "noul", noul: 0 },
  affection: { type: "score", score: 2, confidence: 0.8, legend: { 0: "a", 1: "b", 2: "c", 3: "d", 4: "e" }, probabilities: { "2": 1 } },
  ready_to_evolve: { type: "noul", noul: 0 },
  evolution_direction: { type: "choice", choice: "sweet", confidence: 0.9, probabilities: { sweet: 1, feral: 0, needy: 0, stoic: 0, insatiable: 0 } },
  care_efficiency: { type: "score", score: 4, confidence: 0.8, legend: { 0: "a", 1: "b", 2: "c", 3: "d", 4: "e" }, probabilities: { "4": 1 } },
  is_spoiled: { type: "noul", noul: 0.25 },
  ...over,
});

describe("interpret", () => {
  it("normalises scores against the rubric length, not a fixed range", () => {
    const b = interpret(answers(), ctx, makeRng(1));
    expect(b.urgency).toBe(1);           // 3 of 0..3
    expect(b.affection).toBe(0.5);       // 2 of 0..4
    expect(b.careEfficiency).toBe(1);    // 4 of 0..4
  });

  it("handles a score landing between rubric levels", () => {
    const b = interpret(answers({
      affection: { type: "score", score: 1.43, confidence: 0.4, legend: { 0: "a", 1: "b", 2: "c" }, probabilities: { "0": 0, "1": 0.57, "2": 0.43 } },
    }), ctx, makeRng(1));
    expect(b.affection).toBeCloseTo(0.715, 3);
  });

  it("rolls nouls rather than thresholding them at 0.5", () => {
    let sick = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (interpret(answers({ is_getting_sick: { type: "noul", noul: 0.3 } }), ctx, makeRng(seed)).gettingSick) sick++;
    }
    // A `> 0.5` threshold would make this exactly 0. A roll makes it roughly 30%.
    expect(sick / 400).toBeGreaterThan(0.15);
    expect(sick / 400).toBeLessThan(0.45);
  });

  it("samples mood instead of taking the top label", () => {
    const split = answers({
      mood: { type: "choice", choice: "bored", confidence: 0.45, probabilities: { bored: 0.55, lonely: 0.45, happy: 0, content: 0, grumpy: 0, anxious: 0, sick: 0, sleepy: 0 } },
    });
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) seen.add(interpret(split, ctx, makeRng(seed)).mood);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is deterministic for a given seed", () => {
    const a = interpret(answers(), ctx, makeRng(77));
    const b = interpret(answers(), ctx, makeRng(77));
    expect(a).toEqual(b);
  });

  it("ignores probability key order", () => {
    const forward = interpret(answers(), ctx, makeRng(5));
    const reordered = answers({
      mood: { type: "choice", choice: "happy", confidence: 0.9, probabilities: { sleepy: 0, grumpy: 0, happy: 1, anxious: 0, sick: 0, bored: 0, lonely: 0, content: 0 } },
    });
    expect(interpret(reordered, ctx, makeRng(5)).mood).toBe(forward.mood);
  });

  it("maps confidence onto demeanour using the documented bands", () => {
    const at = (c: number) => interpret(answers({
      mood: { type: "choice", choice: "bored", confidence: c, probabilities: { bored: 0.6, lonely: 0.4, happy: 0, content: 0, grumpy: 0, anxious: 0, sick: 0, sleepy: 0 } },
    }), ctx, makeRng(2)).demeanour;
    expect(at(0.95)).toBe("decisive");
    expect(at(0.55)).toBe("hesitant");
    expect(at(0.2)).toBe("confused");
  });

  it("offers a runner-up mood only when the pet is torn", () => {
    const torn = interpret(answers({
      mood: { type: "choice", choice: "bored", confidence: 0.5, probabilities: { bored: 0.55, lonely: 0.45, happy: 0, content: 0, grumpy: 0, anxious: 0, sick: 0, sleepy: 0 } },
    }), ctx, makeRng(2));
    expect(torn.alternateMood).not.toBeNull();
    expect(torn.alternateMood).not.toBe(torn.mood);
    expect(interpret(answers(), ctx, makeRng(2)).alternateMood).toBeNull();
  });

  it("drops the speculative reaction when there is nothing to react to", () => {
    const b = interpret(answers(), { ...ctx, lastInteraction: null }, makeRng(1));
    expect(b.reaction).toBeNull();
  });

  it("refuses to evolve on a weak readiness signal", () => {
    const b = interpret(answers({ ready_to_evolve: { type: "noul", noul: 0.4 } }), ctx, makeRng(1));
    expect(b.readyToEvolve).toBe(false);
  });

  it("refuses to evolve when the model does not know what it is becoming", () => {
    const b = interpret(answers({
      ready_to_evolve: { type: "noul", noul: 0.99 },
      evolution_direction: { type: "choice", choice: "sweet", confidence: 0.2, probabilities: { sweet: 0.3, feral: 0.25, needy: 0.2, stoic: 0.15, insatiable: 0.1 } },
    }), ctx, makeRng(1));
    expect(b.readyToEvolve).toBe(false);
  });

  it("evolves on a strong, confident signal", () => {
    const b = interpret(answers({
      ready_to_evolve: { type: "noul", noul: 0.99 },
      evolution_direction: { type: "choice", choice: "feral", confidence: 0.95, probabilities: { feral: 0.95, sweet: 0.05, needy: 0, stoic: 0, insatiable: 0 } },
    }), ctx, makeRng(1));
    expect(b.readyToEvolve).toBe(true);
    expect(b.direction).toBe("feral");
  });

  it("never lets a long-shot branch decide a permanent species", () => {
    const longShot = answers({
      ready_to_evolve: { type: "noul", noul: 0.99 },
      evolution_direction: { type: "choice", choice: "feral", confidence: 0.95, probabilities: { feral: 0.95, sweet: 0.05, needy: 0, stoic: 0, insatiable: 0 } },
    });
    // Mood may vary across seeds; the creature you permanently become must not.
    for (let seed = 0; seed < 200; seed++) {
      expect(interpret(longShot, ctx, makeRng(seed)).direction).toBe("feral");
    }
  });

  it("survives a garbage response instead of crashing the pet", () => {
    const b = interpret({} as RawAnswers, ctx, makeRng(1));
    expect(b.mood).toBeTruthy();
    expect(b.want).toBeTruthy();
    expect(b.readyToEvolve).toBe(false);
  });

  it("ignores labels the model invented that we do not know about", () => {
    const b = interpret(answers({
      mood: { type: "choice", choice: "ecstatic", confidence: 0.9, probabilities: { ecstatic: 0.9, happy: 0.1 } },
    }), ctx, makeRng(1));
    expect(b.mood).toBe("happy");
  });
});
