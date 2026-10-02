import { describe, it, expect } from "vitest";
import { advance, MINUTE } from "../src/physics.js";
import { newEgg, type PetState } from "../src/state.js";

const T0 = 1_700_000_000_000;
const pet = (over: Partial<PetState> = {}): PetState => ({ ...newEgg(T0, "Test", "t1"), ...over });

describe("advance", () => {
  it("is exactly time-additive: one 8h jump equals 480 one-minute steps", () => {
    const start = pet();
    const oneJump = advance(start, T0 + 480 * MINUTE);

    let stepped = start;
    for (let i = 1; i <= 480; i++) stepped = advance(stepped, T0 + i * MINUTE);

    expect(oneJump.meters).toEqual(stepped.meters);
    expect(oneJump.ageMinutes).toBe(stepped.ageMinutes);
    expect(oneJump.remainderMs).toBe(stepped.remainderMs);
    expect(oneJump.dead).toBe(stepped.dead);
  });

  it("carries sub-minute remainders instead of dropping them", () => {
    let s = pet();
    for (let i = 1; i <= 120; i++) s = advance(s, T0 + i * 30_000); // 120 x 30s = 60 min
    const direct = advance(pet(), T0 + 60 * MINUTE);
    expect(s.meters).toEqual(direct.meters);
  });

  it("never moves backwards in time", () => {
    const s = advance(pet(), T0 + 10 * MINUTE);
    expect(advance(s, T0)).toEqual(s);
  });

  it("gets hungrier, dirtier and more tired while awake", () => {
    const s = advance(pet(), T0 + 60 * MINUTE);
    expect(s.meters.hunger).toBeGreaterThan(20);
    expect(s.meters.hygiene).toBeLessThan(100);
    expect(s.meters.energy).toBeLessThan(90);
  });

  it("recovers energy while asleep and burns less fuel", () => {
    const awake = advance(pet({ asleep: false }), T0 + 60 * MINUTE);
    const asleep = advance(pet({ asleep: true }), T0 + 60 * MINUTE);
    expect(asleep.meters.energy).toBeGreaterThan(90);
    expect(asleep.meters.hunger).toBeLessThan(awake.meters.hunger);
  });

  it("clamps meters into 0-100 no matter how long you disappear", () => {
    const s = advance(pet(), T0 + 90 * 24 * 60 * MINUTE); // 90 days
    for (const v of Object.values(s.meters)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("kills a neglected pet and records why", () => {
    const s = advance(pet({ meters: { hunger: 100, energy: 5, hygiene: 0, health: 8, sickness: 0 } }), T0 + 12 * 60 * MINUTE);
    expect(s.dead).toBe(true);
    expect(s.meters.health).toBe(0);
    expect(s.causeOfDeath).toBe("starvation");
    expect(s.diedAt).toBeGreaterThan(T0);
  });

  it("stops simulating once dead", () => {
    const dead = advance(pet({ meters: { hunger: 100, energy: 0, hygiene: 0, health: 1, sickness: 0 } }), T0 + 24 * 60 * MINUTE);
    const later = advance(dead, T0 + 48 * 60 * MINUTE);
    expect(later.meters).toEqual(dead.meters);
    expect(later.diedAt).toBe(dead.diedAt);
  });

  it("heals slowly when every need is met", () => {
    const s = advance(pet({ meters: { hunger: 10, energy: 90, hygiene: 95, health: 50, sickness: 0 } }), T0 + 60 * MINUTE);
    expect(s.meters.health).toBeGreaterThan(50);
  });

  it("lets an untreated illness get worse on its own", () => {
    const s = advance(pet({ meters: { hunger: 10, energy: 90, hygiene: 95, health: 90, sickness: 10 } }), T0 + 60 * MINUTE);
    expect(s.meters.sickness).toBeGreaterThan(10);
    expect(s.meters.health).toBeLessThan(90);
  });

  it("does not invent an illness on its own — that is Jev's call", () => {
    const s = advance(pet({ meters: { hunger: 100, energy: 0, hygiene: 0, health: 60, sickness: 0 } }), T0 + 60 * MINUTE);
    expect(s.meters.sickness).toBe(0);
  });

  it("burns through resources faster at high metabolism (the Jevons dividend)", () => {
    const normal = advance(pet({ metabolism: 1.0 }), T0 + 60 * MINUTE);
    const spoiled = advance(pet({ metabolism: 1.6 }), T0 + 60 * MINUTE);
    expect(spoiled.meters.hunger).toBeGreaterThan(normal.meters.hunger);
    expect(spoiled.meters.energy).toBeLessThan(normal.meters.energy);
  });

  it("does not mutate the state it is given", () => {
    const start = pet();
    const snapshot = structuredClone(start);
    advance(start, T0 + 600 * MINUTE);
    expect(start).toEqual(snapshot);
  });
});
