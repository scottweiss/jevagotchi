/**
 * What the creature says. Pure and seeded. Lowercase, 2-6 words, dry or sweet.
 * It is not chatty: many calls return null, and a line never repeats back-to-back.
 */
import type { Behavior } from "./interpret.js";
import type { Rng } from "./rng.js";
import type { PetState } from "./state.js";

const LINES = {
  asleep: ["mm. five more minutes", "zzz... crumbs", "dreaming of snacks", "shh. sleeping"],
  sick: ["i feel wobbly", "everything is too loud", "tummy says no", "medicine, please"],
  mess: ["something smells. it's me", "please. the floor", "that was not me", "ugh, the mess"],
  food: ["snack o'clock, surely", "i could eat", "tummy is filing complaints", "feed me, thanks"],
  play: ["play with me?", "i am so bored", "entertain me, please", "let's do something"],
  sleep: ["lights off, maybe?", "i'm yawning at you", "bed. now. kindly"],
  cleaning: ["i am a bit grubby", "wash me. gently", "scrub scrub?"],
  attention: ["hello. still here", "look at me", "notice me, please", "you there?"],
  medicine: ["i need the good stuff", "not feeling great"],
  happy: ["this is the best", "yay. obviously", "life is good", "i love it here", "so happy right now"],
  content: ["all is well", "quite nice, this", "comfy. thank you", "not bad at all"],
  bored: ["nothing is happening", "i've counted the walls", "hmm. boring", "wake me for fun"],
  lonely: ["where did you go?", "i missed you", "don't leave again", "it's quiet without you"],
  grumpy: ["hmph. whatever", "don't talk to me", "i'm not sulking", "leave me be"],
  anxious: ["are you leaving?", "i'm worried", "you'll be back, right?"],
  sleepy: ["so sleepy", "eyes closing. sorry", "big yawn incoming"],
  hesitant: ["um. hm", "i can't decide", "not sure how i feel"],
  refused: ["no, thank you", "not now"],
} as const;

const SPECIES_FLAVOR: Partial<Record<PetState["species"], readonly string[]>> = {
  blobule: ["blorp. wibble", "wibble wobble"],
  jevling: ["jev? jev", "calibrating my feelings"],
  placid: ["all is calm", "gentle breeze, gentle me"],
  feral: ["i do what i want", "don't fence me in"],
  needy: ["hold me, please", "stay close. closer"],
  stoic: ["it is fine", "i endure"],
  insatiable: ["more. always more", "is there seconds?"],
};

export const SPEECH_LINE_COUNT = Object.values(LINES).reduce((n, l) => n + l.length, 0)
  + Object.values(SPECIES_FLAVOR).reduce((n, l) => n + (l?.length ?? 0), 0);

const pick = (rng: Rng, from: readonly string[], last: string | null): string | null => {
  const opts = from.filter((l) => l !== last);
  return opts.length === 0 ? null : opts[Math.floor(rng.next() * opts.length)]!;
};

/**
 * `last` is the previous line spoken, so the same one never appears twice in a row.
 * Returns null when the pet has nothing to say (often), or cannot speak (egg, dead).
 */
export function speechFor(behavior: Behavior | null, pet: PetState, rng: Rng, last: string | null = null): string | null {
  if (pet.dead || pet.stage === "egg") return null;
  if (pet.asleep) return rng.chance(0.5) ? pick(rng, LINES.asleep, last) : null;
  if (!behavior) return null;
  if (rng.chance(0.2)) return null;

  const pool: string[] = [];
  const add = (l: readonly string[], weight = 1): void => { for (let i = 0; i < weight; i++) pool.push(...l); };

  if (pet.meters.sickness > 0) add(LINES.sick, 3);
  if (pet.messes >= 2) add(LINES.mess, 2);
  if (behavior.want !== "nothing" && behavior.want in LINES) add(LINES[behavior.want as keyof typeof LINES], 2 + Math.round(behavior.urgency * 2));
  if (behavior.demeanour === "hesitant") add(LINES.hesitant);
  if (behavior.demeanour !== "confused") add(LINES[behavior.mood]);
  if (pet.happiness < 25) add(LINES.bored);
  const flavor = SPECIES_FLAVOR[pet.species];
  if (flavor && pet.stage !== "baby") add(flavor);

  return pick(rng, pool.length ? pool : LINES.content, last);
}

/** Line for a turned-away action. */
export function refusalSpeech(rng: Rng, last: string | null = null): string | null {
  return pick(rng, LINES.refused, last);
}

/** All authored lines, for tests. */
export const ALL_LINES: readonly string[] = [
  ...Object.values(LINES).flat(),
  ...Object.values(SPECIES_FLAVOR).flatMap((l) => l ?? []),
];
