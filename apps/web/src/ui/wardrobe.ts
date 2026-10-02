/**
 * The wardrobe: a live preview of the creature (and room) wearing whatever you point at,
 * a tabbed shelf of items, and buy / wear / take-off. Stars are the only currency.
 */
import {
  buyRefusal, isEquipped, isUnlocked, isWearSlot, itemById, itemsInSlot,
  type Equipped, type Item, type ItemSlot, type RoomSetup, type Species,
} from "@jevagotchi/core";
import type { CreatureParams, CreatureView, SfxName } from "../contracts.js";
import { createCreature, drawAccessoryIcon } from "../creatures/index.js";
import type { Game } from "../game.js";
import { Decor, drawDecorIcon } from "../scene/decor.js";
import { bakeAll, computeLayout, drawSky, type Layers, type Layout } from "../scene/room.js";
import { makeSky, skyAt } from "../scene/sky.js";
import { icons } from "./icons.js";
import { dismissBtn, openModal, wireClose, type Modal } from "./overlays.js";
import { esc, reducedMotion } from "./util.js";
import "./wardrobe.css";

const CATS: { slot: ItemSlot; label: string; none: string }[] = [
  { slot: "hat", label: "Hats", none: "Bare head" },
  { slot: "face", label: "Face", none: "Bare face" },
  { slot: "neck", label: "Neck", none: "Nothing" },
  { slot: "held", label: "Hold", none: "Empty hands" },
  { slot: "wallpaper", label: "Walls", none: "Plain walls" },
  { slot: "rug", label: "Rugs", none: "Teal rug" },
  { slot: "lamp", label: "Lamps", none: "No lamp" },
  { slot: "wall", label: "Art", none: "The sunset" },
];

const SPECIES_ORDER: Species[] = ["blobule", "jevling", "placid", "feral", "needy", "stoic", "insatiable"];
const SPECIES_LABEL: Record<string, string> = {
  blobule: "Blobule", jevling: "Jevling", placid: "Placid", feral: "Feral", needy: "Needy", stoic: "Stoic", insatiable: "Insatiable",
};

export interface WardrobeOpts {
  game: Game;
  sfx(n: SfxName): void;
  /** Fired after any purchase or change, so the host can react (e.g. save toast, stage sparkle). */
  onChange?(what: "buy" | "wear" | "remove", item: Item): void;
}

/* ---- the live preview ------------------------------------------------------ */

const VW = 520, VH = 380;

class Preview {
  readonly creature: CreatureView = createCreature();
  readonly decor = new Decor();
  private L: Layout;
  private layers: Layers;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private now = 0;
  private w = 1; private h = 1; private dpr = 1;
  private roomMix = 0; private roomTarget = 0;
  private evening = 0; private eveningTarget = 0;
  private sky = makeSky();
  private ro: ResizeObserver;
  private reduced = reducedMotion();
  private params: CreatureParams;
  private lastSpecies = "";

  constructor(private canvas: HTMLCanvasElement, species: Species, mood: CreatureParams["mood"]) {
    this.ctx = canvas.getContext("2d")!;
    const bakeDpr = Math.min(2.25, Math.max(1, window.devicePixelRatio || 1) * 1.4);
    this.L = computeLayout(VW, VH, bakeDpr);
    this.layers = { ...bakeAll(this.L), shaft: document.createElement("canvas") };
    this.params = {
      species, stage: "adult", mood, asleep: false, sick: false, hunger: 20, energy: 80, hygiene: 80, urgency: 0,
      want: "nothing", hesitant: false, gaze: null, hueShift: 0.5,
    };
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  setSpecies(s: Species): void {
    this.params = { ...this.params, species: s, stage: s === "egg" ? "baby" : "adult" };
  }
  setRoomView(on: boolean, evening: boolean): void { this.roomTarget = on ? 1 : 0; this.eveningTarget = evening ? 1 : 0; }
  cheer(): void { this.creature.react("happy"); }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(r.width)); this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
  }

  start(): void {
    const loop = (t: number): void => {
      const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 1 / 60);
      this.last = t; this.now = t;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop(): void { cancelAnimationFrame(this.raf); this.ro.disconnect(); }

  private frame(dt: number): void {
    const { ctx, L, w, h } = this;
    const k = this.reduced ? 1 : 1 - Math.exp(-dt * 7);
    this.roomMix += (this.roomTarget - this.roomMix) * k;
    this.evening += (this.eveningTarget - this.evening) * (this.reduced ? 1 : 1 - Math.exp(-dt * 4));
    this.creature.update(dt, this.params);

    // camera: tight on the creature for clothes, the whole room for decor
    const s = L.size;
    const wearW = s * 2.7, wearCx = L.cx, wearCy = L.cy - s * 0.1;
    const roomW = VW * 0.98, roomCx = VW / 2, roomCy = VH * 0.5;
    const lerp = (a: number, b: number): number => a + (b - a) * this.roomMix;
    const camW = lerp(wearW, roomW), camCx = lerp(wearCx, roomCx), camCy = lerp(wearCy, roomCy);
    const scale = w / camW;
    const camH = h / scale;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = "#1B1638"; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-(camCx - camW / 2), -(camCy - camH / 2));

    const sky = skyAt(0.4 + 0.44 * this.evening, this.sky);
    const M = L.M, lw = L.W + M * 2, lh = L.H + M * 2, off = { x: 0, y: 0 };
    ctx.drawImage(this.layers.wall, -M, -M, lw, lh);
    this.decor.drawWall(ctx, L, off);
    ctx.drawImage(this.layers.floor, -M, -M, lw, lh);
    this.decor.drawFloor(ctx, L, off);
    ctx.drawImage(this.layers.props, -M, -M, lw, lh);
    this.decor.drawLamp(ctx, L, off, this.now, 0.3 + 0.7 * this.evening, this.reduced);
    // ambient light, the same way the room does it
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(${sky.amb[0] | 0},${sky.amb[1] | 0},${sky.amb[2] | 0})`;
    ctx.fillRect(-M, -M, lw, lh);
    ctx.globalCompositeOperation = "source-over";
    drawSky(ctx, L, sky, this.now, 0, 0, this.evening * 0.2 * sky.day);
    ctx.globalCompositeOperation = "lighter";
    this.decor.drawGlow(ctx, L, off, this.now, 0.3 + 0.7 * this.evening);
    ctx.globalCompositeOperation = "source-over";

    // soft shadow, then the creature
    const sx = L.cx, sy = L.feetY + s * 0.01, rx = s * 0.44;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.24);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    sg.addColorStop(0, "rgba(38,18,52,.55)"); sg.addColorStop(1, "rgba(38,18,52,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.3); ctx.fill(); ctx.restore();
    this.creature.draw(ctx, L.cx, L.cy, L.size);
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, "rgba(27,22,56,0)"); vg.addColorStop(1, "rgba(27,22,56,.5)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }
}

/* ---- the panel --------------------------------------------------------------- */

const starIcon = (): string => `<span class="wd-star" aria-hidden="true">${icons.star}</span>`;

function tileIcon(item: Item | null, slot: ItemSlot): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const W = 64, H = 56, dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = W * dpr; c.height = H * dpr; c.className = "wd-icon";
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  if (!item) {
    g.strokeStyle = "rgba(236,233,255,.4)"; g.lineWidth = 2; g.lineCap = "round"; g.setLineDash([2, 6]);
    g.beginPath(); g.arc(W / 2, H / 2, 16, 0, 6.3); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.moveTo(W / 2 - 9, H / 2 + 9); g.lineTo(W / 2 + 9, H / 2 - 9); g.stroke();
    return c;
  }
  const room = !isWearSlot(slot);
  const pw = room && slot !== "wallpaper" ? 60 : room ? 54 : 56;
  g.save(); g.translate((W - pw) / 2, (H - Math.min(pw, H)) / 2);
  if (room) drawDecorIcon(g, item.id, pw, Math.min(pw, H)); else drawAccessoryIcon(g, item.id, pw, Math.min(pw, H));
  g.restore();
  return c;
}

export function openWardrobe(host: HTMLElement, o: WardrobeOpts): Modal {
  const { game } = o;
  let cat = 0;
  let sel: string | null = null; // item id, "" for the empty tile, null = follow what is worn
  let speciesIdx = -1;
  let said = "";

  const m = openModal(host, `
    <header class="wd-head">
      <h2>Wardrobe</h2>
      <p class="wd-bal" role="status" aria-live="polite"></p>
      ${dismissBtn()}
    </header>
    <div class="wd-body">
      <section class="wd-left" aria-label="Preview">
        <div class="wd-view">
          <canvas class="wd-canvas" role="img" aria-label="Your pet wearing the selected item"></canvas>
          <button class="wd-species" type="button" hidden></button>
        </div>
      </section>
      <section class="wd-right">
        <div class="tabs wd-tabs" role="tablist" aria-label="Wardrobe sections">
          ${CATS.map((c, i) => `<button class="tab" role="tab" type="button" id="wd-tab-${c.slot}" data-i="${i}" aria-controls="wd-panel">${c.label}</button>`).join("")}
        </div>
        <div class="wd-grid-wrap" id="wd-panel" role="tabpanel"><ul class="wd-grid"></ul></div>
        <div class="wd-detail"></div>
      </section>
    </div>
    <p class="sr-only" role="status" aria-live="polite" id="wd-say"></p>`, { label: "Wardrobe", cls: "wardrobe" });
  wireClose(m);
  const $q = <T extends Element>(s: string): T => m.el.querySelector<T>(s)!;
  const bal = $q<HTMLElement>(".wd-bal"), grid = $q<HTMLElement>(".wd-grid"), detail = $q<HTMLElement>(".wd-detail");
  const tabs = [...m.el.querySelectorAll<HTMLButtonElement>(".wd-tabs .tab")];
  const speciesBtn = $q<HTMLButtonElement>(".wd-species"), sayEl = $q<HTMLElement>("#wd-say");

  const pet = game.save.pet;
  const shown = (): Species[] => {
    const seen = new Set<Species>([...game.save.codex.species.filter((s) => s !== "egg")]);
    if (pet.species !== "egg") seen.add(pet.species);
    const list = SPECIES_ORDER.filter((s) => seen.has(s));
    return list.length ? list : ["blobule"];
  };
  const speciesList = shown();
  speciesIdx = Math.max(0, speciesList.indexOf(pet.species));
  const preview = new Preview($q<HTMLCanvasElement>(".wd-canvas"), speciesList[speciesIdx]!, game.behavior?.mood ?? "content");
  preview.start();
  // Every way of closing (button, Escape, scrim) ends with the card leaving the DOM.
  const stopObs = new MutationObserver(() => { if (!m.el.isConnected) { preview.stop(); stopObs.disconnect(); } });
  stopObs.observe(host, { childList: true });

  const w = (): typeof game.save.wardrobe => game.save.wardrobe;
  const slot = (): ItemSlot => CATS[cat]!.slot;
  const items = (): Item[] => itemsInSlot(slot());
  const wornId = (s: ItemSlot): string | undefined => (isWearSlot(s) ? w().equipped[s] : w().room[s]);
  const current = (): string => (sel === null ? wornId(slot()) ?? "" : sel);
  const say = (t: string): void => { said = t; sayEl.textContent = ""; requestAnimationFrame(() => { sayEl.textContent = said; }); };

  /** What the preview shows: what is worn, with the highlighted item swapped in. */
  const applyPreview = (): void => {
    const eq: Equipped = { ...w().equipped }; const room: RoomSetup = { ...w().room };
    const s = slot(), id = current();
    const target = isWearSlot(s) ? eq : room;
    if (id) (target as Record<string, string | undefined>)[s] = id; else delete (target as Record<string, string | undefined>)[s];
    preview.creature.setAccessories?.(eq);
    preview.decor.setRoom(room);
    preview.setRoomView(!isWearSlot(s), s === "lamp");
  };

  const renderBal = (): void => {
    const n = w().stars;
    bal.innerHTML = `${starIcon()}<b>${n}</b> star${n === 1 ? "" : "s"}`;
  };

  const status = (it: Item): string => {
    if (isEquipped(w(), it)) return `<span class="wd-st on">${isWearSlot(it.slot) ? "Worn" : "In use"}</span>`;
    if (w().owned.includes(it.id)) return `<span class="wd-st">Owned</span>`;
    if (!isUnlocked(it, game.save.codex)) return `<span class="wd-st lock">${icons.lock}Locked</span>`;
    return `<span class="wd-st price${w().stars >= it.price ? "" : " short"}">${starIcon()}${it.price}</span>`;
  };

  const renderGrid = (): void => {
    const id = current();
    grid.replaceChildren();
    const mkTile = (item: Item | null): HTMLLIElement => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button"; b.className = "wd-item"; b.dataset["id"] = item?.id ?? "";
      const on = (item?.id ?? "") === id;
      b.setAttribute("aria-pressed", String(on));
      b.tabIndex = on ? 0 : -1;
      const locked = !!item && !w().owned.includes(item.id) && !isUnlocked(item, game.save.codex);
      b.classList.toggle("locked", locked);
      b.classList.toggle("worn", !!item && isEquipped(w(), item));
      b.append(tileIcon(item, slot()));
      const name = document.createElement("span"); name.className = "wd-name"; name.textContent = item?.name ?? CATS[cat]!.none; b.append(name);
      const st = document.createElement("span"); st.className = "wd-stw";
      st.innerHTML = item ? status(item) : `<span class="wd-st">${wornId(slot()) ? "Take off" : "Current"}</span>`;
      b.append(st);
      li.append(b);
      return li;
    };
    grid.append(mkTile(null));
    for (const it of items()) grid.append(mkTile(it));
  };

  const renderDetail = (): void => {
    const id = current();
    const it = itemById(id);
    if (!it) {
      const worn = itemById(wornId(slot()));
      detail.innerHTML = `<div class="wd-info"><h3>${esc(CATS[cat]!.none)}</h3><p>${worn ? `Takes off the ${esc(worn.name.toLowerCase())}.` : "Nothing here yet. Pick something to try it on."}</p></div>
        ${worn ? `<div class="wd-act"><button class="btn ghost" type="button" data-act="remove" data-autofocus>${isWearSlot(slot()) ? "Take it off" : "Put it away"}</button></div>` : ""}`;
      return;
    }
    const owned = w().owned.includes(it.id);
    const on = isEquipped(w(), it);
    const why = buyRefusal(w(), it.id, game.save.codex);
    let hint = "", btn = "";
    const room = !isWearSlot(it.slot);
    if (owned) {
      btn = on
        ? `<button class="btn ghost" type="button" data-act="remove">${room ? "Put it away" : "Take it off"}</button>`
        : `<button class="btn primary" type="button" data-act="wear">${room ? "Use it" : "Wear it"}</button>`;
      hint = on ? (room ? "It's in the room." : `${esc(game.save.pet.name)} is wearing it.`) : "Yours already.";
    } else if (why === "locked") {
      hint = `<span class="wd-lockline">${icons.lock}<span>Locked. ${esc(it.unlock?.hint ?? "")}</span></span>`;
      btn = `<button class="btn ghost" type="button" aria-disabled="true" data-act="locked">Locked</button>`;
    } else if (why === "poor") {
      const need = it.price - w().stars;
      hint = `${need} more star${need === 1 ? "" : "s"} to go. Minigames pay 2 stars for each star you earn.`;
      btn = `<button class="btn primary" type="button" aria-disabled="true" data-act="poor">Buy for ${starIcon()}${it.price}</button>`;
    } else {
      hint = "Buying it puts it on straight away.";
      btn = `<button class="btn primary" type="button" data-act="buy">Buy for ${starIcon()}${it.price}</button>`;
    }
    detail.innerHTML = `<div class="wd-info"><h3>${esc(it.name)}</h3><p>${esc(it.blurb)}</p><p class="wd-hint">${hint}</p></div><div class="wd-act">${btn}</div>`;
  };

  const render = (): void => {
    tabs.forEach((t, i) => { const on = i === cat; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
    $q<HTMLElement>(".wd-grid-wrap").setAttribute("aria-labelledby", `wd-tab-${slot()}`);
    renderBal(); renderGrid(); renderDetail(); applyPreview();
    if (speciesList.length > 1) {
      speciesBtn.hidden = false;
      speciesBtn.textContent = SPECIES_LABEL[speciesList[speciesIdx]!] ?? "";
      speciesBtn.setAttribute("aria-label", `Trying on a ${SPECIES_LABEL[speciesList[speciesIdx]!] ?? ""}. Change shape`);
    }
  };

  const focusTile = (): void => grid.querySelector<HTMLElement>('.wd-item[tabindex="0"]')?.focus();

  /* ---- interactions ---- */

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => { if (cat !== i) o.sfx("tap"); cat = i; sel = null; render(); });
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -99 : e.key === "End" ? 99 : 0;
      if (!d) return;
      const n = tabs[d === -99 ? 0 : d === 99 ? tabs.length - 1 : (i + d + tabs.length) % tabs.length]!;
      n.focus(); n.click(); e.preventDefault();
    });
  });

  speciesBtn.addEventListener("click", () => {
    o.sfx("tap");
    speciesIdx = (speciesIdx + 1) % speciesList.length;
    preview.setSpecies(speciesList[speciesIdx]!);
    render();
  });

  grid.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".wd-item");
    if (!b) return;
    sel = b.dataset["id"] ?? "";
    o.sfx("tap");
    render();
    grid.querySelector<HTMLElement>('.wd-item[aria-pressed="true"]')?.focus();
  });

  grid.addEventListener("keydown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".wd-item");
    if (!b) return;
    const all = [...grid.querySelectorAll<HTMLButtonElement>(".wd-item")];
    const i = all.indexOf(b);
    const cols = Math.max(1, Math.round(grid.clientWidth / (all[0]?.offsetWidth || 90)));
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols : e.key === "ArrowUp" ? -cols : 0;
    if (!d) return;
    e.preventDefault();
    const n = all[Math.max(0, Math.min(all.length - 1, i + d))]!;
    all.forEach((x) => { x.tabIndex = x === n ? 0 : -1; });
    n.focus();
  });

  detail.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]");
    if (!b) return;
    const act = b.dataset["act"];
    const it = itemById(current());
    const shake = (): void => { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); };
    if (act === "remove") {
      const worn = itemById(wornId(slot()));
      if (!worn) return;
      game.toggleItem(worn.id);
      sel = null; o.sfx("tap"); say(`Took off the ${worn.name.toLowerCase()}.`);
      o.onChange?.("remove", worn);
      render(); focusTile();
    } else if (act === "wear" && it) {
      game.toggleItem(it.id); sel = null; o.sfx("star"); preview.cheer(); say(`${it.name} on.`);
      o.onChange?.("wear", it);
      render(); focusTile();
    } else if (act === "buy" && it) {
      const why = game.buyItem(it.id);
      if (why) { o.sfx("refuse"); shake(); return; }
      o.sfx("coin"); setTimeout(() => o.sfx("star"), 140);
      game.toggleItem(it.id); sel = null; preview.cheer();
      say(`Bought ${it.name}. Wearing it now.`);
      o.onChange?.("buy", it);
      bal.classList.remove("pop"); void bal.offsetWidth; bal.classList.add("pop");
      render(); focusTile();
    } else if (act === "poor" || act === "locked") {
      o.sfx("refuse"); shake();
      say(act === "poor" ? "Not enough stars yet." : "That one is still locked.");
    }
  });

  // a fresh grid item highlighted for the current worn thing, then start the tour
  render();
  const first = grid.querySelector<HTMLElement>('.wd-item[tabindex="0"]');
  first?.setAttribute("data-autofocus", "");
  return m;
}
