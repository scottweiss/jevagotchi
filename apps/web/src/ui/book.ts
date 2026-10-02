import type { Grave } from "@jevagotchi/core";
import { icons } from "./icons.js";
import { CAUSE_TEXT, moodColor, SPECIES_INFO, speciesName } from "./mood.js";
import { ago, duration, esc } from "./util.js";
import { dismissBtn, openModal, wireClose, type Modal } from "./overlays.js";

export interface JournalView { at: number; text: string }
export interface MilestoneView { id: string; title: string; text: string; at?: number; done: boolean }
export interface BookView {
  petName: string;
  journal: JournalView[];
  discovered: Set<string>;
  records: { label: string; value: string }[];
  milestones: MilestoneView[];
  graves: Grave[];
}

const TABS = [
  { id: "journal", label: "Journal" },
  { id: "codex", label: "Codex" },
  { id: "graves", label: "Graveyard" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const ORDER = ["egg", "blobule", "jevling", "placid", "feral", "needy", "stoic", "insatiable"];

function blob(species: string, locked: boolean): string {
  const hue = SPECIES_INFO[species]?.hue ?? "#ECE9FF";
  const id = `bg-${species}-${locked ? "l" : "u"}`;
  if (species === "egg") {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${id}" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${locked ? "#2a2150" : hue}"/></radialGradient></defs><path d="M32 8c10 0 18 15 18 27a18 18 0 0 1-36 0C14 23 22 8 32 8z" fill="${locked ? "#2a2150" : `url(#${id})`}"/>${locked ? "" : `<circle cx="26" cy="30" r="2" fill="#B9A9F5"/><circle cx="38" cy="38" r="2.4" fill="#B9A9F5"/><circle cx="30" cy="44" r="1.6" fill="#B9A9F5"/>`}</svg>`;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="${id}" cx=".36" cy=".28" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".45" stop-color="${hue}"/><stop offset="1" stop-color="${hue}" stop-opacity=".55"/></radialGradient></defs>
    <path d="M10 46c0-15 9-28 22-28s22 13 22 28c0 5-3 8-9 8H19c-6 0-9-3-9-8z" fill="${locked ? "#2a2150" : `url(#${id})`}"/>
    ${locked ? "" : `<ellipse cx="25" cy="38" rx="4" ry="5.5" fill="#1B1638"/><ellipse cx="39" cy="38" rx="4" ry="5.5" fill="#1B1638"/><circle cx="26.4" cy="36" r="1.6" fill="#fff"/><circle cx="40.4" cy="36" r="1.6" fill="#fff"/>`}</svg>`;
}

export function openBook(host: HTMLElement, view: () => BookView, start: TabId = "journal"): Modal & { refresh(): void } {
  let tab: TabId = start;
  const m = openModal(host, `
    <header class="book-head">
      <h2>Book</h2>
      <div class="tabs" role="tablist" aria-label="Book sections">
        ${TABS.map((t) => `<button class="tab" role="tab" type="button" id="tab-${t.id}" aria-controls="panel" data-tab="${t.id}">${t.label}</button>`).join("")}
      </div>
      ${dismissBtn()}
    </header>
    <div class="book-body" id="panel" role="tabpanel" tabindex="0"></div>`, { label: "Book", cls: "book" });
  wireClose(m);
  const body = m.el.querySelector<HTMLElement>(".book-body")!;
  const tabs = [...m.el.querySelectorAll<HTMLButtonElement>(".tab")];

  const render = (): void => {
    const v = view();
    tabs.forEach((t) => { const on = t.dataset["tab"] === tab; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
    body.setAttribute("aria-labelledby", `tab-${tab}`);
    const html = tab === "journal" ? journal(v) : tab === "codex" ? codex(v) : graves(v);
    if (body.dataset["sig"] !== html) { body.innerHTML = html; body.dataset["sig"] = html; }
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => { tab = t.dataset["tab"] as TabId; body.scrollTop = 0; body.dataset["sig"] = ""; render(); });
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length]!;
      n.focus(); n.click(); e.preventDefault();
    });
  });
  render();
  return Object.assign(m, { refresh: render });
}

function kindColor(text: string): string {
  if (/died|did not make it/i.test(text)) return moodColor("grumpy");
  if (/sick/i.test(text)) return moodColor("sick");
  if (/hatched|grew|discovered/i.test(text)) return "#FFE58F";
  if (/mess/i.test(text)) return moodColor("happy");
  if (/played|stars/i.test(text)) return "#FF8FC7";
  return moodColor("content");
}

function journal(v: BookView): string {
  if (v.journal.length === 0) {
    return `<div class="empty"><span class="empty-ico">${icons.book}</span><p><b>Nothing written yet.</b> Hatching, growing up, messes and bad nights get written down here as they happen.</p></div>`;
  }
  const items = [...v.journal].sort((a, b) => b.at - a.at).slice(0, 80);
  return `<ol class="timeline">${items.map((j) => `
    <li style="--c:${kindColor(j.text)}">
      <span class="tl-dot" aria-hidden="true"></span>
      <div><p>${esc(j.text)}</p><time datetime="${new Date(j.at).toISOString()}">${esc(ago(Date.now() - j.at))}</time></div>
    </li>`).join("")}</ol>`;
}

function codex(v: BookView): string {
  const found = ORDER.filter((s) => v.discovered.has(s)).length;
  const species = ORDER.map((s) => {
    const has = v.discovered.has(s);
    const info = SPECIES_INFO[s]!;
    return `<li class="species${has ? "" : " locked"}" style="--hue:${info.hue}">
      <span class="sp-art">${blob(s, !has)}</span>
      <div><b>${has ? esc(info.name) : "Not found yet"}</b><p>${has ? esc(info.blurb) : s === "egg" || s === "blobule" || s === "jevling" ? "Keep raising to meet it." : "Only one adult form can happen per pet. Raise differently to find the others."}</p></div>
      ${has ? "" : `<span class="sp-lock">${icons.lock}</span>`}
    </li>`;
  }).join("");
  const records = v.records.length
    ? `<dl class="records">${v.records.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join("")}</dl>`
    : `<p class="muted">Records appear as you play.</p>`;
  const ms = v.milestones.length
    ? `<ul class="milestones">${v.milestones.map((x) => `<li class="${x.done ? "done" : ""}"><span aria-hidden="true">${x.done ? icons.star : icons.lock}</span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div></li>`).join("")}</ul>`
    : "";
  return `
    <section><h3>Creatures <span class="count">${found} of ${ORDER.length} found</span></h3><ul class="species-list">${species}</ul></section>
    <section><h3>Records</h3>${records}</section>
    ${ms ? `<section><h3>Milestones</h3>${ms}</section>` : ""}`;
}

function graves(v: BookView): string {
  if (v.graves.length === 0) {
    return `<div class="empty"><span class="empty-ico">${icons.flower}</span><p><b>Nobody buried here.</b> Every pet you raise gets a place in this garden, whatever happens to it.</p></div>`;
  }
  return `<ul class="stones">${v.graves.map((g, i) => {
    const c = CAUSE_TEXT[g.causeOfDeath ?? ""];
    return `<li style="--hue:${SPECIES_INFO[g.species]?.hue ?? "#ECE9FF"};--i:${i}">
      <span class="stone-art">${blob(g.species, false)}</span>
      <div><b>${esc(g.name)}</b>
      <p>${esc(speciesName(g.species))}, ${esc(duration(g.lifespanMinutes))} old. ${esc(c?.short ? `It ${c.short}.` : "")}</p>
      <p class="epi">${esc(c?.epitaph ?? "")}</p>
      <time>${esc(ago(Date.now() - g.diedAt))}</time></div>
    </li>`;
  }).join("")}</ul>`;
}
