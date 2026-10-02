/**
 * Opt-in "nudges": a notification when the pet needs you and the game is in the background.
 * Honest limit: this is the page (or installed app) noticing while it is still open.
 * A closed app cannot be woken without a push server, which this game does not have.
 */
import {
  DEFAULT_NUDGE_SETTINGS, NUDGE_COOLDOWN_MS, shouldNudge,
  type Nudge, type NudgeHistory, type NudgeSettings,
} from "@jevagotchi/core";
import type { Game } from "../game.js";
import { canInstall, isInstalled, onInstallChange, promptInstall } from "../pwa.js";
import { icons } from "./icons.js";

const KEY = "jevagotchi.nudges";
const CHECK_MS = 60_000;

interface Stored { settings: NudgeSettings; history: NudgeHistory }

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Stored> | null;
    return { settings: { ...DEFAULT_NUDGE_SETTINGS, ...(raw?.settings ?? {}) }, history: raw?.history ?? {} };
  } catch { return { settings: { ...DEFAULT_NUDGE_SETTINGS }, history: {} }; }
}
let store = read();
const write = (): void => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* fine */ } };

export const nudgesSupported = (): boolean => "Notification" in window;
const permission = (): NotificationPermission => (nudgesSupported() ? Notification.permission : "denied");
export const nudgesOn = (): boolean => store.settings.enabled && permission() === "granted";

/** Must be called from a click: this is where the permission prompt happens. */
export async function setNudges(on: boolean): Promise<boolean> {
  if (!on) { store.settings.enabled = false; write(); return false; }
  if (!nudgesSupported()) return false;
  let p = permission();
  if (p === "default") p = await Notification.requestPermission();
  store.settings.enabled = p === "granted";
  write();
  return store.settings.enabled;
}

export function setQuietHours(on: boolean): void { store.settings.quietEnabled = on; write(); }

async function show(n: Nudge): Promise<void> {
  const opts: NotificationOptions & { renotify?: boolean } = {
    body: n.body, tag: `jevagotchi-${n.reason}`, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, badge: `${import.meta.env.BASE_URL}icons/icon-192.png`, silent: true,
  };
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) { await reg.showNotification(n.title, opts); return; }
  const note = new Notification(n.title, opts);
  note.onclick = () => { window.focus(); note.close(); };
}

/** Look at the pet now; send at most one nudge if it is warranted. */
export function evaluateNudges(game: Game, now = Date.now()): void {
  if (!nudgesOn()) return;
  const pet = game.save.pet;
  const b = game.behavior;
  const nudge = shouldNudge({
    name: pet.name, dead: pet.dead, asleep: pet.asleep, health: pet.meters.health, sickness: pet.meters.sickness,
    messes: pet.messes, want: b?.want ?? null, urgency: b?.urgency ?? 0, visible: !document.hidden,
  }, store.settings, now, store.history);
  if (!nudge) return;
  store.history[nudge.reason] = now;
  write();
  void show(nudge).catch(() => { /* a blocked notification is not worth a crash */ });
}

export function startNudges(game: Game): void {
  const check = (): void => evaluateNudges(game);
  setInterval(check, CHECK_MS);
  document.addEventListener("visibilitychange", () => { if (document.hidden) check(); });
}

/* ---- menu rows ------------------------------------------------------------ */

const row = (attr: string, icon: string, title: string, sub: string, on: boolean | null): string => `
  <li><button class="row" type="button" ${attr} ${on === null ? "" : `role="switch" aria-checked="${on}"`}>${icon}<span><b>${title}</b><small>${sub}</small></span>${on === null ? "" : `<i class="switch" aria-hidden="true"></i>`}</button></li>`;

const NUDGE_NOTE = "Nudges only work while the game is open in a background tab or the installed app. They can't wake a closed app.";

/** Adds Install / Nudges / Quiet hours rows to the open menu. Self-contained on purpose. */
export function mountMenuExtras(menu: HTMLElement): void {
  const list = menu.querySelector(".menu-list");
  if (!list) return;
  const holder = document.createElement("div");
  holder.style.display = "contents";
  list.append(holder);

  const draw = (): void => {
    const supported = nudgesSupported();
    const denied = permission() === "denied";
    const on = nudgesOn();
    const sub = !supported ? "Not supported in this browser"
      : denied ? "Blocked in your browser settings"
      : on ? "On. Only while the game stays open" : "A gentle ping when it needs you";
    holder.innerHTML =
      (canInstall() && !isInstalled() ? row("data-install", icons.sparkle, "Install app", "Add it to your home screen or dock", null) : "") +
      row("data-nudges", icons.heart, "Nudges", sub, on) +
      (on ? row("data-quiet", icons.soundOff, "Quiet hours", store.settings.quietEnabled ? "No nudges 11pm to 8am, unless health is critical" : "Off", store.settings.quietEnabled) : "") +
      `<li><p class="menu-note">${NUDGE_NOTE}</p></li>`;
    holder.querySelector("[data-nudges]")?.toggleAttribute("disabled", !supported || denied);
  };
  draw();
  onInstallChange(draw);

  holder.addEventListener("click", async (e) => {
    const t = (e.target as HTMLElement).closest("button");
    if (!t) return;
    if (t.hasAttribute("data-install")) { await promptInstall(); }
    else if (t.hasAttribute("data-nudges")) { await setNudges(!nudgesOn()); draw(); }
    else if (t.hasAttribute("data-quiet")) { setQuietHours(!store.settings.quietEnabled); draw(); }
  });
}

export { NUDGE_COOLDOWN_MS };
