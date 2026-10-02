/**
 * Wardrobe & decor: the star economy, the catalogue, and pure buy/equip transforms.
 * Nothing here touches Jev. It is bookkeeping around things the creature can wear.
 */
import type { Codex } from "./codex.js";
import { MINUTE } from "./physics.js";
import type { PetState } from "./state.js";

export const WEAR_SLOTS = ["hat", "face", "neck", "held"] as const;
export const ROOM_SLOTS = ["wallpaper", "rug", "lamp", "wall"] as const;
export type WearSlot = (typeof WEAR_SLOTS)[number];
export type RoomSlot = (typeof ROOM_SLOTS)[number];
export type ItemSlot = WearSlot | RoomSlot;

export interface Equipped { hat?: string; face?: string; neck?: string; held?: string }
export interface RoomSetup { wallpaper?: string; rug?: string; lamp?: string; wall?: string }

export interface Wardrobe {
  /** The currency. Earned, never bought. */
  stars: number;
  owned: string[];
  equipped: Equipped;
  room: RoomSetup;
  /** Whole care-streak hours already paid out, so a long streak pays once per hour. */
  streakPaid: number;
}

export const emptyWardrobe = (): Wardrobe => ({ stars: 0, owned: [], equipped: {}, room: {}, streakPaid: 0 });

/* ---- catalogue ------------------------------------------------------------ */

export interface Unlock { milestone: string; hint: string }
export interface Item {
  id: string; slot: ItemSlot; name: string; blurb: string; price: number; unlock?: Unlock;
}

const it = (id: string, slot: ItemSlot, name: string, price: number, blurb: string, unlock?: Unlock): Item =>
  ({ id, slot, name, price, blurb, ...(unlock ? { unlock } : {}) });

export const CATALOGUE: readonly Item[] = [
  // hats
  it("bucket", "hat", "Bucket", 8, "Somebody left it here. It's a hat now."),
  it("daisy", "hat", "Daisy", 10, "Photosynthesis is not its job."),
  it("party-cone", "hat", "Party cone", 12, "For a birthday nobody scheduled."),
  it("beanie", "hat", "Beanie", 14, "Warm, and only a little smug about it."),
  it("headphones", "hat", "Headphones", 18, "Listening to something only it can hear."),
  it("sprout-pot", "hat", "Sprout pot", 20, "Small terracotta, big ambitions.", { milestone: "first-hatch", hint: "Hatch an egg." }),
  it("wizard", "hat", "Wizard hat", 30, "Rated for one spell, unspecified.", { milestone: "first-evolution", hint: "Watch your pet grow up for the first time." }),
  it("crown", "hat", "Tiny crown", 45, "Ruling over one room. It's enough.", { milestone: "three-stars", hint: "Earn three stars in a single minigame." }),
  // face
  it("moustache", "face", "Moustache", 14, "Distinguished. Slightly borrowed."),
  it("round-glasses", "face", "Round glasses", 16, "Sees the same as before, but with authority."),
  it("star-shades", "face", "Star shades", 24, "Too cool to explain itself.", { milestone: "first-play", hint: "Finish a minigame together." }),
  // neck
  it("bow-tie", "neck", "Bow tie", 12, "Formal wear for a creature with no formal events."),
  it("bell", "neck", "Bell collar", 14, "Now you always know where it is. So does it."),
  it("scarf", "neck", "Striped scarf", 18, "For the draught nobody else can feel.", { milestone: "first-recovery", hint: "Nurse your pet back to health." }),
  // held
  it("lollipop", "held", "Lollipop", 8, "A swirl, mostly for the look of it."),
  it("balloon", "held", "Balloon", 10, "Floats. Has opinions about wind."),
  it("umbrella", "held", "Tiny umbrella", 22, "Indoors, but you can never be too careful."),
  // wallpapers
  it("wp-lagoon", "wallpaper", "Lagoon stripes", 20, "A cool wash, like the inside of a wave."),
  it("wp-peach", "wallpaper", "Peach polka", 25, "Warm dots. Very forgiving of scuffs."),
  it("wp-midnight", "wallpaper", "Midnight stars", 35, "The ceiling is now somewhat theoretical.", { milestone: "survive-1h", hint: "Keep a pet alive for an hour." }),
  // rugs
  it("rug-cloud", "rug", "Cloud rug", 24, "Soft enough to apologise for."),
  it("rug-star", "rug", "Star rug", 32, "A night sky, laid flat and stepped on.", { milestone: "first-evolution", hint: "Watch your pet grow up for the first time." }),
  // lamps
  it("lamp-lantern", "lamp", "Paper lantern", 22, "Hangs about. Glows about it."),
  it("lamp-moon", "lamp", "Moon lamp", 34, "A small moon on a short leash.", { milestone: "care-streak", hint: "Keep up three hours of unbroken care." }),
  // wall art
  it("art-sun", "wall", "Sunrise print", 18, "The same sun, but framed, so it stays."),
  it("art-stars", "wall", "Constellation", 26, "Connect the dots. They already did.", { milestone: "first-mess", hint: "Scoop your first mess." }),
];

const BY_ID = new Map(CATALOGUE.map((i) => [i.id, i]));
export const itemById = (id: string | undefined): Item | undefined => (id ? BY_ID.get(id) : undefined);
export const itemsInSlot = (slot: ItemSlot): Item[] => CATALOGUE.filter((i) => i.slot === slot);
export const isWearSlot = (s: ItemSlot): s is WearSlot => (WEAR_SLOTS as readonly string[]).includes(s);

export const isUnlocked = (item: Item, codex: Pick<Codex, "milestones">): boolean =>
  !item.unlock || codex.milestones.includes(item.unlock.milestone);

/* ---- earning -------------------------------------------------------------- */

/** Minigame stars pay double: a perfect round is a proper gift. */
export const rewardForMinigame = (stars: number): number => Math.max(0, Math.min(3, Math.round(stars))) * 2;

const MILESTONE_REWARD: Record<string, number> = {
  "three-stars": 15, "care-streak": 15, "survive-1h": 12, "all-adults": 60, "neglect-death": 0,
};
/** Adult forms are the long game, so they pay best. */
export const rewardForMilestone = (id: string): number =>
  MILESTONE_REWARD[id] ?? (id.startsWith("adult-") ? 20 : 10);

export const STREAK_HOUR_REWARD = 3;
export const STREAK_HOURS_CAP = 12;

/**
 * Stars for unbroken care: 3 per whole hour of the current streak. `streakPaid`
 * remembers how many hours have paid, and resets when the streak restarts.
 */
export function careStreakReward(pet: Pick<PetState, "careStreakStartedAt" | "dead" | "recentActions">, now: number, paid: number): { stars: number; paid: number } {
  if (pet.dead || pet.recentActions.length === 0) return { stars: 0, paid: 0 };
  const hours = Math.min(STREAK_HOURS_CAP, Math.max(0, Math.floor((now - pet.careStreakStartedAt) / (60 * MINUTE))));
  if (hours < paid) return { stars: 0, paid: hours };
  return { stars: (hours - paid) * STREAK_HOUR_REWARD, paid: hours };
}

export const earn = (w: Wardrobe, n: number): Wardrobe =>
  n > 0 ? { ...w, stars: w.stars + Math.floor(n) } : w;

/* ---- buying and wearing --------------------------------------------------- */

export type BuyRefusal = "unknown" | "owned" | "locked" | "poor";

export function buyRefusal(w: Wardrobe, id: string, codex: Pick<Codex, "milestones">): BuyRefusal | null {
  const item = itemById(id);
  if (!item) return "unknown";
  if (w.owned.includes(id)) return "owned";
  if (!isUnlocked(item, codex)) return "locked";
  if (w.stars < item.price) return "poor";
  return null;
}

/** Spend stars. Returns null (and changes nothing) when it isn't allowed. */
export function buy(w: Wardrobe, id: string, codex: Pick<Codex, "milestones">): Wardrobe | null {
  if (buyRefusal(w, id, codex) !== null) return null;
  return { ...w, stars: w.stars - itemById(id)!.price, owned: [...w.owned, id] };
}

export function isEquipped(w: Wardrobe, item: Item): boolean {
  return isWearSlot(item.slot) ? w.equipped[item.slot] === item.id : w.room[item.slot] === item.id;
}

/** Wear or place an owned item, replacing whatever held its slot. */
export function equip(w: Wardrobe, id: string): Wardrobe {
  const item = itemById(id);
  if (!item || !w.owned.includes(id)) return w;
  return isWearSlot(item.slot)
    ? { ...w, equipped: { ...w.equipped, [item.slot]: id } }
    : { ...w, room: { ...w.room, [item.slot]: id } };
}

export function unequip(w: Wardrobe, slot: ItemSlot): Wardrobe {
  if (isWearSlot(slot)) { const { [slot]: _gone, ...equipped } = w.equipped; return { ...w, equipped }; }
  const { [slot]: _gone, ...room } = w.room;
  return { ...w, room };
}

/* ---- persistence ---------------------------------------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Everything the player already earned counts: old saves get their milestones paid retroactively. */
export function starterWardrobe(milestones: readonly string[]): Wardrobe {
  return earn(emptyWardrobe(), 10 + milestones.reduce((n, id) => n + rewardForMilestone(id), 0));
}

/** Repair anything: unknown ids dropped, equipped items must be owned, numbers sanitised. */
export function migrateWardrobe(raw: unknown, milestones: readonly string[]): Wardrobe {
  if (!isObj(raw)) return starterWardrobe(milestones);
  const owned = Array.isArray(raw["owned"])
    ? [...new Set((raw["owned"] as unknown[]).filter((x): x is string => typeof x === "string" && BY_ID.has(x)))]
    : [];
  const pick = <K extends string>(src: unknown, slots: readonly K[]): Partial<Record<K, string>> => {
    const out: Partial<Record<K, string>> = {};
    if (!isObj(src)) return out;
    for (const s of slots) {
      const v = src[s];
      if (typeof v === "string" && owned.includes(v) && BY_ID.get(v)!.slot === s) out[s] = v;
    }
    return out;
  };
  const stars = typeof raw["stars"] === "number" && Number.isFinite(raw["stars"]) ? Math.max(0, Math.floor(raw["stars"])) : 0;
  const paid = typeof raw["streakPaid"] === "number" && Number.isFinite(raw["streakPaid"]) ? Math.max(0, Math.floor(raw["streakPaid"])) : 0;
  return { stars, owned, equipped: pick(raw["equipped"], WEAR_SLOTS), room: pick(raw["room"], ROOM_SLOTS), streakPaid: paid };
}
