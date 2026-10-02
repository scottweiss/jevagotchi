/// <reference types="vite/client" />
/** Service worker registration (production only) and the install prompt. */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const changed = new Set<() => void>();

export const isInstalled = (): boolean =>
  matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** True when the browser has offered an install and the app isn't installed yet. */
export const canInstall = (): boolean => deferred !== null && !isInstalled();
export const onInstallChange = (fn: () => void): void => { changed.add(fn); };

export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  for (const fn of changed) fn();
  return outcome === "accepted";
}

export function initPwa(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    for (const fn of changed) fn();
  });
  window.addEventListener("appinstalled", () => { deferred = null; for (const fn of changed) fn(); });

  // Dev keeps the service worker out of the way so HMR and fresh code always win.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const sw = new URL("sw.js", import.meta.env.BASE_URL);
      navigator.serviceWorker.register(sw, { scope: import.meta.env.BASE_URL }).catch(() => { /* offline install is a nicety */ });
    });
  }
}
