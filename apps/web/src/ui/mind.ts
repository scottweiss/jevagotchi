import type { Behavior, PetState } from "@jevagotchi/core";
import { icons } from "./icons.js";
import { moodColor, WANT_TEXT } from "./mood.js";
import { ago, capitalise, clamp01, duration, esc, reducedMotion } from "./util.js";

export interface MindState {
  pet: PetState;
  behavior: Behavior | null;
  telemetry: {
    latencyMs: number; inputTokens: number; model: string; spend: number;
    distribution: { label: string; p: number }[]; confidence: number;
    degraded: string[]; offline: boolean;
  };
  /** Wall-clock ms of the most recent successful reading, 0 if none. */
  readAt: number;
}

interface Row {
  label: string;
  el: HTMLElement;
  fill: HTMLElement;
  pct: HTMLElement;
  target: number;
  p: number; pv: number;
  y: number; yv: number; ty: number;
  leaving: boolean;
}

const ROW_H = 40;

/** One damped spring step. Slightly underdamped so bars overshoot and settle. */
function spring(x: number, v: number, target: number, dt: number, k = 170, c = 15): [number, number] {
  const a = k * (target - x) - c * v;
  const nv = v + a * dt;
  return [x + nv * dt, nv];
}

const pct = (n: number): string => `${Math.round(clamp01(n) * 100)}%`;

export class MindPanel {
  private rows = new Map<string, Row>();
  private open = false;
  private lastTele: unknown = null;
  private st: MindState | null = null;
  private reduce = reducedMotion();

  private els: {
    close: HTMLButtonElement; model: HTMLElement; orb: HTMLElement; ring: SVGCircleElement;
    mood: HTMLElement; sure: HTMLElement; when: HTMLElement; dist: HTMLElement; empty: HTMLElement;
    note: HTMLElement; vitals: HTMLElement; foot: HTMLElement; scroll: HTMLElement;
  };

  constructor(private root: HTMLElement, private onClose: () => void) {
    root.innerHTML = `
      <div class="grab" aria-hidden="true"></div>
      <header class="mind-head">
        <div>
          <h2>Mind</h2>
          <p class="mind-model"></p>
        </div>
        <button class="icon-btn" type="button" aria-label="Close Mind">${icons.close}</button>
      </header>
      <div class="mind-scroll">
        <section class="feel" aria-live="polite">
          <div class="orb" data-state="wait">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="o-track" cx="50" cy="50" r="45"/>
              <circle class="o-arc" cx="50" cy="50" r="45" stroke-dasharray="282.7" stroke-dashoffset="282.7" transform="rotate(-90 50 50)"/>
            </svg>
            <span class="orb-core"></span>
          </div>
          <div class="feel-text">
            <p class="feel-mood">Waking up</p>
            <p class="feel-sure"></p>
            <p class="feel-when"></p>
          </div>
        </section>
        <section class="mind-sec">
          <h3>What it might be feeling</h3>
          <p class="dist-hint">Jev gives every feeling a chance. The creature picks one at random, weighted by these.</p>
          <div class="dist" role="list" aria-label="Chance of each feeling"></div>
          <div class="dist-empty"></div>
        </section>
        <p class="mind-note" hidden></p>
        <section class="mind-sec">
          <h3>Vitals</h3>
          <dl class="vitals"></dl>
        </section>
        <p class="mind-foot"></p>
      </div>`;
    const q = <T extends Element>(s: string): T => root.querySelector<T>(s)!;
    this.els = {
      close: q("button"), model: q(".mind-model"), orb: q(".orb"), ring: q(".o-arc"),
      mood: q(".feel-mood"), sure: q(".feel-sure"), when: q(".feel-when"), dist: q(".dist"),
      empty: q(".dist-empty"), note: q(".mind-note"), vitals: q(".vitals"), foot: q(".mind-foot"),
      scroll: q(".mind-scroll"),
    };
    this.els.close.addEventListener("click", () => this.onClose());
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); this.onClose(); } });
    // Drag the handle down on mobile to dismiss.
    const grab = q<HTMLElement>(".grab");
    let sy = 0, dy = 0, drag = false;
    grab.addEventListener("pointerdown", (e) => { drag = true; sy = e.clientY; grab.setPointerCapture(e.pointerId); root.style.transition = "none"; });
    grab.addEventListener("pointermove", (e) => { if (!drag) return; dy = Math.max(0, e.clientY - sy); root.style.transform = `translateY(${dy}px)`; });
    const end = (): void => {
      if (!drag) return; drag = false; root.style.transition = ""; root.style.transform = "";
      if (dy > 90) this.onClose();
      dy = 0;
    };
    grab.addEventListener("pointerup", end);
    grab.addEventListener("pointercancel", end);
  }

  get isOpen(): boolean { return this.open; }

  setOpen(o: boolean): void {
    this.open = o;
    this.root.classList.toggle("open", o);
    this.root.setAttribute("aria-hidden", String(!o));
    // inert keeps hidden controls out of the tab order without a display flash
    (this.root as HTMLElement & { inert: boolean }).inert = !o;
    if (o) { this.sync(this.st); this.snap(); }
  }

  /** Called on every game change. Cheap: only touches targets and text. */
  sync(st: MindState | null): void {
    if (!st) return;
    this.st = st;
    if (!this.open) return;
    const { pet, behavior: b, telemetry: t } = st;
    const fresh = this.lastTele !== t;
    this.lastTele = t;

    this.els.model.textContent = t.offline ? "Not connected" : t.model ? t.model : "Waking up";

    // Distribution rows, keyed by label so bars glide instead of being redrawn.
    const dist = t.offline && t.distribution.length === 0 ? [] : t.distribution;
    const seen = new Set<string>();
    dist.forEach((d, i) => {
      seen.add(d.label);
      const r = this.row(d.label);
      r.leaving = false; r.target = d.p; r.ty = i * ROW_H;
      r.el.style.setProperty("--c", moodColor(d.label));
      r.el.classList.toggle("top", i === 0);
    });
    let tail = dist.length;
    for (const r of this.rows.values()) {
      if (!seen.has(r.label)) { r.leaving = true; r.target = 0; r.ty = tail++ * ROW_H; }
    }
    this.els.dist.style.height = `${Math.max(dist.length, 1) * ROW_H}px`;
    this.els.dist.hidden = dist.length === 0;
    this.els.empty.hidden = dist.length !== 0;
    this.els.empty.innerHTML = t.offline
      ? `<span class="e-orb"></span><p><b>Jev isn't connected.</b> ${esc(pet.name)} keeps living, but it can't show how it feels. Start the API host with <code>npm run dev</code> and the readings will begin on their own.</p>`
      : `<span class="e-orb"></span><p><b>Waiting for the first reading.</b> It usually takes under a second.</p>`;

    // The headline feeling.
    const top = dist[0];
    const mood = pet.dead ? "gone" : b?.mood ?? top?.label ?? null;
    const state = pet.dead ? "off" : t.offline && !b ? "off" : !b ? "wait" : b.demeanour;
    this.els.orb.dataset["state"] = state;
    this.els.orb.style.setProperty("--c", mood ? moodColor(mood) : "#ECE9FF");
    this.els.ring.style.strokeDashoffset = String(282.7 * (1 - (b ? clamp01(t.confidence) : 0)));
    this.els.mood.textContent = pet.dead ? "Gone" : mood ? capitalise(mood) : t.offline ? "Can't tell" : "Waking up";
    this.els.sure.textContent = !b ? "" : b.demeanour === "decisive"
      ? `Sure of itself, ${pct(t.confidence)}`
      : b.demeanour === "hesitant" ? `Torn, only ${pct(t.confidence)} sure` : `No clear reading, ${pct(t.confidence)}`;
    this.updateWhen();
    if (fresh) { this.els.orb.classList.remove("ping"); void this.els.orb.offsetWidth; this.els.orb.classList.add("ping"); }

    this.renderNote(st);
    this.renderVitals(st);

    const parts: string[] = [];
    if (t.latencyMs) parts.push(`Last reading took ${t.latencyMs} ms`);
    if (t.inputTokens) parts.push(`${t.inputTokens.toLocaleString()} tokens`);
    if (t.spend) parts.push(`$${t.spend.toFixed(5)} spent so far this visit`);
    this.els.foot.textContent = parts.length ? `${parts.join(", ")}.` : "No readings yet this visit.";
  }

  private updateWhen(): void {
    const s = this.st;
    this.els.when.textContent = !s || !s.readAt ? "" : `Read ${ago(Date.now() - s.readAt)}`;
  }

  private renderNote(st: MindState): void {
    const { pet, behavior: b, telemetry: t } = st;
    let text = "", tone = "calm";
    if (t.offline) { text = "Can't reach Jev. The pet keeps living; it just stops showing feelings until the connection is back."; tone = "alarm"; }
    else if (t.degraded.length) { text = `Jev's answers for ${t.degraded.join(", ")} were unreadable, so those readings are placeholders, not the model.`; tone = "alarm"; }
    else if (b?.demeanour === "hesitant") text = `Torn between ${b.mood} and ${b.alternateMood ?? "something else"}. It flickers between the two because the model is genuinely undecided.`;
    else if (b?.demeanour === "confused") text = "No clear reading. The creature holds still rather than pretend to a feeling it doesn't have.";
    else if (pet.metabolism > 1.05) text = `Its appetite is up to ${pet.metabolism.toFixed(2)} times normal. The better you care for it, the more it needs.`;
    this.els.note.hidden = !text;
    this.els.note.textContent = text;
    this.els.note.dataset["tone"] = tone;
  }

  private renderVitals(st: MindState): void {
    const { pet, behavior: b, telemetry: t } = st;
    const bar = (v: number): string => `<i class="vbar"><b style="width:${Math.round(clamp01(v) * 100)}%"></b></i>`;
    const rows: [string, string, string?][] = [
      ["Feeling", pet.dead ? "Gone" : b ? capitalise(b.mood) : "Not yet"],
      ["Wants", pet.dead ? "Nothing" : b ? capitalise(WANT_TEXT[b.want] ?? b.want) : "Not yet"],
      ["Certainty", b ? pct(t.confidence) : "Not yet", b ? bar(t.confidence) : ""],
      ["Likes you", b ? pct(b.affection) : "Not yet", b ? bar(b.affection) : ""],
      ["How badly", b ? pct(b.urgency) : "Not yet", b ? bar(b.urgency) : ""],
      ["Your care", b ? pct(b.careEfficiency) : "Not yet", b ? bar(b.careEfficiency) : ""],
      ["Appetite", `${pet.metabolism.toFixed(2)}x`],
      ["Age", duration(pet.ageMinutes)],
    ];
    const sig = JSON.stringify(rows);
    if (this.els.vitals.dataset["sig"] === sig) return;
    this.els.vitals.dataset["sig"] = sig;
    this.els.vitals.innerHTML = rows.map(([k, v, extra]) => `<div><dt>${k}</dt><dd>${esc(v)}${extra ?? ""}</dd></div>`).join("");
  }

  private row(label: string): Row {
    let r = this.rows.get(label);
    if (r) return r;
    const el = document.createElement("div");
    el.className = "drow";
    el.setAttribute("role", "listitem");
    el.innerHTML = `<span class="dl">${esc(label)}</span><span class="dtrack"><i class="dfill"></i></span><span class="dp">0%</span>`;
    this.els.dist.append(el);
    const y = this.rows.size * ROW_H;
    r = { label, el, fill: el.querySelector(".dfill")!, pct: el.querySelector(".dp")!, target: 0, p: 0, pv: 0, y, yv: 0, ty: y, leaving: false };
    this.rows.set(label, r);
    return r;
  }

  /** Jump straight to targets (on open, or with reduced motion). */
  private snap(): void {
    for (const r of this.rows.values()) { r.p = r.target; r.pv = 0; r.y = r.ty; r.yv = 0; this.paint(r); }
  }

  private paint(r: Row): void {
    r.fill.style.width = `${Math.max(0, r.p) * 100}%`;
    r.pct.textContent = pct(r.p);
    r.el.style.transform = `translateY(${r.y}px)`;
    r.el.style.opacity = r.leaving ? String(clamp01(r.p * 8)) : "1";
  }

  private whenTimer = 0;

  /** rAF driver. Does nothing while closed. */
  tick(dt: number): void {
    if (!this.open) return;
    this.whenTimer += dt;
    if (this.whenTimer > 1) { this.whenTimer = 0; this.updateWhen(); }
    if (this.reduce) { this.snap(); }
    else {
      const h = Math.min(dt, 0.033);
      for (const r of this.rows.values()) {
        [r.p, r.pv] = spring(r.p, r.pv, r.target, h);
        [r.y, r.yv] = spring(r.y, r.yv, r.ty, h, 220, 24);
        this.paint(r);
      }
    }
    for (const [k, r] of this.rows) {
      if (r.leaving && r.p < 0.004 && Math.abs(r.pv) < 0.02) { r.el.remove(); this.rows.delete(k); }
    }
  }
}
