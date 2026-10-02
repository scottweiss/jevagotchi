import { describe, it, expect } from "vitest";
import { makeRng } from "../src/rng.js";

describe("makeRng", () => {
  it("is reproducible from a seed", () => {
    const a = makeRng(42), b = makeRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("differs between seeds", () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });

  it("samples proportionally to the probabilities", () => {
    const rng = makeRng(7);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 20_000; i++) counts[rng.sample({ a: 0.6, b: 0.3, c: 0.1 })]! += 1;
    expect(counts.a! / 20_000).toBeCloseTo(0.6, 1);
    expect(counts.b! / 20_000).toBeCloseTo(0.3, 1);
    expect(counts.c! / 20_000).toBeCloseTo(0.1, 1);
  });

  it("is insensitive to key order — Jev does not promise one", () => {
    const forward = makeRng(99).sample({ a: 0.2, b: 0.5, c: 0.3 });
    const shuffled = makeRng(99).sample({ c: 0.3, a: 0.2, b: 0.5 });
    expect(forward).toBe(shuffled);
  });

  it("never returns a zero-probability option", () => {
    const rng = makeRng(3);
    for (let i = 0; i < 500; i++) expect(rng.sample({ yes: 1, no: 0 })).toBe("yes");
  });

  it("tolerates distributions that do not quite sum to 1", () => {
    const rng = makeRng(5);
    for (let i = 0; i < 200; i++) expect(["a", "b"]).toContain(rng.sample({ a: 0.4, b: 0.4 }));
  });

  it("throws rather than guessing when nothing is samplable", () => {
    expect(() => makeRng(1).sample({ a: 0, b: 0 })).toThrow();
  });

  it("reads nouls as probabilities, not booleans", () => {
    const rng = makeRng(11);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.7)) hits++;
    expect(hits / 10_000).toBeCloseTo(0.7, 1);
  });
});
