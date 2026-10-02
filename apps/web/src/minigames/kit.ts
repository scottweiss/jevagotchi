/**
 * Shared toolkit for the minigames: stage + canvas, countdown, HUD, particles,
 * result screen, input, and a soft glossy pet avatar. Standalone on purpose —
 * it does not import creatures/ so it survives the art rewrite.
 */
import type { MinigameContext, SfxName } from "../contracts.js";

export const PAL = {
  ink: "#1B1638", plum: "#3A2A6B", lagoon: "#38D6B8", peach: "#FFB58A",
  coral: "#FF5C7A", butter: "#FFE58F", fog: "#ECE9FF",
} as const;

const HUES: Record<string, string> = {
  egg: "#F3EEFF", blobule: "#38D6B8", jevling: "#C8F26B", placid: "#8FA8FF",
  feral: "#FF7A45", needy: "#FF8FC7", stoic: "#5F8F9E", insatiable: "#B36BFF",
};
export const speciesColor = (s: string): string => HUES[s] ?? HUES["blobule"]!;

const FONT = `'Bricolage Grotesque', 'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif`;
export const font = (px: number, weight = 700): string => `${weight} ${px}px ${FONT}`;

/* ---- colour helpers ------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** Lighten (amt>0) or darken (amt<0) by mixing toward white / ink. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const to = amt >= 0 ? [255, 255, 255] : [27, 22, 56];
  const k = Math.abs(amt);
  const m = (c: number, t: number): number => Math.round(c + (t - c) * k);
  return `rgb(${m(r, to[0]!)},${m(g, to[1]!)},${m(b, to[2]!)})`;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Small seeded PRNG for level layouts, so a given run is not framerate dependent. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- CSS ----------------------------------------------------------------- */

const CSS = `
.mg-root{position:relative;width:100%;height:100%;min-height:260px;overflow:hidden;background:${PAL.ink};
  touch-action:none;user-select:none;-webkit-user-select:none;font-family:${FONT};color:${PAL.fog};outline:none;
  border-radius:inherit;-webkit-tap-highlight-color:transparent}
.mg-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.mg-hud{position:absolute;left:0;right:0;top:0;padding:10px 12px;display:flex;gap:12px;align-items:center;pointer-events:none}
.mg-score{min-width:64px;padding:4px 12px;border-radius:999px;background:rgba(27,22,56,.62);
  backdrop-filter:blur(6px);font-weight:800;font-size:clamp(18px,4.6vw,26px);font-variant-numeric:tabular-nums;
  box-shadow:inset 0 0 0 1.5px rgba(236,233,255,.16);transition:transform .12s}
.mg-score.pop{animation:mgpop .28s cubic-bezier(.2,1.6,.4,1)}
.mg-score small{font-size:.55em;font-weight:600;opacity:.7;margin-left:6px}
.mg-time{flex:1;height:10px;border-radius:99px;background:rgba(236,233,255,.14);overflow:hidden;
  box-shadow:inset 0 1px 3px rgba(0,0,0,.35)}
.mg-time i{display:block;height:100%;width:100%;border-radius:inherit;transform-origin:left;
  background:linear-gradient(90deg,${PAL.lagoon},${PAL.butter});transition:background .3s}
.mg-time.low i{background:linear-gradient(90deg,${PAL.coral},${PAL.peach})}
.mg-extra{font-weight:700;font-size:clamp(13px,3.4vw,16px);opacity:.9;min-width:40px;text-align:right}
.mg-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;pointer-events:none;text-align:center;padding:16px}
.mg-count{font-weight:800;font-size:clamp(64px,22vw,132px);line-height:1;color:${PAL.butter};
  text-shadow:0 6px 30px rgba(255,181,138,.55),0 2px 0 rgba(0,0,0,.2);animation:mgcount .9s cubic-bezier(.2,1.4,.3,1) both}
.mg-hint{font-weight:600;font-size:clamp(14px,3.8vw,18px);opacity:.92;max-width:28ch;text-wrap:balance}
.mg-title{font-weight:800;font-size:clamp(20px,5vw,28px);letter-spacing:-.01em}
.mg-result{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  background:radial-gradient(circle at 50% 40%,rgba(58,42,107,.86),rgba(27,22,56,.94));animation:mgfade .35s ease both;padding:16px;text-align:center}
.mg-stars{display:flex;gap:10px}
.mg-star{width:clamp(46px,14vw,72px);height:clamp(46px,14vw,72px);opacity:.28;transform:scale(.6) rotate(-14deg);filter:grayscale(1)}
.mg-star.on{opacity:1;filter:none;animation:mgstar .6s cubic-bezier(.2,1.8,.4,1) both;filter:drop-shadow(0 0 14px rgba(255,229,143,.75))}
.mg-big{font-weight:800;font-size:clamp(34px,10vw,56px);font-variant-numeric:tabular-nums;line-height:1}
.mg-sub{font-weight:600;opacity:.8;font-size:clamp(14px,3.6vw,17px)}
.mg-done{pointer-events:auto;margin-top:6px;font:inherit;font-weight:800;font-size:clamp(16px,4vw,19px);color:${PAL.ink};
  background:linear-gradient(180deg,${PAL.butter},${PAL.peach});border:0;border-radius:999px;padding:12px 34px;cursor:pointer;
  box-shadow:0 8px 24px rgba(255,181,138,.35),inset 0 -3px 0 rgba(0,0,0,.12);transition:transform .12s}
.mg-done:hover{transform:translateY(-2px)}.mg-done:active{transform:scale(.96)}
.mg-done:focus-visible{outline:3px solid ${PAL.fog};outline-offset:3px}
@keyframes mgpop{0%{transform:scale(1)}40%{transform:scale(1.22)}100%{transform:scale(1)}}
@keyframes mgcount{0%{transform:scale(.3);opacity:0}30%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:.9}}
@keyframes mgfade{from{opacity:0}to{opacity:1}}
@keyframes mgstar{0%{transform:scale(.2) rotate(-40deg);opacity:0}100%{transform:scale(1) rotate(0);opacity:1}}
@media (prefers-reduced-motion:reduce){.mg-count,.mg-star.on,.mg-score.pop{animation-duration:.01s}}
`;

function injectCss(): void {
  if (document.getElementById("mg-css")) return;
  const el = document.createElement("style");
  el.id = "mg-css";
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ---- particles ------------------------------------------------------------ */

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: "dot" | "star" | "ring"; g: number }
interface Floater { x: number; y: number; text: string; color: string; life: number; size: number }

/* ---- kit ------------------------------------------------------------------ */

export type Phase = "intro" | "play" | "over";

export interface KitOptions {
  title: string;
  hint: string;
  /** Seconds of play. */
  duration: number;
  /** Given the final score, how many stars. */
  stars: (score: number) => 0 | 1 | 2 | 3;
  scoreLabel?: string;
  /** If true, kit does not end the game when time hits zero (game calls finish itself). */
  untimed?: boolean;
}

export interface Kit {
  ctx: CanvasRenderingContext2D;
  w: number; h: number;
  phase: Phase;
  time: number;          // seconds since mount
  timeLeft: number;
  reduced: boolean;
  score: number;
  sfx: (n: SfxName) => void;
  keys: Set<string>;
  pointer: { x: number; y: number; down: boolean; inside: boolean };
  setScore(n: number, pop?: boolean): void;
  setExtra(text: string): void;
  /** 0-1 fill for the top bar, for games that manage their own clock. */
  setProgress(f: number): void;
  burst(x: number, y: number, color: string, n?: number, kind?: Particle["kind"]): void;
  ring(x: number, y: number, color: string): void;
  float(x: number, y: number, text: string, color?: string, size?: number): void;
  shake(px: number): void;
  onKey(fn: (key: string, e: KeyboardEvent) => boolean | void): void;
  onPointer(kind: "down" | "move" | "up", fn: (x: number, y: number, e: PointerEvent) => void): void;
  run(update: (dt: number, phase: Phase) => void, draw: (ctx: CanvasRenderingContext2D) => void, onPlay?: () => void): void;
  finish(score?: number): void;
  backdrop(tint?: string): void;
  dispose(): void;
}

export function createKit(host: HTMLElement, mg: MinigameContext, opts: KitOptions): Kit {
  injectCss();
  host.replaceChildren();
  const root = document.createElement("div");
  root.className = "mg-root";
  root.tabIndex = 0;
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", `${opts.title} minigame`);
  const canvas = document.createElement("canvas");
  const hud = document.createElement("div");
  hud.className = "mg-hud";
  hud.innerHTML = `<div class="mg-score"><span data-s>0</span><small data-l>${opts.scoreLabel ?? ""}</small></div>
    <div class="mg-time"><i></i></div><div class="mg-extra" aria-live="off"></div>`;
  const center = document.createElement("div");
  center.className = "mg-center";
  root.append(canvas, hud, center);
  host.appendChild(root);

  const scoreEl = hud.querySelector<HTMLElement>(".mg-score")!;
  const scoreNum = hud.querySelector<HTMLElement>("[data-s]")!;
  const timeWrap = hud.querySelector<HTMLElement>(".mg-time")!;
  const timeBar = timeWrap.querySelector<HTMLElement>("i")!;
  const extraEl = hud.querySelector<HTMLElement>(".mg-extra")!;

  const c = canvas.getContext("2d")!;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const kit: Kit = {
    ctx: c, w: 0, h: 0, phase: "intro", time: 0, timeLeft: opts.duration, reduced, score: 0, sfx: mg.sfx,
    keys: new Set(), pointer: { x: 0, y: 0, down: false, inside: false },
    setScore, setExtra, setProgress, burst, ring, float, shake, onKey, onPointer, run, finish, backdrop, dispose,
  };

  let dpr = 1;
  function resize(): void {
    const r = root.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    kit.w = Math.max(1, r.width);
    kit.h = Math.max(1, r.height);
    canvas.width = Math.round(kit.w * dpr);
    canvas.height = Math.round(kit.h * dpr);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  /* listeners with cleanup */
  const cleanups: (() => void)[] = [];
  const listen = (el: EventTarget, ev: string, fn: (e: never) => void, capture = false): void => {
    el.addEventListener(ev, fn as unknown as EventListener, capture);
    cleanups.push(() => el.removeEventListener(ev, fn as unknown as EventListener, capture));
  };

  const keyHandlers: ((key: string, e: KeyboardEvent) => boolean | void)[] = [];
  const ptrHandlers: Record<"down" | "move" | "up", ((x: number, y: number, e: PointerEvent) => void)[]> = { down: [], move: [], up: [] };
  const GAME_KEYS = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "a", "d", "w", "s", "f", "j", "k", "1", "2", "3", "4", "q", "e", "r"]);

  listen(window, "keydown", (e: KeyboardEvent) => {
    if (finished && !(e.key === "Enter" || e.key === " ")) return;
    const k = e.key.toLowerCase();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Capture phase + stop: the host page has its own hotkeys that must not fire mid-game.
    if (GAME_KEYS.has(k)) {
      if (!finished) { e.preventDefault(); e.stopPropagation(); }
    }
    if (finished) return;
    if (!e.repeat) kit.keys.add(k);
    if (!e.repeat) for (const h of keyHandlers) h(k, e);
  }, true);
  listen(window, "keyup", (e: KeyboardEvent) => { kit.keys.delete(e.key.toLowerCase()); }, true);
  listen(window, "blur", () => kit.keys.clear());

  const toLocal = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  listen(canvas, "pointerdown", (e: PointerEvent) => {
    const [x, y] = toLocal(e);
    kit.pointer = { x, y, down: true, inside: true };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    root.focus({ preventScroll: true });
    for (const h of ptrHandlers.down) h(x, y, e);
  });
  listen(canvas, "pointermove", (e: PointerEvent) => {
    const [x, y] = toLocal(e);
    kit.pointer.x = x; kit.pointer.y = y; kit.pointer.inside = true;
    for (const h of ptrHandlers.move) h(x, y, e);
  });
  const up = (e: PointerEvent): void => {
    const [x, y] = toLocal(e);
    kit.pointer.down = false;
    for (const h of ptrHandlers.up) h(x, y, e);
  };
  listen(canvas, "pointerup", up);
  listen(canvas, "pointercancel", up);
  listen(canvas, "pointerleave", () => { kit.pointer.inside = false; });

  function onKey(fn: (key: string, e: KeyboardEvent) => boolean | void): void { keyHandlers.push(fn); }
  function onPointer(kind: "down" | "move" | "up", fn: (x: number, y: number, e: PointerEvent) => void): void { ptrHandlers[kind].push(fn); }

  /* HUD */
  function setScore(n: number, pop = true): void {
    kit.score = n;
    scoreNum.textContent = String(Math.round(n));
    if (pop && !reduced) {
      scoreEl.classList.remove("pop");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("pop");
    }
  }
  function setExtra(text: string): void { extraEl.textContent = text; }
  function setProgress(f: number): void { timeBar.style.transform = `scaleX(${clamp01(f)})`; }

  /* fx */
  const parts: Particle[] = [];
  const floaters: Floater[] = [];
  let shakeAmt = 0;
  function burst(x: number, y: number, color: string, n = 10, kind: Particle["kind"] = "dot"): void {
    const count = reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 220;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 4, color, kind, g: kind === "star" ? 120 : 260 });
    }
  }
  function ring(x: number, y: number, color: string): void {
    parts.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.45, size: 10, color, kind: "ring", g: 0 });
  }
  function float(x: number, y: number, text: string, color: string = PAL.butter, size = 22): void {
    floaters.push({ x, y, text, color, life: 0, size });
  }
  function shake(px: number): void { if (!reduced) shakeAmt = Math.max(shakeAmt, px); }

  /* backdrop: night gradient, drifting glow, twinkles */
  const starRnd = rng(42);
  const stars = Array.from({ length: 46 }, () => ({ x: starRnd(), y: starRnd() * 0.85, s: 0.6 + starRnd() * 1.6, p: starRnd() * 6.28 }));
  function backdrop(tint: string = PAL.peach): void {
    const g = c.createLinearGradient(0, 0, 0, kit.h);
    g.addColorStop(0, PAL.ink);
    g.addColorStop(0.65, PAL.plum);
    g.addColorStop(1, shade(PAL.plum, 0.12));
    c.fillStyle = g;
    c.fillRect(-20, -20, kit.w + 40, kit.h + 40);
    c.save();
    c.globalCompositeOperation = "lighter";
    const gx = kit.w * (0.5 + 0.28 * Math.sin(kit.time * 0.25));
    const rg = c.createRadialGradient(gx, kit.h * 0.9, 0, gx, kit.h * 0.9, kit.h * 0.9);
    rg.addColorStop(0, rgba(tint, 0.2));
    rg.addColorStop(1, rgba(tint, 0));
    c.fillStyle = rg;
    c.fillRect(0, 0, kit.w, kit.h);
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(kit.time * 1.6 + s.p);
      c.fillStyle = rgba(PAL.fog, 0.12 + 0.5 * tw);
      c.beginPath();
      c.arc(s.x * kit.w, s.y * kit.h, s.s * (0.6 + 0.4 * tw), 0, 6.283);
      c.fill();
    }
    c.restore();
  }

  function drawStar(x: number, y: number, r: number, rot: number): void {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }

  function drawFx(dt: number): void {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!;
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.max;
      c.save();
      c.globalCompositeOperation = "lighter";
      if (p.kind === "ring") {
        c.strokeStyle = rgba(p.color, k * 0.8);
        c.lineWidth = 3 * k + 1;
        c.beginPath();
        c.arc(p.x, p.y, p.size + (1 - k) * 46, 0, 6.283);
        c.stroke();
      } else if (p.kind === "star") {
        c.fillStyle = rgba(p.color, k);
        drawStar(p.x, p.y, p.size * 1.6 * k + 1, p.life * 6);
        c.fill();
      } else {
        c.fillStyle = rgba(p.color, k);
        c.beginPath();
        c.arc(p.x, p.y, p.size * k + 0.5, 0, 6.283);
        c.fill();
      }
      c.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]!;
      f.life += dt;
      if (f.life > 0.9) { floaters.splice(i, 1); continue; }
      const k = f.life / 0.9;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - 0.2 * Math.min(1, (k - 0.15) * 4);
      c.save();
      c.globalAlpha = 1 - k * k;
      c.font = font(f.size * pop, 800);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 4;
      c.strokeStyle = rgba(PAL.ink, 0.7);
      const y = f.y - k * 46;
      c.strokeText(f.text, f.x, y);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, y);
      c.restore();
    }
  }

  /* lifecycle */
  let raf = 0;
  let last = 0;
  let finished = false;
  let doneCalled = false;
  let disposed = false;
  let updateFn: (dt: number, p: Phase) => void = () => {};
  let drawFn: (c: CanvasRenderingContext2D) => void = () => {};
  let onPlayFn: (() => void) | undefined;
  let countdownTimers: ReturnType<typeof setTimeout>[] = [];

  function startCountdown(): void {
    center.innerHTML = `<div class="mg-title">${opts.title}</div><div class="mg-hint">${opts.hint}</div>`;
    const steps = ["3", "2", "1", "Go!"];
    steps.forEach((label, i) => {
      countdownTimers.push(setTimeout(() => {
        if (disposed) return;
        if (i === 0) center.innerHTML = "";
        center.innerHTML = `<div class="mg-count">${label}</div>${i === 0 ? `<div class="mg-hint">${opts.hint}</div>` : ""}`;
        mg.sfx(i === 3 ? "chirp" : "tap");
        if (i === 3) {
          kit.phase = "play";
          onPlayFn?.();
          countdownTimers.push(setTimeout(() => { if (!disposed && !finished) center.innerHTML = ""; }, 650));
        }
      }, 700 + i * 800));
    });
  }

  function frame(ts: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016);
    last = ts;
    kit.time += dt;

    if (kit.phase === "play" && !opts.untimed) {
      kit.timeLeft = Math.max(0, kit.timeLeft - dt);
      timeBar.style.transform = `scaleX(${clamp01(kit.timeLeft / opts.duration)})`;
      timeWrap.classList.toggle("low", kit.timeLeft < 6);
      if (kit.timeLeft <= 0) finish();
    }
    updateFn(dt, kit.phase);

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, kit.w, kit.h);
    shakeAmt *= Math.pow(0.001, dt);
    if (shakeAmt < 0.2) shakeAmt = 0;
    c.save();
    if (shakeAmt) c.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
    drawFn(c);
    drawFx(dt);
    c.restore();
  }

  function run(update: (dt: number, p: Phase) => void, draw: (c: CanvasRenderingContext2D) => void, onPlay?: () => void): void {
    updateFn = update; drawFn = draw; onPlayFn = onPlay;
    startCountdown();
    raf = requestAnimationFrame(frame);
  }

  function finish(finalScore?: number): void {
    if (finished) return;
    finished = true;
    kit.phase = "over";
    kit.keys.clear();
    const score = Math.round(finalScore ?? kit.score);
    const stars = opts.stars(score);
    const words = ["Aw, next time", "Nice one", "Great job", "Perfect"];
    const sub = ["Every try makes it happier.", "It had fun.", "It loved that.", "It's over the moon."];
    const starSvg = (on: boolean): string => `<svg class="mg-star${on ? " on" : ""}" viewBox="-12 -12 24 24" aria-hidden="true">
      <defs><linearGradient id="sg" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stop-color="#FFF3B8"/><stop offset="1" stop-color="#FFB58A"/></linearGradient></defs>
      <path d="M0-10 3-3.3 10-3 4.6 1.6 6.2 8.5 0 4.8-6.2 8.5-4.6 1.6-10-3-3-3.3Z" fill="url(#sg)" stroke="#FFE58F" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
    center.innerHTML = "";
    const res = document.createElement("div");
    res.className = "mg-result";
    res.setAttribute("role", "dialog");
    res.setAttribute("aria-label", "Result");
    res.innerHTML = `<div class="mg-title">${words[stars]}</div>
      <div class="mg-stars" aria-label="${stars} of 3 stars">${[0, 1, 2].map(() => starSvg(false)).join("")}</div>
      <div class="mg-big">${score}</div><div class="mg-sub">${sub[stars]}</div>`;
    const btn = document.createElement("button");
    btn.className = "mg-done";
    btn.type = "button";
    btn.textContent = "Done";
    res.appendChild(btn);
    root.appendChild(res);
    btn.focus({ preventScroll: true });
    const starEls = res.querySelectorAll<SVGElement>(".mg-star");
    for (let i = 0; i < stars; i++) {
      countdownTimers.push(setTimeout(() => {
        if (disposed) return;
        starEls[i]?.classList.add("on");
        mg.sfx("star");
        burst(kit.w / 2 + (i - 1) * 70, kit.h * 0.4, PAL.butter, 14, "star");
      }, 450 + i * 420));
    }
    if (stars === 3) countdownTimers.push(setTimeout(() => { if (!disposed) mg.sfx("milestone"); }, 450 + 3 * 420));
    const complete = (): void => {
      if (doneCalled) return;
      doneCalled = true;
      mg.done({ score, stars });
    };
    btn.addEventListener("click", complete);
    listen(window, "keydown", (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && document.activeElement !== btn) { e.preventDefault(); complete(); }
    });
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    countdownTimers.forEach(clearTimeout);
    ro.disconnect();
    cleanups.forEach((fn) => fn());
    // Abandoned before the result screen: report a zero exactly once.
    if (!doneCalled) { doneCalled = true; mg.done({ score: 0, stars: 0 }); }
    root.remove();
  }

  return kit;
}

/* ---- pet avatar ------------------------------------------------------------ */

export type Face = "idle" | "happy" | "ouch" | "eat" | "cheer" | "focus";

export interface PetPose {
  color: string;
  face?: Face;
  /** Squash-and-stretch, 1 = rest. Volume is preserved by the caller (sx = 1/sy). */
  sx?: number; sy?: number;
  /** Where the eyes look, -1..1. */
  look?: number;
  time?: number;
  tilt?: number;
}

/** A soft, glossy jelly blob standing on (x, y). r is its resting radius. */
export function drawPet(c: CanvasRenderingContext2D, x: number, y: number, r: number, p: PetPose): void {
  const sx = p.sx ?? 1, sy = p.sy ?? 1, t = p.time ?? 0;
  const breathe = 1 + Math.sin(t * 2.4) * 0.025;
  const rx = r * sx * (2 - breathe) * 1, ry = r * sy * breathe;
  const cy = y - ry * 0.95;

  // contact shadow
  c.save();
  c.fillStyle = "rgba(10,6,28,.38)";
  c.beginPath();
  c.ellipse(x, y + 2, rx * 0.95, r * 0.16, 0, 0, 6.283);
  c.fill();
  c.restore();

  c.save();
  c.translate(x, cy);
  c.rotate(p.tilt ?? 0);

  // body
  const body = c.createRadialGradient(-rx * 0.35, -ry * 0.5, r * 0.1, 0, 0, Math.max(rx, ry) * 1.15);
  body.addColorStop(0, shade(p.color, 0.5));
  body.addColorStop(0.45, p.color);
  body.addColorStop(1, shade(p.color, -0.42));
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(-rx, ry * 0.55);
  c.bezierCurveTo(-rx * 1.05, -ry * 0.5, -rx * 0.7, -ry * 1.05, 0, -ry * 1.02);
  c.bezierCurveTo(rx * 0.7, -ry * 1.05, rx * 1.05, -ry * 0.5, rx, ry * 0.55);
  c.bezierCurveTo(rx * 0.95, ry * 1.0, rx * 0.5, ry * 1.02, 0, ry * 1.02);
  c.bezierCurveTo(-rx * 0.5, ry * 1.02, -rx * 0.95, ry * 1.0, -rx, ry * 0.55);
  c.closePath();
  c.fill();

  // rim light from below-right (lamp glow)
  c.save();
  c.clip();
  const rim = c.createRadialGradient(rx * 0.5, ry * 0.9, 0, rx * 0.5, ry * 0.9, r * 1.3);
  rim.addColorStop(0, "rgba(255,229,143,.35)");
  rim.addColorStop(1, "rgba(255,229,143,0)");
  c.fillStyle = rim;
  c.fillRect(-rx * 2, -ry * 2, rx * 4, ry * 4);
  c.restore();

  // gloss
  c.fillStyle = "rgba(255,255,255,.55)";
  c.beginPath();
  c.ellipse(-rx * 0.38, -ry * 0.62, rx * 0.22, ry * 0.12, -0.6, 0, 6.283);
  c.fill();
  c.fillStyle = "rgba(255,255,255,.3)";
  c.beginPath();
  c.arc(-rx * 0.1, -ry * 0.78, r * 0.05, 0, 6.283);
  c.fill();

  // face
  const face = p.face ?? "idle";
  const ex = rx * 0.36, ey = -ry * 0.05, er = r * 0.17;
  const lx = (p.look ?? 0) * er * 0.4;
  const blink = Math.sin(t * 1.1 + 1) > 0.985 && face === "idle";
  c.fillStyle = PAL.ink;
  c.strokeStyle = PAL.ink;
  c.lineCap = "round";
  c.lineWidth = Math.max(2, r * 0.07);
  for (const s of [-1, 1]) {
    const px = s * ex;
    if (face === "happy" || face === "cheer" || blink) {
      c.beginPath();
      c.arc(px, ey + er * 0.4, er * 0.85, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    } else if (face === "ouch") {
      c.beginPath();
      c.moveTo(px - er * 0.7, ey - er * 0.7); c.lineTo(px + er * 0.7, ey + er * 0.7);
      c.moveTo(px + er * 0.7, ey - er * 0.7); c.lineTo(px - er * 0.7, ey + er * 0.7);
      c.stroke();
    } else {
      c.beginPath();
      c.ellipse(px + lx, ey, er * 0.9, er * (face === "focus" ? 1.15 : 1.05), 0, 0, 6.283);
      c.fill();
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(px + lx - er * 0.28, ey - er * 0.32, er * 0.32, 0, 6.283);
      c.fill();
      c.beginPath();
      c.arc(px + lx + er * 0.3, ey + er * 0.3, er * 0.15, 0, 6.283);
      c.fill();
      c.fillStyle = PAL.ink;
    }
  }
  // cheeks
  c.fillStyle = "rgba(255,92,122,.32)";
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(s * rx * 0.62, ey + er * 1.7, er * 0.9, er * 0.55, 0, 0, 6.283);
    c.fill();
  }
  // mouth
  const my = ey + er * 2.05;
  c.fillStyle = PAL.ink;
  c.strokeStyle = PAL.ink;
  if (face === "eat" || face === "cheer") {
    const open = face === "eat" ? 1 : 0.8;
    c.beginPath();
    c.ellipse(0, my + er * 0.2, er * 1.05, er * 0.9 * open, 0, 0, 6.283);
    c.fill();
    c.fillStyle = PAL.coral;
    c.beginPath();
    c.ellipse(0, my + er * 0.6, er * 0.62, er * 0.4 * open, 0, 0, 6.283);
    c.fill();
  } else if (face === "ouch") {
    c.beginPath();
    c.ellipse(0, my + er * 0.35, er * 0.5, er * 0.36, 0, 0, 6.283);
    c.fill();
  } else {
    c.beginPath();
    c.arc(0, my - er * 0.4, er * (face === "happy" ? 0.95 : 0.7), Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  }
  c.restore();
}

export function drawGlowOrb(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lit: number): void {
  c.save();
  // halo
  c.globalCompositeOperation = "lighter";
  const h = c.createRadialGradient(x, y, r * 0.5, x, y, r * (1.5 + lit * 0.9));
  h.addColorStop(0, rgba(color, 0.15 + 0.5 * lit));
  h.addColorStop(1, rgba(color, 0));
  c.fillStyle = h;
  c.beginPath();
  c.arc(x, y, r * (1.5 + lit * 0.9), 0, 6.283);
  c.fill();
  c.restore();
  // glass body
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.35 + lit * 0.45));
  g.addColorStop(0.55, lit > 0.05 ? shade(color, lit * 0.15) : shade(color, -0.45));
  g.addColorStop(1, shade(color, -0.55 + lit * 0.35));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, 6.283);
  c.fill();
  c.strokeStyle = rgba("#ffffff", 0.18 + lit * 0.3);
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = rgba("#ffffff", 0.35 + lit * 0.3);
  c.beginPath();
  c.ellipse(x - r * 0.32, y - r * 0.4, r * 0.3, r * 0.16, -0.6, 0, 6.283);
  c.fill();
}
