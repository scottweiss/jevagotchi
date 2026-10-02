/**
 * Seeded PRNG. The pet's behaviour is sampled, so tests need reproducibility:
 * same seed + same Jev answers => same creature, every run.
 */
export interface Rng {
  next(): number;
  /** Returns true with probability `p`. Nouls are probabilities, so this is how we read them. */
  chance(p: number): boolean;
  /** Draws a key from a probability map. Robust to keys in any order and to sums slightly off 1. */
  sample<K extends string>(probabilities: Readonly<Record<K, number>>): K;
  /**
   * An independent stream for one named decision.
   *
   * Decisions must not share a stream. On a shared stream every draw shifts the
   * ones after it, so a conditional draw (a reaction that only happens when there
   * is something to react to) silently changes unrelated outcomes downstream, and
   * adding a question later perturbs every existing pet. Deriving by name makes
   * each decision depend only on the seed and its own label.
   */
  derive(label: string): Rng;
}

/** FNV-1a. Small, stable across platforms, and good enough to separate label streams. */
function hashLabel(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough, and identical across platforms. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    chance: (p) => next() < p,
    sample: <K extends string>(probabilities: Readonly<Record<K, number>>): K => {
      // Sort for determinism: Jev does not guarantee key order, and we must not
      // let response ordering change which creature the player gets.
      const entries = (Object.entries(probabilities) as [K, number][])
        .filter(([, w]) => Number.isFinite(w) && w > 0)
        .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));

      if (entries.length === 0) throw new Error("sample() needs at least one positive-probability key");

      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [key, w] of entries) {
        r -= w;
        if (r <= 0) return key;
      }
      return entries[entries.length - 1]![0];
    },
    derive: (label) => makeRng((seed ^ hashLabel(label)) >>> 0),
  };
}
