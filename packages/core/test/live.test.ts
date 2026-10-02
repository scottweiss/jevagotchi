/**
 * Contract test against the real Jev API. Skipped unless TYPESAFE_API_KEY is set,
 * so the normal suite stays offline and fast:  npm test
 * Run it deliberately with:                    npm run test:live
 *
 * It exists to catch the things unit tests structurally cannot: the real question
 * set being accepted, every answer coming back, and the response shape still
 * matching what interpret.ts assumes. It also records fixtures for the unit tests.
 */
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { QUESTIONS, buildPsycheState } from "../src/psyche.js";
import { interpret, type RawAnswers } from "../src/interpret.js";
import { makeRng } from "../src/rng.js";
import { newEgg, type PetState } from "../src/state.js";
import { advance, MINUTE } from "../src/physics.js";

if (!process.env.TYPESAFE_API_KEY) {
  // Loud on purpose: a silently skipped contract test reports success and is worse
  // than no test at all. `npm test` excludes this file; `npm run test:live` loads .env.
  console.warn("\n  !! live Jev contract test SKIPPED — TYPESAFE_API_KEY is not set\n");
}
const live = process.env.TYPESAFE_API_KEY ? describe : describe.skip;
const T0 = Date.now();

/** A pet abandoned for five hours: the state the design most needs to get right. */
function neglectedChild(): PetState {
  const pet: PetState = {
    ...newEgg(T0 - 300 * MINUTE, "Blobule", "live-1"),
    species: "blobule",
    stage: "child",
    recentActions: [{ action: "play", at: T0 - 302 * MINUTE }],
    neglectEvents: 3,
    timesSick: 1,
  };
  return advance(pet, T0);
}

live("live Jev contract", () => {
  const client = new TypeSafeClient({ timeout: 20_000 });

  it("answers the full question set, and interpret can read it", async () => {
    const pet = neglectedChild();
    const state = buildPsycheState(pet, T0);

    const started = performance.now();
    const result = await client.systemOne({ state, questions: QUESTIONS });
    const latencyMs = Math.round(performance.now() - started);

    // Every question we asked came back.
    for (const id of Object.keys(QUESTIONS)) {
      expect(result.answers, `missing answer: ${id}`).toHaveProperty(id);
    }

    // The invariants interpret.ts leans on.
    for (const [id, a] of Object.entries(result.answers as Record<string, any>)) {
      if (a.type === "noul") {
        expect(a.noul, id).toBeGreaterThanOrEqual(0);
        expect(a.noul, id).toBeLessThanOrEqual(1);
      } else {
        const sum = Object.values(a.probabilities as Record<string, number>).reduce((s, v) => s + v, 0);
        expect(sum, `${id} probabilities must sum to 1`).toBeCloseTo(1, 2);
        expect(a.confidence, id).toBeGreaterThanOrEqual(0);
        expect(a.confidence, id).toBeLessThanOrEqual(1);
      }
      if (a.type === "score") {
        const levels = Object.keys(a.legend).length;
        expect(a.score, `${id} score must be an index into its rubric`).toBeGreaterThanOrEqual(0);
        expect(a.score, id).toBeLessThanOrEqual(levels - 1);
      }
    }

    // The boundary layer handles a real response with nothing degraded.
    const behavior = interpret(result.answers as unknown as RawAnswers, state, makeRng(1));
    expect(behavior.degraded).toEqual([]);

    // And it read the situation correctly: this pet is in a bad way.
    expect(behavior.careEfficiency).toBeLessThan(0.5);
    expect(behavior.urgency).toBeGreaterThan(0.4);

    mkdirSync(new URL("./fixtures/", import.meta.url).pathname, { recursive: true });
    writeFileSync(
      new URL("./fixtures/neglected-child.json", import.meta.url).pathname,
      JSON.stringify({ state, answers: result.answers, model: result.model, usage: result.usage, latencyMs }, null, 2),
    );

    console.log(`  live: model=${result.model} latency=${latencyMs}ms tokens=${result.usage.input_tokens} cost=$${((result.usage.input_tokens / 1e6) * 0.042).toFixed(8)}`);
    console.log(`  live: mood=${behavior.mood} want=${behavior.want} demeanour=${behavior.demeanour} neglected=${behavior.feelsNeglected}`);
  }, 30_000);

  it("reads a well-cared-for pet differently from a neglected one", async () => {
    const happy = advance({ ...newEgg(T0 - 300 * MINUTE, "Lucky", "live-2"), species: "blobule", stage: "child",
      meters: { hunger: 12, energy: 88, hygiene: 95, health: 100, sickness: 0 },
      recentActions: [
        { action: "feed", at: T0 - 20 * MINUTE },
        { action: "play", at: T0 - 8 * MINUTE },
        { action: "clean", at: T0 - 3 * MINUTE },
      ],
    }, T0);

    const state = buildPsycheState(happy, T0);
    const result = await client.systemOne({ state, questions: QUESTIONS });
    const behavior = interpret(result.answers as unknown as RawAnswers, state, makeRng(1));

    // The whole premise of the project: Jev distinguishes these without us writing rules.
    expect(behavior.careEfficiency).toBeGreaterThan(0.5);
    expect(behavior.feelsNeglected).toBe(false);
    console.log(`  live: cared-for -> mood=${behavior.mood} want=${behavior.want} care=${behavior.careEfficiency.toFixed(2)} affection=${behavior.affection.toFixed(2)}`);
  }, 30_000);
});
