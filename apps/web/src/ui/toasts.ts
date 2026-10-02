import { icons, type IconName } from "./icons.js";
import { esc } from "./util.js";

export interface ToastOpts {
  title: string;
  text?: string;
  icon?: IconName;
  kind?: "info" | "milestone" | "warn" | "evolve";
  /** A second toast with the same key replaces the first. */
  key?: string;
  ms?: number;
}

export class Toasts {
  constructor(private host: HTMLElement) {}

  show(o: ToastOpts): void {
    if (o.key) this.host.querySelector(`[data-key="${CSS.escape(o.key)}"]`)?.remove();
    const el = document.createElement("div");
    el.className = `toast toast-${o.kind ?? "info"}`;
    if (o.key) el.dataset["key"] = o.key;
    el.innerHTML = `
      <span class="toast-icon">${icons[o.icon ?? (o.kind === "milestone" ? "star" : o.kind === "evolve" ? "sparkle" : "heart")]}</span>
      <span class="toast-body"><b>${esc(o.title)}</b>${o.text ? `<span>${esc(o.text)}</span>` : ""}</span>`;
    this.host.prepend(el);
    while (this.host.children.length > 3) this.host.lastElementChild?.remove();
    const life = o.ms ?? (o.kind === "info" ? 2600 : 5200);
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 320);
    }, life);
  }
}
