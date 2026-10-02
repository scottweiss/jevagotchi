/**
 * Minigames. Self-contained canvas games, ~25s each, no assets, no dependencies.
 * `mountMinigame` fills `ctx.host`, calls `ctx.done` exactly once (on Done, or with
 * score 0 if disposed early), and returns a disposer that removes everything.
 */
import type { MinigameContext } from "../contracts.js";
import { mountCatch } from "./catch.js";
import { mountMemory } from "./memory.js";
import { mountRhythm } from "./rhythm.js";

export type MinigameId = "catch" | "rhythm" | "memory";

export const MINIGAMES: readonly { id: MinigameId; title: string; blurb: string }[] = [
  { id: "catch", title: "Treat catch", blurb: "Slide left and right to catch snacks. Dodge the veg." },
  { id: "rhythm", title: "Bubble pop", blurb: "Pop bubbles to the beat in four lanes." },
  { id: "memory", title: "Sparkle memory", blurb: "Repeat the growing pattern of glowing orbs." },
];

export function mountMinigame(id: MinigameId | (string & {}), ctx: MinigameContext): () => void {
  switch (id) {
    case "catch": return mountCatch(ctx);
    case "rhythm": return mountRhythm(ctx);
    case "memory": return mountMemory(ctx);
    default: return mountCatch(ctx);
  }
}

let rotation = -1;
/** Next game in rotation, never the same twice in a row; pass `random` for a shuffle instead. */
export function pickMinigame(random = false, avoid?: MinigameId): MinigameId {
  if (random) {
    const pool = MINIGAMES.filter((m) => m.id !== avoid);
    return pool[Math.floor(Math.random() * pool.length)]!.id;
  }
  rotation = (rotation + 1) % MINIGAMES.length;
  return MINIGAMES[rotation]!.id;
}
