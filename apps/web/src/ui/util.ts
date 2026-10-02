export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function html<T extends HTMLElement = HTMLElement>(markup: string): T {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as T;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T =>
  root.querySelector<T>(sel)!;

export const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function capitalise(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** "3 minutes", "2 hours", "4 days": age in the plain voice. */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = m / 60;
  if (h < 48) { const r = Math.round(h * 10) / 10; return `${r} hour${r === 1 ? "" : "s"}`; }
  const d = Math.round(h / 24);
  return `${d} days`;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Stable 0-1 from a string, for per-pet hue variation. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/** Trap Tab inside a container and close on Escape. Returns a release function. */
export function trapFocus(root: HTMLElement, onEscape?: () => void): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const focusables = (): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])')]
      .filter((e) => !e.hasAttribute("disabled") && e.offsetParent !== null);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && onEscape) { e.stopPropagation(); onEscape(); return; }
    if (e.key !== "Tab") return;
    const f = focusables();
    if (f.length === 0) return;
    const first = f[0]!, last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  root.addEventListener("keydown", onKey);
  queueMicrotask(() => (root.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus());
  return () => { root.removeEventListener("keydown", onKey); previous?.focus?.(); };
}
