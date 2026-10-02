import { describe, it, expect } from "vitest";
import { apply, refusalFor, fallIll } from "../src/actions.js";
import { pendingEvolution, evolve, HATCH_MINUTES } from "../src/evolution.js";
import { applyJevons, METABOLISM_MIN, METABOLISM_MAX, unlocked } from "../src/jevons.js";
import { newEgg, type PetState } from "../src/state.js";
import { MINUTE } from "../src/physics.js";

const T0 = 1_700_000_000_000;
const pet = (over: Partial<PetState> = {}): PetState => ({ ...newEgg(T0, "T", "t"), stage: "child", species: "jevling", ...over });

describe("actions", () => {
  it("feeding fills the pet up and puts weight on", () => {
    const fed = apply(pet({ meters: { hunger: 80, energy: 50, hygiene: 50, health: 90, sickness: 0 } }), "feed", T0);
    expect(fed.meters.hunger).toBe(50);
    expect(fed.weight).toBeGreaterThan(5);
  });

  it("refuses what makes no sense, rather than silently doing nothing", () => {
    expect(refusalFor(pet({ asleep: true }), "feed")).toBe("asleep");
    expect(refusalFor(pet({ meters: { ...newEgg(T0, "T", "t").meters, sickness: 0 } }), "medicine")).toBe("not sick");
    expect(refusalFor(pet({ stage: "egg" }), "play")).toBe("still an egg");
    expect(refusalFor(pet({ dead: true }), "feed")).toBe("gone");
    expect(refusalFor(pet(), "feed")).toBeNull();
  });

  it("a refused action leaves the pet untouched", () => {
    const sleeping = pet({ asleep: true });
    expect(apply(sleeping, "feed", T0)).toBe(sleeping);
  });

  it("records what you did so future thinks can see the pattern", () => {
    const played = apply(pet(), "play", T0);
    expect(played.recentActions.at(-1)).toEqual({ action: "play", at: T0 });
  });

  it("keeps the action log bounded", () => {
    let p = pet();
    for (let i = 0; i < 50; i++) p = apply(p, "play", T0 + i * MINUTE);
    expect(p.recentActions.length).toBeLessThanOrEqual(16);
  });

  it("medicine only helps a pet that is actually ill", () => {
    const ill = fallIll(pet());
    expect(ill.meters.sickness).toBeGreaterThan(0);
    expect(ill.timesSick).toBe(1);
    expect(apply(ill, "medicine", T0).meters.sickness).toBe(0);
  });

  it("does not stack illnesses on an already-sick pet", () => {
    const ill = fallIll(pet());
    expect(fallIll(ill)).toBe(ill);
  });
});

describe("evolution", () => {
  it("hatches on time alone — an egg has no personality to judge", () => {
    const egg = pet({ stage: "egg", species: "egg", ageMinutes: HATCH_MINUTES });
    const e = pendingEvolution(egg, false, "sweet");
    expect(e?.to).toEqual({ stage: "baby", species: "blobule" });
  });

  it("will not hatch early", () => {
    expect(pendingEvolution(pet({ stage: "egg", species: "egg", ageMinutes: 1 }), true, "sweet")).toBeNull();
  });

  it("needs both age and Jev's blessing after hatching", () => {
    const old = pet({ stage: "baby", ageMinutes: 999 });
    expect(pendingEvolution(old, false, "sweet")).toBeNull();
    expect(pendingEvolution(old, true, "sweet")?.to.stage).toBe("child");
    expect(pendingEvolution(pet({ stage: "baby", ageMinutes: 5 }), true, "sweet")).toBeNull();
  });

  it("lets the adult form follow how the pet was raised", () => {
    const teen = pet({ stage: "teen", ageMinutes: 999 });
    expect(pendingEvolution(teen, true, "feral")?.to.species).toBe("feral");
    expect(pendingEvolution(teen, true, "insatiable")?.to.species).toBe("insatiable");
    expect(pendingEvolution(teen, true, "sweet")?.to.species).toBe("placid");
  });

  it("stops at adult", () => {
    expect(pendingEvolution(pet({ stage: "adult", ageMinutes: 99999 }), true, "sweet")).toBeNull();
  });

  it("never evolves a dead pet", () => {
    expect(pendingEvolution(pet({ stage: "baby", ageMinutes: 999, dead: true }), true, "sweet")).toBeNull();
  });

  it("applies the transition", () => {
    const teen = pet({ stage: "teen", ageMinutes: 999 });
    const e = pendingEvolution(teen, true, "stoic")!;
    expect(evolve(teen, e).species).toBe("stoic");
  });
});

describe("the Jevons twist", () => {
  it("stays locked before the teen stage", () => {
    expect(unlocked(pet({ stage: "child" }))).toBe(false);
    let p = pet({ stage: "child" });
    for (let i = 0; i < 100; i++) p = applyJevons(p, 1, 1);
    expect(p.metabolism).toBe(METABOLISM_MIN);
  });

  it("still records the signals while locked, so history is not lost", () => {
    const p = applyJevons(pet({ stage: "child" }), 0.9, 0.8);
    expect(p.careEfficiencyEma).toBeCloseTo(0.9, 5);
    expect(p.metabolism).toBe(METABOLISM_MIN);
  });

  it("punishes excellent care once unlocked — the paradox itself", () => {
    let flawless = pet({ stage: "teen" });
    let neglectful = pet({ stage: "teen" });
    for (let i = 0; i < 200; i++) {
      flawless = applyJevons(flawless, 1.0, 0.9);
      neglectful = applyJevons(neglectful, 0.1, 0.0);
    }
    expect(flawless.metabolism).toBeGreaterThan(neglectful.metabolism);
    expect(flawless.metabolism).toBeCloseTo(METABOLISM_MAX, 1);
  });

  it("smooths rather than lurching on a single reading", () => {
    const p = applyJevons(pet({ stage: "teen", careEfficiencyEma: 0 }), 1, 1);
    expect(p.careEfficiencyEma).toBeLessThan(0.2);
  });

  it("keeps metabolism inside its stated bounds", () => {
    let p = pet({ stage: "adult" });
    for (let i = 0; i < 500; i++) p = applyJevons(p, Math.random(), Math.random());
    expect(p.metabolism).toBeGreaterThanOrEqual(METABOLISM_MIN);
    expect(p.metabolism).toBeLessThanOrEqual(METABOLISM_MAX);
  });
});
