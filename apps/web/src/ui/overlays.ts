import { icons } from "./icons.js";
import { CAUSE_TEXT, speciesName } from "./mood.js";
import { duration, esc, html, reducedMotion, trapFocus } from "./util.js";

export interface Modal { el: HTMLElement; close(): void }

/** A centred glass card over a scrim. Escape and scrim-click close it (unless `sticky`). */
export function openModal(host: HTMLElement, body: string, o: {
  label: string; cls?: string; sticky?: boolean; onClose?: () => void; delay?: number;
}): Modal {
  const el = html(`
    <div class="scrim ${o.cls ?? ""}" role="presentation">
      <div class="card" role="dialog" aria-modal="true" aria-label="${esc(o.label)}">${body}</div>
    </div>`);
  host.append(el);
  let closed = false;
  let release = (): void => {};
  const close = (): void => {
    if (closed) return;
    closed = true;
    release();
    el.classList.add("leaving");
    setTimeout(() => el.remove(), reducedMotion() ? 0 : 260);
    o.onClose?.();
  };
  const start = (): void => { release = trapFocus(el.querySelector(".card")!, o.sticky ? undefined : close); };
  if (o.delay) { el.classList.add("pending"); setTimeout(() => { el.classList.remove("pending"); start(); }, o.delay); }
  else start();
  if (!o.sticky) el.addEventListener("pointerdown", (e) => { if (e.target === el) close(); });
  return { el, close };
}

export const dismissBtn = (): string => `<button class="icon-btn card-x" type="button" data-close aria-label="Close">${icons.close}</button>`;

export function wireClose(m: Modal): void {
  m.el.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => m.close()));
}

/* ---- confirm ------------------------------------------------------------ */

export function confirmDialog(host: HTMLElement, o: {
  title: string; text: string; yes: string; no?: string; danger?: boolean; onYes(): void;
}): void {
  const m = openModal(host, `
    <h2>${esc(o.title)}</h2>
    <p>${esc(o.text)}</p>
    <div class="card-actions">
      <button class="btn ghost" type="button" data-close data-autofocus>${esc(o.no ?? "Keep it")}</button>
      <button class="btn ${o.danger ? "danger" : "primary"}" type="button" data-yes>${esc(o.yes)}</button>
    </div>`, { label: o.title, cls: "confirm" });
  wireClose(m);
  m.el.querySelector("[data-yes]")!.addEventListener("click", () => { m.close(); o.onYes(); });
}

/* ---- menu --------------------------------------------------------------- */

export function openMenu(host: HTMLElement, o: {
  muted: boolean; onMute(): void; onBook(): void; onStartOver(): void; onHelp(): void;
}): Modal {
  const reduce = reducedMotion();
  const m = openModal(host, `
    <h2>Menu</h2>
    <ul class="menu-list">
      <li><button class="row" type="button" data-book data-autofocus>${icons.book}<span><b>Book</b><small>Journal, codex and graveyard</small></span></button></li>
      <li><button class="row" type="button" data-mute role="switch" aria-checked="${!o.muted}">${o.muted ? icons.soundOff : icons.soundOn}<span><b>Sound</b><small>${o.muted ? "Off" : "On"}</small></span><i class="switch" aria-hidden="true"></i></button></li>
      <li><button class="row" type="button" data-help>${icons.sparkle}<span><b>How to play</b><small>The three-step hint again</small></span></button></li>
    </ul>
    <p class="menu-note">${reduce ? "Reduced motion is on, so bars snap instead of springing and the world sways less." : "Follows your system's reduced motion setting, if you turn it on."}</p>
    <div class="menu-danger"><button class="btn ghost danger-text" type="button" data-over>Start over</button></div>
    ${dismissBtn()}`, { label: "Menu", cls: "menu" });
  wireClose(m);
  m.el.querySelector("[data-book]")!.addEventListener("click", () => { m.close(); o.onBook(); });
  m.el.querySelector("[data-help]")!.addEventListener("click", () => { m.close(); o.onHelp(); });
  m.el.querySelector("[data-mute]")!.addEventListener("click", (e) => {
    o.onMute();
    const b = e.currentTarget as HTMLElement;
    const nowMuted = b.getAttribute("aria-checked") === "true";
    b.setAttribute("aria-checked", String(!nowMuted));
    b.querySelector("small")!.textContent = nowMuted ? "Off" : "On";
    b.querySelector("svg")!.outerHTML = nowMuted ? icons.soundOff : icons.soundOn;
  });
  m.el.querySelector("[data-over]")!.addEventListener("click", () => { m.close(); o.onStartOver(); });
  return m;
}

/* ---- onboarding --------------------------------------------------------- */

const ONBOARD_KEY = "jevagotchi.onboarded";
export const needsOnboarding = (): boolean => { try { return !localStorage.getItem(ONBOARD_KEY); } catch { return false; } };

/** Title card plus three hints. Dismisses on first interaction; never blocks the world. */
export function showOnboarding(host: HTMLElement, name: string, onGone: () => void): { dismiss(): void } {
  const el = html(`
    <div class="onboard" role="region" aria-label="Welcome">
      <p class="ob-kicker">Something is in there</p>
      <h2>Meet ${esc(name)}</h2>
      <p class="ob-sub">A small spirit, with a Jev for a mind.</p>
      <ol class="ob-steps">
        <li><span>1</span>Tap it to say hello. Eggs need a minute or two to hatch.</li>
        <li><span>2</span>Care for it when it asks. Wants float above it.</li>
        <li><span>3</span>Open Mind to watch Jev decide how it feels.</li>
      </ol>
      <button class="btn primary" type="button" data-autofocus>Got it</button>
    </div>`);
  host.append(el);
  let gone = false;
  const dismiss = (): void => {
    if (gone) return; gone = true;
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* fine */ }
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 400);
    document.removeEventListener("keydown", onKey, true);
    onGone();
  };
  const onKey = (e: KeyboardEvent): void => { if (e.key !== "Tab" && e.key !== "Shift") dismiss(); };
  el.querySelector("button")!.addEventListener("click", dismiss);
  // "First interaction" means acting on the world, not merely moving the mouse.
  setTimeout(() => {
    document.addEventListener("keydown", onKey, true);
    document.querySelector("#dock")?.addEventListener("click", dismiss, { once: true });
    document.querySelector("#stage")?.addEventListener("pointerdown", dismiss, { once: true });
  }, 600);
  return { dismiss };
}

/* ---- welcome back ------------------------------------------------------- */

export function showWelcomeBack(host: HTMLElement, o: {
  name: string; summary: string; onHello(): void;
}): Modal {
  const m = openModal(host, `
    <span class="away-orb" aria-hidden="true"></span>
    <h2>Welcome back</h2>
    <p class="away-text">${esc(o.summary)}</p>
    <div class="card-actions"><button class="btn primary" type="button" data-close data-autofocus>Say hello to ${esc(o.name)}</button></div>`,
    { label: "Welcome back", cls: "away", onClose: o.onHello });
  wireClose(m);
  return m;
}

/* ---- death -------------------------------------------------------------- */

export function showDeath(host: HTMLElement, g: {
  name: string; species: string; ageMinutes: number; cause: string | null; onNew(): void; onBook(): void;
}): Modal {
  const c = CAUSE_TEXT[g.cause ?? ""] ?? { short: "slipped away", epitaph: "It was here, and it mattered." };
  const m = openModal(host, `
    <span class="death-orb" aria-hidden="true"></span>
    <h2>${esc(g.name)} ${esc(c.short)}</h2>
    <p class="epitaph">${esc(c.epitaph)}</p>
    <p class="card-meta">${esc(speciesName(g.species))}, ${esc(duration(g.ageMinutes))} in this world.</p>
    <div class="card-actions">
      <button class="btn ghost" type="button" data-book>Read the journal</button>
      <button class="btn primary" type="button" data-new data-autofocus>Raise a new egg</button>
    </div>`, { label: `${g.name} has died`, cls: "death", sticky: true, delay: 2200 });
  m.el.querySelector("[data-new]")!.addEventListener("click", () => { m.close(); g.onNew(); });
  m.el.querySelector("[data-book]")!.addEventListener("click", g.onBook);
  return m;
}

/* ---- minigame ----------------------------------------------------------- */

export interface MinigameShell { host: HTMLElement; end(result?: { score: number; stars: 0 | 1 | 2 | 3 }): void; el: HTMLElement }

export function openMinigameShell(root: HTMLElement, o: {
  title: string; onDone(r: { score: number; stars: 0 | 1 | 2 | 3 }): void; onTeardown(): void;
}): MinigameShell {
  const el = html(`
    <div class="mg" role="dialog" aria-modal="true" aria-label="${esc(o.title)}">
      <header class="mg-bar">
        <h2>${esc(o.title)}</h2>
        <button class="chip" type="button" data-quit>${icons.close}<span>Quit</span></button>
      </header>
      <div class="mg-host"></div>
    </div>`);
  root.append(el);
  const host = el.querySelector<HTMLElement>(".mg-host")!;
  const release = trapFocus(el, () => end());
  let finished = false;
  // The minigame draws its own result screen and calls done() from its Done button,
  // so the shell just hands the result on and leaves.
  const end = (r: { score: number; stars: 0 | 1 | 2 | 3 } = { score: 0, stars: 0 }): void => {
    if (finished) return;
    finished = true;
    o.onDone(r);
    release();
    o.onTeardown();
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 300);
  };
  el.querySelector("[data-quit]")!.addEventListener("click", () => end());
  return { host, end, el };
}
