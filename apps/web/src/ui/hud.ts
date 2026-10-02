import { icons } from "./icons.js";
import { capitalise, duration, html } from "./util.js";

export type DockAction = "feed" | "play" | "clean" | "lights" | "medicine" | "scold";

export interface HudState {
  name: string;
  species: string;
  stage: string;
  ageMinutes: number;
  dead: boolean;
  asleep: boolean;
  sick: boolean;
  /** Which dock actions the pet would currently refuse. */
  refused: Record<DockAction, boolean>;
  /** 0-1 urgency per dock action, 0 when the pet doesn't need it. */
  urgency: Record<DockAction, number>;
  gauges: { fed: number; rested: number; clean: number; joy: number };
  muted: boolean;
  mindOpen: boolean;
  timeOfDay: number;
  /** Wardrobe star balance, shown beside the wardrobe button. */
  stars?: number;
}

const ACTIONS: { id: DockAction; label: string; key: string; tint: string; deep: string }[] = [
  { id: "feed", label: "Feed", key: "F", tint: "#FFB58A", deep: "#c4653f" },
  { id: "play", label: "Play", key: "P", tint: "#FF8FC7", deep: "#b83f83" },
  { id: "clean", label: "Clean", key: "C", tint: "#38D6B8", deep: "#178a78" },
  { id: "lights", label: "Lights", key: "L", tint: "#9C86F0", deep: "#5b45b8" },
  { id: "medicine", label: "Medicine", key: "M", tint: "#FFE58F", deep: "#b8952c" },
  { id: "scold", label: "Scold", key: "S", tint: "#FF7A45", deep: "#b0421c" },
];

const GAUGES = [
  { id: "fed", label: "Fed", icon: "feed", color: "#FFB58A" },
  { id: "rested", label: "Rested", icon: "moon", color: "#9C86F0" },
  { id: "clean", label: "Clean", icon: "clean", color: "#38D6B8" },
  { id: "joy", label: "Joy", icon: "heart", color: "#FF8FC7" },
] as const;

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

export interface HudCallbacks {
  action(a: DockAction): void;
  mind(e: MouseEvent): void;
  mute(): void;
  menu(): void;
  /** Opens the wardrobe; when absent the button is not drawn. */
  wardrobe?(): void;
}

export class Hud {
  private tbName: HTMLElement;
  private tbSub: HTMLElement;
  private mindBtn: HTMLButtonElement;
  private wardrobeBtn: HTMLButtonElement | null = null;
  private starsEl: HTMLElement | null = null;
  private lastStars = -1;
  private muteBtn: HTMLButtonElement;
  private menuBtn: HTMLButtonElement;
  private acts = new Map<DockAction, HTMLButtonElement>();
  private rings = new Map<string, { root: HTMLElement; arc: SVGCircleElement; val: HTMLElement }>();

  constructor(topbar: HTMLElement, gauges: HTMLElement, dock: HTMLElement, cb: HudCallbacks) {
    topbar.innerHTML = `
      <div class="tb-id">
        <span class="tb-orb" aria-hidden="true"></span>
        <div class="tb-text"><h1 class="tb-name"></h1><p class="tb-sub"></p></div>
      </div>
      <div class="tb-actions">
        ${cb.wardrobe ? `<button class="chip" id="btn-wardrobe" type="button" aria-haspopup="dialog">${icons.hat}<span>Wardrobe</span><em class="tb-stars" aria-hidden="true"></em></button>` : ""}
        <button class="chip" id="btn-mind" type="button" aria-controls="mind" aria-expanded="false">${icons.mind}<span>Mind</span></button>
        <button class="icon-btn" id="btn-mute" type="button" aria-pressed="false"></button>
        <button class="icon-btn" id="btn-menu" type="button" aria-label="Menu" aria-haspopup="dialog">${icons.menu}</button>
      </div>`;
    this.tbName = topbar.querySelector(".tb-name")!;
    this.tbSub = topbar.querySelector(".tb-sub")!;
    this.mindBtn = topbar.querySelector("#btn-mind")!;
    this.muteBtn = topbar.querySelector("#btn-mute")!;
    this.menuBtn = topbar.querySelector("#btn-menu")!;
    this.mindBtn.addEventListener("click", cb.mind);
    if (cb.wardrobe) {
      this.wardrobeBtn = topbar.querySelector("#btn-wardrobe");
      this.starsEl = topbar.querySelector(".tb-stars");
      this.wardrobeBtn!.addEventListener("click", cb.wardrobe);
    }
    this.muteBtn.addEventListener("click", cb.mute);
    this.menuBtn.addEventListener("click", cb.menu);

    for (const g of GAUGES) {
      const el = html(`
        <div class="gauge" data-g="${g.id}" style="--c:${g.color}" role="img">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle class="g-track" cx="20" cy="20" r="${RING_R}"/>
            <circle class="g-arc" cx="20" cy="20" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
          </svg>
          <span class="g-icon">${icons[g.icon]}</span>
          <span class="g-text"><span class="g-label">${g.label}</span><span class="g-val">0</span></span>
        </div>`);
      gauges.append(el);
      this.rings.set(g.id, { root: el, arc: el.querySelector(".g-arc")!, val: el.querySelector(".g-val")! });
    }

    for (const a of ACTIONS) {
      const b = html<HTMLButtonElement>(`
        <button class="act" type="button" data-action="${a.id}" style="--tint:${a.tint};--deep:${a.deep}">
          <span class="cap">
            <span class="ico"></span>
            <span class="badge" aria-hidden="true">!</span>
          </span>
          <span class="lbl">${a.label}</span>
          <kbd aria-hidden="true">${a.key}</kbd>
        </button>`);
      b.addEventListener("click", () => {
        cb.action(a.id);
        if (b.getAttribute("aria-disabled") === "true") this.shake(b);
      });
      dock.append(b);
      this.acts.set(a.id, b);
    }
  }

  shake(b: HTMLElement): void {
    b.classList.remove("shake");
    void b.offsetWidth;
    b.classList.add("shake");
  }

  shakeAction(a: DockAction): void {
    const b = this.acts.get(a);
    if (b) this.shake(b);
  }

  update(s: HudState): void {
    this.tbName.textContent = s.name;
    this.tbSub.textContent = s.dead
      ? "Gone, but not forgotten"
      : s.stage === "egg"
        ? `An egg, ${duration(s.ageMinutes)}`
        : `${capitalise(s.stage)} ${s.species === "egg" ? "spirit" : s.species}, ${duration(s.ageMinutes)}`;

    if (this.wardrobeBtn && this.starsEl && s.stars !== undefined && s.stars !== this.lastStars) {
      const gained = this.lastStars >= 0 && s.stars > this.lastStars;
      this.lastStars = s.stars;
      this.starsEl.innerHTML = `${icons.star}${s.stars}`;
      this.wardrobeBtn.setAttribute("aria-label", `Wardrobe, ${s.stars} star${s.stars === 1 ? "" : "s"}`);
      if (gained) { this.wardrobeBtn.classList.remove("gain"); void this.wardrobeBtn.offsetWidth; this.wardrobeBtn.classList.add("gain"); }
    }
    this.mindBtn.setAttribute("aria-expanded", String(s.mindOpen));
    this.mindBtn.classList.toggle("on", s.mindOpen);
    this.muteBtn.innerHTML = s.muted ? icons.soundOff : icons.soundOn;
    this.muteBtn.setAttribute("aria-label", s.muted ? "Turn sound on" : "Mute sound");
    this.muteBtn.setAttribute("aria-pressed", String(s.muted));

    for (const g of GAUGES) {
      const v = Math.max(0, Math.min(100, s.gauges[g.id]));
      const r = this.rings.get(g.id)!;
      r.arc.style.strokeDashoffset = String(RING_C * (1 - v / 100));
      r.val.textContent = String(Math.round(v));
      r.root.dataset["low"] = String(v < 25);
      r.root.setAttribute("aria-label", `${g.label}: ${Math.round(v)} out of 100`);
    }

    for (const a of ACTIONS) {
      const b = this.acts.get(a.id)!;
      const asleepLights = a.id === "lights" && s.asleep;
      const ico = b.querySelector(".ico")!;
      const icon = a.id === "lights" ? (s.asleep ? icons.sun : icons.moon) : icons[a.id as "feed"];
      if (ico.innerHTML !== icon) ico.innerHTML = icon;
      const label = a.id === "lights"
        ? (s.asleep ? "Turn lights on" : "Turn lights off")
        : a.id === "medicine" && s.sick ? "Medicine (it's sick)" : a.label;
      b.setAttribute("aria-label", label);
      const refused = s.dead || s.refused[a.id];
      b.setAttribute("aria-disabled", String(refused));
      const u = refused ? 0 : s.urgency[a.id];
      b.style.setProperty("--u", u.toFixed(2));
      b.dataset["urgent"] = String(u > 0.15);
      b.classList.toggle("alt", asleepLights);
      b.classList.toggle("has-badge", a.id === "medicine" && s.sick && !s.dead);
    }
  }
}
