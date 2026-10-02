import { describe, it, expect } from "vitest";
import {
  CATALOGUE, MILESTONES, MINUTE, STREAK_HOURS_CAP, buy, buyRefusal, careStreakReward, earn, emptyWardrobe, equip, isEquipped,
  isUnlocked, itemById, itemsInSlot, migrateSave, migrateWardrobe, newEgg, newSave, rewardForMilestone, rewardForMinigame,
  starterWardrobe, unequip, type Wardrobe,
} from "../src/index.js";

const T0 = 1_700_000_000_000;
const rich = (): Wardrobe => earn(emptyWardrobe(), 500);
const codex = (milestones: string[] = []) => ({ milestones });

describe("catalogue", () => {
  it("has ~24+ unique items across all eight slots, priced, with dry one-liners", () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(24);
    expect(new Set(CATALOGUE.map((i) => i.id)).size).toBe(CATALOGUE.length);
    for (const s of ["hat", "face", "neck", "held", "wallpaper", "rug", "lamp", "wall"] as const) expect(itemsInSlot(s).length).toBeGreaterThan(0);
    for (const i of CATALOGUE) { expect(i.price).toBeGreaterThan(0); expect(i.blurb.length).toBeGreaterThan(10); }
  });
  it("only locks behind milestones that exist", () => {
    const ids = new Set(MILESTONES.map((m) => m.id));
    const locked = CATALOGUE.filter((i) => i.unlock);
    expect(locked.length).toBeGreaterThanOrEqual(4);
    for (const i of locked) expect(ids.has(i.unlock!.milestone)).toBe(true);
  });
});

describe("earning", () => {
  it("minigame stars pay double and clamp", () => {
    expect([0, 1, 2, 3, 9].map(rewardForMinigame)).toEqual([0, 2, 4, 6, 6]);
  });
  it("milestones pay, adults pay best, a hard lesson pays nothing", () => {
    expect(rewardForMilestone("first-meal")).toBe(10);
    expect(rewardForMilestone("adult-stoic")).toBe(20);
    expect(rewardForMilestone("neglect-death")).toBe(0);
    for (const m of MILESTONES) expect(rewardForMilestone(m.id)).toBeGreaterThanOrEqual(0);
  });
  it("care streaks pay once per whole hour and reset with the streak", () => {
    const pet = { ...newEgg(T0, "Pip", "p"), careStreakStartedAt: T0, recentActions: [{ action: "feed", at: T0 }] } as never;
    expect(careStreakReward(pet, T0 + 59 * MINUTE, 0)).toEqual({ stars: 0, paid: 0 });
    expect(careStreakReward(pet, T0 + 61 * MINUTE, 0)).toEqual({ stars: 3, paid: 1 });
    expect(careStreakReward(pet, T0 + 61 * MINUTE, 1)).toEqual({ stars: 0, paid: 1 });
    expect(careStreakReward(pet, T0 + 3 * 60 * MINUTE, 1)).toEqual({ stars: 6, paid: 3 });
    expect(careStreakReward(pet, T0 + 20 * 60 * MINUTE, 0).paid).toBe(STREAK_HOURS_CAP);
    // streak broke and restarted: paid hours forget themselves
    expect(careStreakReward(pet, T0 + 10 * MINUTE, 5)).toEqual({ stars: 0, paid: 0 });
    expect(careStreakReward({ ...(pet as object), dead: true } as never, T0 + 200 * MINUTE, 0).stars).toBe(0);
  });
  it("earn ignores non-positive amounts", () => {
    expect(earn(emptyWardrobe(), -3).stars).toBe(0);
    expect(earn(emptyWardrobe(), 4.9).stars).toBe(4);
  });
});

describe("buying", () => {
  it("spends stars and records ownership", () => {
    const w = buy(earn(emptyWardrobe(), 20), "bucket", codex())!;
    expect(w.stars).toBe(12);
    expect(w.owned).toEqual(["bucket"]);
  });
  it("refuses when poor, owned, locked or unknown, without changing anything", () => {
    expect(buyRefusal(emptyWardrobe(), "bucket", codex())).toBe("poor");
    expect(buyRefusal(rich(), "crown", codex())).toBe("locked");
    expect(buyRefusal(rich(), "nonsense", codex())).toBe("unknown");
    const w = buy(rich(), "bucket", codex())!;
    expect(buyRefusal(w, "bucket", codex())).toBe("owned");
    expect(buy(w, "bucket", codex())).toBeNull();
    expect(buy(rich(), "crown", codex())).toBeNull();
  });
  it("unlocks with the milestone", () => {
    const crown = itemById("crown")!;
    expect(isUnlocked(crown, codex())).toBe(false);
    expect(isUnlocked(crown, codex(["three-stars"]))).toBe(true);
    expect(buy(rich(), "crown", codex(["three-stars"]))!.owned).toContain("crown");
  });
});

describe("wearing", () => {
  it("only owned items can be worn; a slot holds one item", () => {
    expect(equip(rich(), "bucket").equipped).toEqual({});
    let w = buy(buy(rich(), "bucket", codex())!, "beanie", codex())!;
    w = equip(equip(w, "bucket"), "beanie");
    expect(w.equipped.hat).toBe("beanie");
    expect(isEquipped(w, itemById("beanie")!)).toBe(true);
    expect(isEquipped(w, itemById("bucket")!)).toBe(false);
  });
  it("room items land in the room, not on the pet", () => {
    const w = equip(buy(rich(), "wp-lagoon", codex())!, "wp-lagoon");
    expect(w.room.wallpaper).toBe("wp-lagoon");
    expect(w.equipped).toEqual({});
  });
  it("unequip clears one slot and leaves the rest", () => {
    let w = rich();
    for (const id of ["bucket", "moustache", "rug-cloud"]) w = equip(buy(w, id, codex())!, id);
    w = unequip(w, "hat");
    expect(w.equipped).toEqual({ face: "moustache" });
    expect(unequip(w, "rug").room).toEqual({});
    expect(w.owned).toContain("bucket");
  });
});

describe("saves", () => {
  it("a fresh save starts with a few stars and an empty closet", () => {
    const s = newSave(T0, "Pip", "p");
    expect(s.wardrobe.stars).toBe(10);
    expect(s.wardrobe.owned).toEqual([]);
  });
  it("an old save without a wardrobe migrates, paying earned milestones retroactively", () => {
    const old = { version: 2, pet: newEgg(T0, "Old", "o"), codex: { milestones: ["first-meal", "three-stars"] } };
    const s = migrateSave(old, T0)!;
    expect(s.wardrobe.stars).toBe(starterWardrobe(["first-meal", "three-stars"]).stars);
    expect(s.wardrobe.stars).toBe(10 + 10 + 15);
    expect(s.pet.name).toBe("Old");
  });
  it("a v1 save with no codex still migrates", () => {
    expect(migrateSave({ pet: newEgg(T0, "V1", "v") }, T0)!.wardrobe.stars).toBe(10);
  });
  it("survives a round trip", () => {
    let w = equip(buy(rich(), "bucket", codex())!, "bucket");
    w = equip(buy(w, "lamp-lantern", codex())!, "lamp-lantern");
    const s = migrateSave(JSON.parse(JSON.stringify({ ...newSave(T0, "Pip", "p"), wardrobe: w })), T0)!;
    expect(s.wardrobe).toEqual(w);
  });
  it("repairs garbage: unknown ids, unowned or mis-slotted equips, bad numbers", () => {
    const w = migrateWardrobe({
      stars: -4, owned: ["bucket", "bucket", "ghost", 7], streakPaid: "x",
      equipped: { hat: "bucket", face: "crown", neck: "beanie", held: 9 }, room: { rug: "bucket", lamp: "lamp-moon" },
    }, []);
    expect(w).toEqual({ stars: 0, owned: ["bucket"], equipped: { hat: "bucket" }, room: {}, streakPaid: 0 });
    expect(migrateWardrobe("nope", ["first-meal"]).stars).toBe(20);
  });
});
