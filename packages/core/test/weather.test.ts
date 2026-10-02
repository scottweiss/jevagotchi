import { describe, it, expect } from "vitest";
import { SEASONS, WEATHER_KINDS, blockOf, seasonOf, weatherAt } from "../src/weather.js";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 30);

describe("seasonOf", () => {
  it("uses northern-hemisphere meteorological seasons", () => {
    expect(seasonOf(at(2026, 3, 1))).toBe("spring");
    expect(seasonOf(at(2026, 5, 31))).toBe("spring");
    expect(seasonOf(at(2026, 6, 1))).toBe("summer");
    expect(seasonOf(at(2026, 8, 31))).toBe("summer");
    expect(seasonOf(at(2026, 9, 1))).toBe("autumn");
    expect(seasonOf(at(2026, 11, 30))).toBe("autumn");
    expect(seasonOf(at(2026, 12, 1))).toBe("winter");
    expect(seasonOf(at(2027, 2, 28))).toBe("winter");
  });
});

describe("weatherAt", () => {
  it("is deterministic and stable within a 3-hour block", () => {
    const a = weatherAt(new Date(2026, 3, 9, 6, 0));
    expect(weatherAt(new Date(2026, 3, 9, 8, 59, 59))).toEqual(a);
    expect(weatherAt(new Date(2026, 3, 9, 6, 0))).toEqual(a);
    expect(blockOf(new Date(2026, 3, 9, 8, 59))).toBe(2);
  });

  it("varies from day to day", () => {
    const kinds = new Set<string>();
    for (let d = 1; d <= 28; d++) kinds.add(weatherAt(at(2026, 4, d)).kind);
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  it("only snows in winter months, and snows in winter", () => {
    let winterSnow = 0;
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) for (let h = 0; h < 24; h += 3) {
        const w = weatherAt(at(2026, m, d, h));
        if (w.kind === "snow") { expect(w.season).toBe("winter"); winterSnow++; }
      }
    }
    expect(winterSnow).toBeGreaterThan(20);
  });

  it("produces every kind over a year, with sane ranges", () => {
    const seen = new Set<string>();
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= 28; d++) for (let h = 0; h < 24; h += 3) {
      const w = weatherAt(at(2026, m, d, h));
      seen.add(w.kind);
      expect(w.intensity).toBeGreaterThan(0);
      expect(w.intensity).toBeLessThanOrEqual(1);
      expect(w.wind).toBeGreaterThanOrEqual(0);
      expect(w.wind).toBeLessThanOrEqual(1);
      expect(SEASONS).toContain(w.season);
    }
    expect([...seen].sort()).toEqual([...WEATHER_KINDS].sort());
  });

  it("keeps roughly to the seasonal odds (summer is mostly clear)", () => {
    let clear = 0, n = 0;
    for (let d = 1; d <= 28; d++) for (let h = 0; h < 24; h += 3) { n++; if (weatherAt(at(2026, 7, d, h)).kind === "clear") clear++; }
    expect(clear / n).toBeGreaterThan(0.35);
    expect(clear / n).toBeLessThan(0.7);
  });
});
