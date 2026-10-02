/* Jevagotchi service worker: offline app shell + notification clicks.
 * Bump CACHE_VERSION to force old caches out. HTML is network-first, so a new deploy
 * is picked up on the next online launch; hashed /assets/* files are immutable. */
const CACHE_VERSION = "v2";
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const local = (path) => `${BASE}${path}`;
const CACHE = `jevagotchi-shell-${CACHE_VERSION}`;
const SHELL = [local("/"), local("/manifest.webmanifest"), local("/icons/icon-192.png"), local("/icons/icon-512.png"), local("/icons/apple-touch-icon.png")];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Precache the hashed bundle files the page references, so first offline launch works.
    try {
      const html = await (await cache.match("/")).clone().text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.all(assets.map((a) => cache.add(a).catch(() => {})));
    } catch { /* runtime caching will fill the gaps */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("jevagotchi-shell-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;               // POST /think goes straight to the network
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname === local("/think") || url.pathname.startsWith(local("/api"))) return; // never cached; the game handles failure
    if (req.mode === "navigate") { event.respondWith(networkFirst(req, local("/"))); return; }
    if (url.pathname.startsWith(local("/assets/"))) { event.respondWith(cacheFirst(req)); return; }
    event.respondWith(networkFirst(req));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackKey ?? req, res.clone());
    return res;
  } catch {
    return (await cache.match(fallbackKey ?? req)) || (await cache.match("/")) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) return c.focus(); }
    return clients.openWindow("/");
  })());
});
