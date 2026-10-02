/**
 * Orchestration: run the body forward, ask Jev how it feels, apply the verdict.
 *
 * The one rule this file keeps: physics is free and Jev is not, so the body ticks
 * continuously while thinking happens on a heartbeat, on your actions, and once on
 * return from an absence. Never per frame.
 */
import {
  apply, applyJevons, applyMinigame, buildPsycheState, buy, buyRefusal, careStreakReward, catchUp, checkMilestones, clearMess, discover, earn, equip, evolve, isEquipped, itemById, rewardForMilestone, rewardForMinigame, unequip,
  fallIll, interpret, makeRng, messSicknessChance, migrateSave, minigameRefusal, newSave, noteLife,
  pendingEvolution, pushJournal, recordNeglect, recordScore, refusalFor, refusalSpeech, speechFor,
  type Action, type AwayReport, type BuyRefusal, type ItemSlot, type Behavior, type MilestoneTag, type MinigameResult, type PetState, type RawAnswers, type Save,
} from "@jevagotchi/core";
import type { GameEvent } from "./contracts.js";

export type { Save, AwayReport };

/** v2 adds codex, journal, messes and happiness. v1 saves are read, upgraded, and left untouched. */
const SAVE_KEY = "jevagotchi.v2";
const LEGACY_KEYS = ["jevagotchi.v1"];
const HEARTBEAT_MS = 45_000;
const PHYSICS_MS = 1_000;
const SPEECH_MS = 5_000;

export interface Telemetry {
  latencyMs: number;
  inputTokens: number;
  model: string;
  /** Running total in dollars, at the published input-only rate. */
  spend: number;
  distribution: { label: string; p: number }[];
  confidence: number;
  degraded: string[];
  offline: boolean;
}

const NAMES = ["Blobule", "Tamsin", "Pip", "Wend", "Gus", "Moth", "Bibi", "Odd"];
const randomName = (): string => NAMES[Math.floor(Math.random() * NAMES.length)]!;

function load(): Save {
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      const save = raw ? migrateSave(JSON.parse(raw), Date.now()) : null;
      if (save) return save;
    } catch {
      // A corrupt save should cost you a pet, not the whole app.
    }
  }
  return newSave(Date.now(), randomName(), crypto.randomUUID());
}

const article = (w: string): string => (/^[aeiou]/i.test(w) ? "an" : "a");

export class Game {
  save: Save = load();
  behavior: Behavior | null = null;
  telemetry: Telemetry = { latencyMs: 0, inputTokens: 0, model: "", spend: 0, distribution: [], confidence: 0, degraded: [], offline: false };
  lastRefusal: string | null = null;
  justEvolved: { from: string; to: string } | null = null;
  /** What the creature is saying right now (lasts ~5s), or null. */
  speech: string | null = null;
  /** Set once when the player returns from a long absence; the UI shows it and calls `clearAwayReport()`. */
  awayReport: AwayReport | null = null;

  private thinking = false;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: GameEvent) => void>();
  private lastSpeech: string | null = null;
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private speechSeq = 0;

  onChange(fn: () => void): void { this.listeners.add(fn); }
  private emit(): void { for (const fn of this.listeners) fn(); }

  /** Subscribe to discrete game moments (sounds, particles, toasts). */
  onEvent(fn: (e: GameEvent) => void): void { this.eventListeners.add(fn); }
  private fire(e: GameEvent): void { for (const fn of this.eventListeners) fn(e); }

  clearAwayReport(): void { this.awayReport = null; this.emit(); }

  private log(text: string): void {
    this.save.journal = pushJournal(this.save.journal, Date.now(), text);
  }

  private say(line: string | null): void {
    this.speech = line;
    if (line) this.lastSpeech = line;
    const seq = ++this.speechSeq;
    if (this.speechTimer) clearTimeout(this.speechTimer);
    if (line) {
      this.speechTimer = setTimeout(() => {
        if (seq === this.speechSeq) { this.speech = null; this.emit(); }
      }, SPEECH_MS);
    }
  }

  private rollSpeech(): void {
    const rng = makeRng((Date.now() ^ (this.save.thinkCount * 40503)) >>> 0);
    this.say(speechFor(this.behavior, this.save.pet, rng, this.lastSpeech));
  }

  /** Grant any milestones the given happenings earned, once each. */
  private milestones(tags: MilestoneTag[]): void {
    const now = Date.now();
    const r = checkMilestones(this.save.codex, this.save.pet, now, tags);
    this.save.codex = r.codex;
    for (const m of r.unlocked) {
      this.log(`${m.title}. ${m.text}`);
      const stars = rewardForMilestone(m.id);
      this.save.wardrobe = earn(this.save.wardrobe, stars);
      this.fire({ type: "milestone", id: m.id, title: m.title, text: m.text, stars });
    }
  }

  /**
   * Compare the body before and after any change and announce what differs.
   * One place, so every path (physics, actions, Jev's verdicts) reports identically.
   */
  private observe(before: PetState, after: PetState, tags: MilestoneTag[] = []): void {
    const name = after.name;
    if (after.messes > before.messes) {
      this.fire({ type: "mess" });
      if (before.messes === 0) this.log(`${name} made a mess.`);
    }
    if (before.meters.sickness <= 0 && after.meters.sickness > 0) {
      this.fire({ type: "fell-ill" });
      this.log(`${name} got sick.`);
    }
    if (before.meters.sickness > 0 && after.meters.sickness <= 0 && !after.dead) {
      this.fire({ type: "recovered" });
      this.log(`${name} got better.`);
      tags.push("recovered");
    }
    if (!before.dead && after.dead && after.causeOfDeath) {
      this.fire({ type: "died", cause: after.causeOfDeath });
      this.log(`${name} died of ${after.causeOfDeath}.`);
      tags.push("died");
    }
    this.save.codex = noteLife(this.save.codex, after.ageMinutes);
    this.milestones(tags);
  }

  private persist(): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* private mode; play on */ }
  }

  start(): void {
    if (this.save.journal.length === 0 && this.save.pet.stage === "egg" && !this.save.pet.dead) {
      this.log(`${this.save.pet.name} was laid.`);
      this.fire({ type: "born", name: this.save.pet.name });
    }
    // Catch up on the absence in one step, then immediately ask how it landed.
    this.tickPhysics();
    void this.think();
    setInterval(() => this.tickPhysics(), PHYSICS_MS);
    setInterval(() => void this.think(), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { this.tickPhysics(); void this.think(); }
    });

    // Two open tabs would otherwise each autosave their own copy every second and
    // quietly fight over the pet, last write winning. Adopt whatever the other tab
    // wrote instead of overwriting it.
    window.addEventListener("storage", (e) => {
      if (e.key !== SAVE_KEY || !e.newValue) return;
      try {
        const other = migrateSave(JSON.parse(e.newValue), Date.now());
        if (other) { this.save = other; this.emit(); }
      } catch { /* a corrupt write from elsewhere is not ours to repair */ }
    });
  }

  private tickPhysics(): void {
    const before = this.save.pet;
    const { pet, away } = catchUp(before, Date.now());
    this.save.pet = pet;
    this.payStreak(pet);
    if (away) {
      this.awayReport = away;
      this.log(away.summary);
    }
    if (pet.dead && !before.dead) this.bury();
    this.observe(before, pet);
    this.persist();
    this.emit();
  }

  /** One star trickle per whole hour of unbroken care. */
  private payStreak(pet: PetState): void {
    const w = this.save.wardrobe;
    const r = careStreakReward(pet, Date.now(), w.streakPaid);
    if (r.paid === w.streakPaid && r.stars === 0) return;
    this.save.wardrobe = { ...earn(w, r.stars), streakPaid: r.paid };
    if (r.stars > 0) this.fire({ type: "stars", amount: r.stars, reason: "care-streak" });
  }

  /* ---- wardrobe ---------------------------------------------------------- */

  /** Buy an item. Returns why not, or null on success. */
  buyItem(id: string): BuyRefusal | null {
    const why = buyRefusal(this.save.wardrobe, id, this.save.codex);
    if (why) return why;
    this.save.wardrobe = buy(this.save.wardrobe, id, this.save.codex)!;
    const item = itemById(id)!;
    this.log(`Bought ${item.name.toLowerCase()}.`);
    this.persist(); this.emit();
    return null;
  }

  /** Wear or place an owned item, or take it off if it is already on. */
  toggleItem(id: string): void {
    const item = itemById(id);
    if (!item || !this.save.wardrobe.owned.includes(id)) return;
    this.save.wardrobe = isEquipped(this.save.wardrobe, item) ? unequip(this.save.wardrobe, item.slot as ItemSlot) : equip(this.save.wardrobe, id);
    this.persist(); this.emit();
  }

  act(action: Action): void {
    const before = this.save.pet;
    const refusal = refusalFor(before, action);
    this.lastRefusal = refusal;
    if (refusal) {
      this.fire({ type: "refused", action, reason: refusal });
      this.say(refusalSpeech(makeRng(Date.now() >>> 0), this.lastSpeech));
      this.emit();
      return;
    }
    const messesBefore = before.messes;
    this.save.pet = apply(before, action, Date.now());
    const tags: MilestoneTag[] = [];
    if (action === "feed") { this.save.codex.totalMeals += 1; tags.push("meal"); }
    if (action === "clean" && messesBefore > 0) tags.push("mess-cleared");
    this.fire({ type: "action", action });
    this.observe(before, this.save.pet, tags);
    this.rollSpeech();
    this.persist();
    this.emit();
    void this.think();
  }

  /** Tap one poop. */
  clearMess(index: number): void {
    const before = this.save.pet;
    this.save.pet = clearMess(before, index, Date.now());
    if (this.save.pet === before) return;
    this.fire({ type: "action", action: "clean" });
    this.observe(before, this.save.pet, ["mess-cleared"]);
    this.persist();
    this.emit();
  }

  /** Why a minigame can't be started right now (asleep, too tired...), or null. */
  minigameRefusal(): string | null { return minigameRefusal(this.save.pet); }

  /** Feed a finished minigame back into the pet, codex and diary. */
  minigameResult(game: string, result: MinigameResult): void {
    const before = this.save.pet;
    this.save.pet = applyMinigame(before, result, Date.now());
    this.save.codex = recordScore(this.save.codex, game, result.score, result.stars);
    const earned = rewardForMinigame(result.stars);
    this.save.wardrobe = earn(this.save.wardrobe, earned);
    this.fire({ type: "minigame-result", game, score: result.score, stars: result.stars, earned });
    if (result.stars > 0) this.log(`${before.name} played ${game} for ${result.stars} star${result.stars === 1 ? "" : "s"}.`);
    this.observe(before, this.save.pet, result.stars === 3 ? ["minigame", "three-stars"] : ["minigame"]);
    this.rollSpeech();
    this.persist();
    this.emit();
    void this.think();
  }

  hatchIfDue(): void {
    const e = pendingEvolution(this.save.pet, false, "sweet");
    if (e && e.from.stage === "egg") this.applyEvolution(e.from.species, e.to.species, e);
  }

  private applyEvolution(from: string, to: string, e: ReturnType<typeof pendingEvolution>): void {
    if (!e) return;
    const before = this.save.pet;
    this.save.pet = evolve(before, e);
    const after = this.save.pet;
    this.justEvolved = { from, to };
    setTimeout(() => { this.justEvolved = null; this.emit(); }, 6000);

    this.save.codex = discover(this.save.codex, e.to.species, e.to.stage);
    const tags: MilestoneTag[] = [];
    if (e.from.stage === "egg") {
      this.save.codex.totalHatched += 1;
      this.log(`${after.name} hatched.`);
      this.fire({ type: "hatched", species: e.to.species });
      tags.push("hatch");
    } else {
      if (e.to.stage === "adult") this.save.codex.totalRaised += 1;
      this.log(e.to.stage === "adult"
        ? `${after.name} grew into ${article(e.to.species)} ${e.to.species}.`
        : `${after.name} grew up (${e.to.stage}).`);
      this.fire({ type: "evolved", from: e.from.species, to: e.to.species, stage: e.to.stage });
      tags.push("evolve");
    }
    this.observe(after, after, tags);
  }

  private bury(): void {
    const p = this.save.pet;
    this.save.graveyard = [
      { id: p.id, name: p.name, species: p.species, stage: p.stage,
        lifespanMinutes: Math.round(p.ageMinutes), peakAffection: this.save.peakAffection,
        causeOfDeath: p.causeOfDeath, diedAt: p.diedAt ?? Date.now() },
      ...this.save.graveyard,
    ].slice(0, 12);
    this.persist();
  }

  startOver(): void {
    // Walking away from a living pet still gives it a place in the garden.
    const old = this.save.pet;
    if (old.dead && !this.save.graveyard.some((x) => x.id === old.id)) this.bury(); // e.g. a save written mid-death
    if (!old.dead && old.stage !== "egg") {
      this.save.pet = { ...old, dead: true, diedAt: Date.now() };
      this.bury();
      this.log(`${old.name} was sent to a new home.`);
    }
    const fresh = newSave(Date.now(), randomName(), crypto.randomUUID());
    this.save.pet = fresh.pet;
    this.save.peakAffection = 0;
    this.behavior = null;
    this.say(null);
    this.log(`${fresh.pet.name} was laid.`);
    this.fire({ type: "born", name: fresh.pet.name });
    this.persist();
    this.emit();
  }

  /** One Jev call: how does the pet feel about the body it currently has? */
  async think(): Promise<void> {
    if (this.thinking || this.save.pet.dead) return;
    this.thinking = true;
    const now = Date.now();
    const state = buildPsycheState(this.save.pet, now);

    try {
      const res = await fetch("/think", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) throw new Error(`think failed: ${res.status}`);
      const data = await res.json() as { answers: RawAnswers; model: string; usage: { input_tokens: number }; latencyMs: number };

      // A fresh stream per think, so identical states on different ticks still vary.
      this.save.thinkCount += 1;
      const behavior = interpret(data.answers, state, makeRng(this.save.thinkCount * 2654435761));
      this.behavior = behavior;
      this.applyBehavior(behavior);

      const mood = data.answers["mood"];
      this.telemetry = {
        latencyMs: data.latencyMs,
        inputTokens: data.usage.input_tokens,
        model: data.model,
        spend: this.telemetry.spend + (data.usage.input_tokens / 1e6) * 0.042,
        distribution: mood && mood.type === "choice"
          ? Object.entries(mood.probabilities).map(([label, p]) => ({ label, p })).sort((a, b) => b.p - a.p).slice(0, 5)
          : [],
        confidence: mood && mood.type === "choice" ? mood.confidence : 0,
        degraded: behavior.degraded,
        offline: false,
      };
    } catch {
      // The pet keeps existing when the network does not; it just stops emoting.
      this.telemetry = { ...this.telemetry, offline: true };
    } finally {
      this.thinking = false;
      this.rollSpeech();
      this.persist();
      this.emit();
    }
  }

  /** Jev's verdict, folded back into the body. */
  private applyBehavior(b: Behavior): void {
    const before = this.save.pet;
    let pet = before;

    // Jev's own read, plus the physical cause it cannot count: a floor left dirty.
    const sickRng = makeRng((this.save.thinkCount * 7919) >>> 0);
    if (b.gettingSick || sickRng.chance(messSicknessChance(pet))) pet = fallIll(pet);
    if (b.feelsNeglected) pet = recordNeglect(pet);
    pet = applyJevons(pet, b.careEfficiency, b.spoiled);

    this.save.peakAffection = Math.max(this.save.peakAffection, b.affection);
    this.save.pet = pet;
    this.observe(before, pet);

    const e = pendingEvolution(pet, b.readyToEvolve, b.direction);
    if (e) this.applyEvolution(e.from.species, e.to.species, e);
  }
}
