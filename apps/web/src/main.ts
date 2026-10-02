import type { Action } from "@jevagotchi/core";
import { audio } from "./audio.js";
import type { GameEvent, SfxName } from "./contracts.js";
import { Game } from "./game.js";
import { Stage } from "./scene/index.js";
import { mountMinigame, pickMinigame, MINIGAMES, type MinigameId } from "./minigames/index.js";
import { openBook } from "./ui/book.js";
import { bookView } from "./ui/bookdata.js";
import { Hud, type DockAction } from "./ui/hud.js";
import { MindPanel, type MindState } from "./ui/mind.js";
import { REFUSAL_TEXT, speciesName } from "./ui/mood.js";
import {
  confirmDialog, needsOnboarding, openMenu, openMinigameShell, showDeath, showOnboarding, showWelcomeBack, type Modal,
} from "./ui/overlays.js";
import { buildFrame, dockAction, hudState, themeColor, timeOfDay } from "./ui/state.js";
import { Toasts } from "./ui/toasts.js";
import { openWardrobe } from "./ui/wardrobe.js";
import { $ } from "./ui/util.js";
import { mountMenuExtras, startNudges } from "./ui/notify.js";
import { initPwa } from "./pwa.js";

const canvas = $<HTMLCanvasElement>("#stage");
const ui = $("#ui");
const overlays = $("#overlays");
const game = new Game();
const stage = new Stage(canvas);
const toasts = new Toasts($("#toasts"));

let muted = false;
let pointer: { x: number; y: number } | null = null;
let pointerTimer = 0;
let readAt = 0;
let lastTele: unknown = null;
let book: (Modal & { refresh(): void }) | null = null;
let deathModal: Modal | null = null;
let awayModal: Modal | null = null;
let minigameOpen = false;
let lastGame: MinigameId | undefined;
let onboarding: { dismiss(): void } | null = null;

const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
const modalOpen = (): boolean => overlays.querySelector(".scrim:not(.leaving), .mg:not(.leaving)") !== null;

/* ---- mind panel ----------------------------------------------------------- */

const mind = new MindPanel($("#mind"), () => setMind(false));
function setMind(open: boolean, viaKeyboard = false): void {
  mind.setOpen(open);
  document.body.classList.toggle("mind-open", open);
  if (open && viaKeyboard) $<HTMLElement>("#mind button").focus();
  refresh();
}
function mindState(): MindState {
  return { pet: game.save.pet, behavior: game.behavior, telemetry: game.telemetry, readAt };
}

/* ---- HUD ------------------------------------------------------------------ */

const hud = new Hud($("#topbar"), $("#gauges"), $("#dock"), {
  action: (a) => doAction(a),
  mind: (e) => setMind(!mind.isOpen, e.detail === 0),
  mute: () => setMuted(!muted),
  wardrobe: () => openWardrobeModal(),
  menu: () => openMenuModal(),
});

function setMuted(m: boolean): void {
  muted = m;
  audio.setMuted(m);
  try { localStorage.setItem("jevagotchi.muted", m ? "1" : "0"); } catch { /* fine */ }
  refresh();
}
try { muted = localStorage.getItem("jevagotchi.muted") === "1"; audio.setMuted(muted); } catch { /* fine */ }

function refresh(): void {
  if (game.telemetry !== lastTele) {
    lastTele = game.telemetry;
    if (!game.telemetry.offline && game.telemetry.model) readAt = Date.now();
  }
  hud.update(hudState(game, muted, mind.isOpen, timeOfDay()));
  mind.sync(mindState());
  book?.refresh();

  const pet = game.save.pet;
  if (pet.dead && !deathModal) {
    if (mind.isOpen) setMind(false);
    if (deathModal) return;
    deathModal = showDeath(overlays, {
      name: pet.name, species: pet.species, ageMinutes: pet.ageMinutes, cause: pet.causeOfDeath,
      onNew: () => { deathModal = null; game.startOver(); },
      onBook: () => openBookModal("graves"),
    });
  } else if (!pet.dead && deathModal) { deathModal.close(); deathModal = null; }

  if (game.awayReport && !awayModal && !onboarding && !pet.dead) {
    const r = game.awayReport;
    awayModal = showWelcomeBack(overlays, {
      name: pet.name, summary: r.summary,
      onHello: () => { awayModal = null; game.clearAwayReport(); },
    });
  }
}

/* ---- actions -------------------------------------------------------------- */

const SFX: Partial<Record<Action, SfxName>> = {
  feed: "feed", play: "play", clean: "clean", medicine: "medicine", scold: "scold", sleep: "sleep", wake: "wake",
};
type Fx = Parameters<Stage["play"]>[0];
const REACT: Partial<Record<Action, Fx>> = {
  feed: "feed", play: "play", clean: "clean", medicine: "medicine", scold: "scold", sleep: "sleep", wake: "wake",
};

function doAction(a: DockAction): void {
  audio.unlock();
  if (game.save.pet.dead) return;
  if (a === "play") return startPlay();
  game.act(dockAction(a, game.save.pet));
}

function startPlay(): void {
  if (minigameOpen) return;
  const refusal = game.minigameRefusal();
  if (refusal) {
    audio.sfx("refuse");
    stage.play("refuse");
    hud.shakeAction("play");
    toasts.show({ title: REFUSAL_TEXT[refusal] ?? refusal, key: "refusal", kind: "info", icon: "heart" });
    return;
  }
  const pet = game.save.pet;
  const id = pickMinigame(true, lastGame);
  lastGame = id;
  const pick = MINIGAMES.find((m) => m.id === id)!;
  minigameOpen = true;
  audio.sfx("tap");
  let teardown: (() => void) | undefined;
  const shell = openMinigameShell(overlays, {
    title: pick.title,
    onDone: (r) => { if (r.stars > 0 || r.score > 0) game.minigameResult(pick.id, r); },
    onTeardown: () => { minigameOpen = false; teardown?.(); },
  });
  teardown = mountMinigame(pick.id, {
    host: shell.host, species: pet.species, mood: game.behavior?.mood ?? "content",
    done: (r) => shell.end(r), sfx: (n) => audio.sfx(n),
  });
}

function onEvent(e: GameEvent): void {
  switch (e.type) {
    case "action": {
      const sfx = SFX[e.action]; if (sfx) audio.sfx(sfx);
      const fx = REACT[e.action]; if (fx) stage.play(fx);
      break;
    }
    case "refused":
      audio.sfx("refuse"); stage.play("refuse");
      hud.shakeAction(e.action === "sleep" || e.action === "wake" ? "lights" : (e.action as DockAction));
      toasts.show({ title: REFUSAL_TEXT[e.reason] ?? e.reason, key: "refusal", kind: "info", icon: "heart" });
      break;
    case "hatched":
      audio.sfx("hatch"); stage.play("hatch");
      toasts.show({ title: `${game.save.pet.name} hatched`, text: `It's ${/^[aeiou]/i.test(e.species) ? "an" : "a"} ${speciesName(e.species).toLowerCase()}. Say hello.`, kind: "evolve", icon: "egg" });
      break;
    case "evolved":
      audio.sfx("evolve"); stage.play("evolve", { from: e.from, to: e.to });
      toasts.show({ title: `${game.save.pet.name} grew up`, text: e.from === e.to ? `Now a ${e.stage}.` : `${speciesName(e.from)} became ${speciesName(e.to).toLowerCase()}.`, kind: "evolve" });
      break;
    case "died": audio.sfx("die"); stage.play("die"); break;
    case "fell-ill": audio.sfx("alarm"); toasts.show({ title: `${game.save.pet.name} feels unwell`, text: "Give it some medicine.", kind: "warn", icon: "medicine" }); break;
    case "recovered": audio.sfx("happy"); toasts.show({ title: "Feeling better", text: `${game.save.pet.name} is back on its feet.`, kind: "info", icon: "heart" }); break;
    case "mess": audio.sfx("poop"); toasts.show({ title: "Oops, a mess", text: "Tap it, or press Clean.", kind: "info", key: "mess", icon: "clean" }); break;
    case "born": stage.play("newborn"); toasts.show({ title: "A new egg", text: `${e.name} will hatch soon.`, kind: "info", icon: "egg" }); break;
    case "minigame-result":
      if (e.stars > 0) audio.sfx("star");
      if (e.earned) setTimeout(() => { audio.sfx("coin"); toasts.show({ title: `+${e.earned} stars`, text: "Spend them in the wardrobe.", kind: "info", icon: "star", key: "stars" }); }, 500);
      break;
    case "stars": audio.sfx("coin"); toasts.show({ title: `+${e.amount} stars`, text: "For steady care.", kind: "info", icon: "star", key: "stars" }); break;
    case "milestone": audio.sfx("milestone"); stage.play("milestone"); toasts.show({ title: e.title, text: e.stars ? `${e.text} +${e.stars} stars.` : e.text, kind: "milestone" }); break;
    default: break;
  }
}

/* ---- overlays ------------------------------------------------------------- */

function openBookModal(tab: "journal" | "codex" | "graves" = "journal"): void {
  audio.sfx("tap");
  book?.close();
  book = openBook(overlays, () => bookView(game), tab);
  const b = book;
  const obs = new MutationObserver(() => { if (!b.el.isConnected) { if (book === b) book = null; obs.disconnect(); } });
  obs.observe(overlays, { childList: true });
}

function openWardrobeModal(): void {
  audio.unlock(); audio.sfx("tap");
  openWardrobe(overlays, { game, sfx: (n) => audio.sfx(n) });
}

function openMenuModal(): void {
  audio.unlock(); audio.sfx("tap");
  const menu = openMenu(overlays, {
    muted, onMute: () => setMuted(!muted),
    onBook: () => openBookModal(),
    onHelp: () => { onboarding?.dismiss(); onboarding = showOnboarding(overlays, game.save.pet.name, () => { onboarding = null; }); },
    onStartOver: () => confirmDialog(overlays, {
      title: "Start over?", text: `${game.save.pet.name} will be gone and you'll get a fresh egg. This can't be undone.`,
      yes: "Start over", danger: true,
      onYes: () => game.startOver(),
    }),
  });
  mountMenuExtras(menu.el);
}

/* ---- input ---------------------------------------------------------------- */

const unlock = (): void => audio.unlock();
addEventListener("pointerdown", unlock, { once: true, capture: true });
addEventListener("keydown", unlock, { once: true, capture: true });

const HOTKEYS: Record<string, DockAction> = { f: "feed", p: "play", c: "clean", l: "lights", m: "medicine", s: "scold" };
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.key === "Escape" && mind.isOpen && !modalOpen()) { setMind(false); return; }
  if (modalOpen()) return;
  const a = HOTKEYS[e.key.toLowerCase()];
  if (a) { e.preventDefault(); doAction(a); }
  else if (e.key.toLowerCase() === "i") setMind(!mind.isOpen, true);
  else if (e.key.toLowerCase() === "w") openWardrobeModal();
});

addEventListener("pointermove", (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  clearTimeout(pointerTimer);
  if (e.pointerType !== "mouse") pointerTimer = window.setTimeout(() => { pointer = null; stage.setPointer(null); }, 1800);
});
document.addEventListener("pointerleave", () => { pointer = null; stage.setPointer(null); });
addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") { pointer = null; stage.setPointer(null); } });

stage.onTapMess = (i: number) => game.clearMess(i);
stage.onCreatureTap = () => { audio.sfx("poke"); };
stage.onThunder = (i) => audio.thunder(i);

/* ---- frame loop ----------------------------------------------------------- */

let last = performance.now();
/** Adaptive resolution: if the slowest 5% of recent frames exceed ~22ms, drop the canvas scale a notch. */
const frameMs: number[] = [];
function watchFrameTime(ms: number): void {
  if (ms > 250 || ms <= 0) return; // tab switches and stalls are not the renderer's fault
  frameMs.push(ms);
  if (frameMs.length < 150) return;
  frameMs.sort((a, b) => a - b);
  const p95 = frameMs[Math.floor(frameMs.length * 0.95)]!;
  frameMs.length = 0;
  if (p95 > 22 && stage.renderScale > 1) stage.lowerRenderScale();
}
function frame(now: number): void {
  watchFrameTime(now - last);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (pointer) stage.setPointer(pointer);
  stage.render(buildFrame(game, null, timeOfDay()), now);
  mind.tick(dt);
  requestAnimationFrame(frame);
}

/* ---- go ------------------------------------------------------------------- */

game.onEvent(onEvent);
game.onChange(refresh);
game.start();
startNudges(game);
initPwa();
setInterval(() => game.hatchIfDue(), 2000);
setInterval(() => {
  const pet = game.save.pet;
  const tod = timeOfDay();
  audio.setWeather(stage.weather.kind, stage.weather.intensity, stage.weather.wind);
  audio.setAmbience({ timeOfDay: tod, asleep: pet.asleep, tension: Math.min(1, (game.behavior?.urgency ?? 0) * 0.7 + (pet.meters.sickness > 0 ? 0.3 : 0)) });
  themeMeta?.setAttribute("content", themeColor(tod));
  hud.update(hudState(game, muted, mind.isOpen, tod));
}, 1000);

ui.hidden = false;
refresh();
if (needsOnboarding() && !game.save.pet.dead && game.save.pet.stage === "egg") {
  onboarding = showOnboarding(overlays, game.save.pet.name, () => { onboarding = null; refresh(); });
}
requestAnimationFrame(frame);
