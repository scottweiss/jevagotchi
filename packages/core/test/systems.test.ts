import { describe, it, expect } from "vitest";
import {
  advance, apply, applyMinigame, catchUp, checkMilestones, clearMess, discover, emptyCodex, makeRng,
  messSicknessChance, migrateSave, newEgg, pushJournal, recordScore, refusalFor, speechFor, buildPsycheState,
  ALL_LINES, JOURNAL_MAX, MINUTE, POOP_DELAY_MINUTES, MAX_MESSES, SLEEP_GRACE_HOURS,
  type Behavior, type PetState,
} from "../src/index.js";

const T0 = 1_700_000_000_000;
const pet = (over: Partial<PetState> = {}): PetState => ({ ...newEgg(T0, "Pip", "p"), stage: "child", species: "jevling", ...over });
const behavior = (over: Partial<Behavior> = {}): Behavior => ({
  mood: "content", alternateMood: null, want: "nothing", urgency: 0.2, reaction: null, demeanour: "decisive",
  feelsNeglected: false, gettingSick: false, isOverfed: false, affection: 0.5, careEfficiency: 0.5, spoiled: 0,
  readyToEvolve: false, direction: "sweet", degraded: [], ...over,
});

describe("messes", () => {
  it("a meal poops after the schedule, not before", () => {
    const fed = apply(pet({ meters: { ...pet().meters, hunger: 60 } }), "feed", T0);
    expect(fed.poopTimer).toBe(POOP_DELAY_MINUTES);
    expect(advance(fed, T0 + (POOP_DELAY_MINUTES - 1) * MINUTE).messes).toBe(0);
    const later = advance(fed, T0 + (POOP_DELAY_MINUTES + 1) * MINUTE);
    expect(later.messes).toBe(1);
    expect(later.poopTimer).toBeNull();
  });
  it("does not digest while asleep", () => {
    const fed = { ...apply(pet({ meters: { ...pet().meters, hunger: 60 } }), "feed", T0), asleep: true };
    expect(advance(fed, T0 + 60 * MINUTE).messes).toBe(0);
  });
  it("caps at four and mess tanks hygiene faster", () => {
    expect(advance(pet({ messes: 4 }), T0 + 10 * MINUTE).meters.hygiene).toBeLessThan(advance(pet(), T0 + 10 * MINUTE).meters.hygiene - 1);
    const s = advance(pet({ messes: 3, poopTimer: 1 }), T0 + 5 * MINUTE);
    expect(s.messes).toBe(MAX_MESSES);
  });
  it("clean clears everything, even at full hygiene; clearMess scoops one", () => {
    expect(refusalFor(pet({ messes: 2 }), "clean")).toBeNull();
    expect(apply(pet({ messes: 2 }), "clean", T0).messes).toBe(0);
    const one = clearMess(pet({ messes: 3 }), 1, T0);
    expect(one.messes).toBe(2);
    expect(clearMess(pet({ messes: 1 }), 5, T0).messes).toBe(1);
  });
  it("ignored mess raises sickness chance", () => {
    expect(messSicknessChance(pet({ messes: 2 }))).toBe(0);
    expect(messSicknessChance(pet({ messes: 4 }))).toBeGreaterThan(0.1);
  });
});

describe("happiness", () => {
  it("decays with time, faster when hungry or messy", () => {
    const calm = advance(pet(), T0 + 60 * MINUTE).happiness;
    expect(calm).toBeLessThan(60);
    const rough = advance(pet({ messes: 3, meters: { ...pet().meters, hunger: 90 } }), T0 + 60 * MINUTE).happiness;
    expect(rough).toBeLessThan(calm);
  });
  it("play lifts it with diminishing returns; scold lowers it", () => {
    const a = apply(pet({ happiness: 30 }), "play", T0).happiness - 30;
    const b = apply(pet({ happiness: 90 }), "play", T0).happiness - 90;
    expect(a).toBeGreaterThan(b);
    expect(apply(pet({ happiness: 50 }), "scold", T0).happiness).toBeLessThan(50);
  });
  it("reaches Jev as plain facts", () => {
    const s = buildPsycheState(pet({ happiness: 12, messes: 2 }), T0);
    expect(s.fun?.feeling).toBe("miserable");
    expect(s.body.uncleanedMesses).toBe(2);
  });
  it("minigame result boosts joy by stars, costs energy and food", () => {
    const p = pet({ happiness: 40 });
    const one = applyMinigame(p, { score: 5, stars: 1 }, T0);
    const three = applyMinigame(p, { score: 30, stars: 3 }, T0);
    expect(three.happiness).toBeGreaterThan(one.happiness);
    expect(one.happiness).toBeGreaterThan(40);
    expect(one.meters.energy).toBeLessThan(p.meters.energy);
    expect(one.meters.hunger).toBeGreaterThan(p.meters.hunger);
    expect(one.recentActions.at(-1)?.action).toBe("play");
    expect(applyMinigame(pet({ asleep: true }), { score: 1, stars: 1 }, T0).happiness).toBe(60);
  });
});

describe("casual player sanity", () => {
  it("someone checking in every 10 minutes keeps a pet alive and healthy for 12 hours", () => {
    let p = pet({ stage: "teen", metabolism: 1.6 });
    for (let t = 10; t <= 720; t += 10) {
      p = advance(p, T0 + t * MINUTE);
      const now = T0 + t * MINUTE;
      if (p.asleep) { if (p.meters.energy > 85) p = apply(p, "wake", now); continue; }
      if (p.messes > 0 || p.meters.hygiene < 60) p = apply(p, "clean", now);
      if (p.meters.hunger > 50) p = apply(p, "feed", now);
      if (p.meters.energy < 35) p = apply(p, "sleep", now);
      if (p.happiness < 60 && p.meters.energy > 40) p = apply(p, "play", now);
    }
    expect(p.dead).toBe(false);
    expect(p.meters.health).toBeGreaterThan(90);
  });
});

describe("migration", () => {
  const v1 = { pet: { id: "x", name: "Old", species: "blobule", stage: "baby", bornAt: T0, simulatedTo: T0, remainderMs: 0, ageMinutes: 50, weight: 6, asleep: false,
    meters: { hunger: 30, energy: 80, hygiene: 90, health: 100, sickness: 0 }, metabolism: 1, careEfficiencyEma: null, affection: 0.7, spoiled: 0,
    recentActions: [], neglectEvents: 0, timesSick: 0, timesDisciplined: 0, careStreakStartedAt: T0, dead: false, diedAt: null, causeOfDeath: null },
    graveyard: [{ id: "g", name: "Gone", species: "feral", stage: "adult", lifespanMinutes: 500, peakAffection: 0.4, causeOfDeath: "illness", diedAt: T0 }],
    thinkCount: 9, peakAffection: 0.8 };
  it("loads an old save with new fields defaulted and nothing lost", () => {
    const s = migrateSave(v1, T0)!;
    expect(s.pet.name).toBe("Old");
    expect(s.pet.meters.hunger).toBe(30);
    expect(s.pet.happiness).toBe(60);
    expect(s.pet.messes).toBe(0);
    expect(s.graveyard).toHaveLength(1);
    expect(s.thinkCount).toBe(9);
    expect(s.codex.species).toContain("blobule");
    expect(s.codex.longestLifeMinutes).toBe(500);
    expect(s.journal).toEqual([]);
  });
  it("is idempotent and tolerates junk", () => {
    const s = migrateSave(v1, T0)!;
    expect(migrateSave(JSON.parse(JSON.stringify(s)), T0)).toEqual(s);
    expect(migrateSave(null, T0)).toBeNull();
    expect(migrateSave({ pet: { meters: { hunger: "no" }, species: "wat", messes: 99 } }, T0)!.pet.messes).toBe(4);
  });
});

describe("codex, milestones, journal", () => {
  it("fires each milestone exactly once", () => {
    let cx = emptyCodex();
    const a = checkMilestones(cx, pet(), T0, ["meal"]);
    expect(a.unlocked.map((m) => m.id)).toEqual(["first-meal"]);
    cx = a.codex;
    expect(checkMilestones(cx, pet(), T0, ["meal"]).unlocked).toEqual([]);
  });
  it("adult discovery, survive 1h, neglect death", () => {
    const adult = pet({ stage: "adult", species: "stoic", ageMinutes: 90 });
    const r = checkMilestones(emptyCodex(), adult, T0, []);
    expect(r.unlocked.map((m) => m.id)).toEqual(expect.arrayContaining(["survive-1h", "adult-stoic"]));
    const dead = pet({ dead: true, causeOfDeath: "starvation" });
    expect(checkMilestones(emptyCodex(), dead, T0, ["died"]).unlocked.map((m) => m.id)).toContain("neglect-death");
  });
  it("records species, best scores (never lower), and caps the journal", () => {
    let cx = discover(emptyCodex(), "placid", "adult");
    expect(cx.adults).toEqual(["placid"]);
    cx = recordScore(cx, "catch", 20, 2);
    cx = recordScore(cx, "catch", 5, 1);
    expect(cx.bestScores["catch"]).toEqual({ score: 20, stars: 2 });
    let j: { at: number; text: string }[] = [];
    for (let i = 0; i < 60; i++) j = pushJournal(j, i, `line ${i}`);
    expect(j).toHaveLength(JOURNAL_MAX);
    expect(j.at(-1)?.text).toBe("line 59");
  });
});

describe("speechFor", () => {
  it("has ~40 lowercase 2-6 word lines", () => {
    expect(ALL_LINES.length).toBeGreaterThanOrEqual(40);
    for (const l of ALL_LINES) {
      expect(l).toBe(l.toLowerCase());
      const words = l.split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(2);
      expect(words).toBeLessThanOrEqual(6);
    }
  });
  it("never repeats back-to-back and is silent for eggs and the dead", () => {
    const rng = makeRng(7);
    let last: string | null = null;
    let spoke = 0;
    for (let i = 0; i < 300; i++) {
      const line = speechFor(behavior({ mood: "happy", want: "play" }), pet(), rng, last);
      if (line) { expect(line).not.toBe(last); last = line; spoke++; }
    }
    expect(spoke).toBeGreaterThan(150);
    expect(speechFor(behavior(), newEgg(T0, "e", "e"), rng)).toBeNull();
    expect(speechFor(behavior(), pet({ dead: true }), rng)).toBeNull();
  });
  it("is deterministic per seed and reflects state", () => {
    const a = speechFor(behavior({ mood: "sick" }), pet({ meters: { ...pet().meters, sickness: 20 } }), makeRng(3));
    const b = speechFor(behavior({ mood: "sick" }), pet({ meters: { ...pet().meters, sickness: 20 } }), makeRng(3));
    expect(a).toBe(b);
  });
});

describe("away grace", () => {
  it("short gaps are plain advance", () => {
    const r = catchUp(pet(), T0 + 5 * MINUTE);
    expect(r.away).toBeNull();
    expect(r.pet).toEqual(advance(pet(), T0 + 5 * MINUTE));
  });
  it("a day away does not kill a healthy pet and produces a report", () => {
    const r = catchUp(pet(), T0 + 24 * 60 * MINUTE);
    expect(r.pet.dead).toBe(false);
    expect(r.away?.minutes).toBe(1440);
    expect(r.away?.summary).toMatch(/gone/);
  });
  it("sleeps through the grace period: 6h costs little hunger", () => {
    const r = catchUp(pet(), T0 + SLEEP_GRACE_HOURS * 60 * MINUTE);
    expect(r.pet.meters.hunger - 20).toBeLessThan(0.07 * 360 + 1);
    expect(r.pet.asleep).toBe(false);
  });
  it("a starving pet is spared within the mercy window but not after", () => {
    const weak = pet({ meters: { hunger: 95, energy: 30, hygiene: 20, health: 30, sickness: 30 } });
    const spared = catchUp(weak, T0 + 48 * 60 * MINUTE);
    expect(spared.pet.dead).toBe(false);
    expect(spared.pet.meters.health).toBeLessThanOrEqual(10);
    expect(catchUp(weak, T0 + 10 * 24 * 60 * MINUTE).pet.dead).toBe(true);
  });
});
