import { describe, it, expect } from "vitest";
import { shouldNudge, inQuietHours, DEFAULT_NUDGE_SETTINGS, NUDGE_COOLDOWN_MS, type NudgeState } from "../src/nudge.js";

const on = { ...DEFAULT_NUDGE_SETTINGS, enabled: true };
const at = (h: number): number => new Date(2026, 0, 5, h, 30).getTime();
const base: NudgeState = { name: "Gus", dead: false, asleep: false, health: 80, sickness: 0, messes: 0, want: null, urgency: 0, visible: false };
const hungry: NudgeState = { ...base, want: "food", urgency: 0.8 };

describe("shouldNudge", () => {
  it("says nothing when calm", () => expect(shouldNudge(base, on, at(12), {})).toBeNull());
  it("nudges for an urgent want in the pet's voice", () => {
    expect(shouldNudge(hungry, on, at(12), {})).toMatchObject({ reason: "want", body: "Gus is hungry." });
  });
  it("needs urgency above 0.66", () => expect(shouldNudge({ ...hungry, urgency: 0.66 }, on, at(12), {})).toBeNull());
  it("ignores want 'nothing'", () => expect(shouldNudge({ ...hungry, want: "nothing" }, on, at(12), {})).toBeNull());
  it("is off unless enabled", () => expect(shouldNudge(hungry, DEFAULT_NUDGE_SETTINGS, at(12), {})).toBeNull());
  it("never nudges while visible or dead", () => {
    expect(shouldNudge({ ...hungry, visible: true }, on, at(12), {})).toBeNull();
    expect(shouldNudge({ ...hungry, dead: true }, on, at(12), {})).toBeNull();
  });
  it("covers sickness, mess piles and critical health", () => {
    expect(shouldNudge({ ...base, sickness: 10 }, on, at(12), {})?.body).toBe("Gus feels unwell. Medicine would help.");
    expect(shouldNudge({ ...base, messes: 3 }, on, at(12), {})?.reason).toBe("mess");
    expect(shouldNudge({ ...base, messes: 2 }, on, at(12), {})).toBeNull();
    expect(shouldNudge({ ...base, health: 19 }, on, at(12), {})?.reason).toBe("critical");
  });
  it("rate-limits per reason, not globally", () => {
    const now = at(12);
    const h = { want: now - NUDGE_COOLDOWN_MS + 1 };
    expect(shouldNudge(hungry, on, now, h)).toBeNull();
    expect(shouldNudge(hungry, on, now + 2, h)?.reason).toBe("want");
    expect(shouldNudge({ ...hungry, sickness: 5 }, on, now, h)?.reason).toBe("sick");
  });
  it("respects quiet hours except when health is critical", () => {
    expect(shouldNudge(hungry, on, at(23), {})).toBeNull();
    expect(shouldNudge(hungry, on, at(3), {})).toBeNull();
    expect(shouldNudge(hungry, on, at(8), {})?.reason).toBe("want");
    expect(shouldNudge({ ...hungry, health: 10 }, on, at(2), {})?.reason).toBe("critical");
    expect(shouldNudge(hungry, { ...on, quietEnabled: false }, at(3), {})?.reason).toBe("want");
  });
  it("does not pester a sleeping pet about wants", () => {
    expect(shouldNudge({ ...hungry, asleep: true }, on, at(12), {})).toBeNull();
  });
});

describe("inQuietHours", () => {
  it("handles same-day windows", () => {
    const s = { ...on, quietStart: 13, quietEnd: 15 };
    expect(inQuietHours(s, at(14))).toBe(true);
    expect(inQuietHours(s, at(15))).toBe(false);
  });
});
