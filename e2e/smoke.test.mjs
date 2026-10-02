/**
 * Browser smoke test. Not part of `npm test`; run with `npm run test:e2e`.
 *
 * Boots the Vite dev server on a spare port, drives the real app in the system Chrome
 * (playwright-core, no browser download) and checks that the main paths work.
 * No Jev server is needed: /think is stubbed to fail, so the pet is "offline",
 * which is a supported state.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.E2E_PORT || 5199);
const BASE = process.env.E2E_URL || `http://localhost:${PORT}/`;
const SAVE_KEY = "jevagotchi.v2";

let server = null;
let browser;

async function waitFor(url, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server did not come up at ${url}`);
}

before(async () => {
  if (!process.env.E2E_URL) {
    server = spawn("npx", ["vite", "--config", "apps/web/vite.config.ts", "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "ignore" });
  }
  await waitFor(BASE);
  browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "chrome", headless: true });
});

after(async () => {
  await browser?.close();
  server?.kill();
});

/** A fresh page with no Jev server, no font network, and an optional seeded save. */
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();
  page.problems = [];
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const url = m.location().url ?? "";
    if (/\/think\b/.test(url) || /fonts\.(googleapis|gstatic)/.test(url)) return; // expected offline noise
    if (/beforeinstallprompt/.test(m.text())) return; // Chrome's install-banner notice
    page.problems.push(`${m.type()}: ${m.text()} ${url}`);
  });
  page.on("pageerror", (e) => page.problems.push(`pageerror: ${e.message}`));
  await page.route("**/think", (r) => r.fulfill({ status: 503, body: "no jev" }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.addInitScript(() => localStorage.setItem("jevagotchi.onboarded", "1"));
  return { ctx, page };
}

/** Boot with a save written before the app loads (first load only, so reloads keep progress). */
async function openWithSave(save) {
  const { ctx, page } = await open();
  await page.addInitScript(({ save, key }) => {
    if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem(key, JSON.stringify(save)); }
  }, { save, key: SAVE_KEY });
  await page.goto(BASE);
  await page.locator("#dock .act").first().waitFor();
  return { ctx, page };
}

const child = (over = {}) => {
  const now = Date.now();
  return { pet: { name: "Tester", species: "jevling", stage: "child", bornAt: now - 3 * 3600e3, simulatedTo: now, ageMinutes: 100, meters: { hunger: 70, energy: 80, hygiene: 80, health: 100, sickness: 0 }, ...over } };
};
const readSave = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY);

describe("Jevagotchi in a real browser", () => {
  it("loads with no console errors and draws something", async () => {
    const { ctx, page } = await open();
    await page.goto(BASE);
    await page.locator("#dock .act").first().waitFor();
    await page.waitForTimeout(1200);
    const colours = await page.evaluate(() => {
      const c = document.querySelector("#stage");
      const t = document.createElement("canvas"); t.width = 24; t.height = 24;
      const x = t.getContext("2d"); x.drawImage(c, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      return { distinct: seen.size, w: c.width, h: c.height };
    });
    assert.ok(colours.w > 100 && colours.h > 100, "canvas has a size");
    assert.ok(colours.distinct > 12, `canvas looks blank (${colours.distinct} distinct colours)`);
    assert.deepEqual(page.problems, []);
    await ctx.close();
  });

  it("Feed changes hunger, or explains the refusal", async () => {
    const { ctx, page } = await openWithSave(child());
    const before = (await readSave(page)).pet.meters.hunger;
    await page.locator('#dock [data-action="feed"]').click();
    await page.waitForTimeout(600);
    const after = (await readSave(page)).pet.meters.hunger;
    const toast = (await page.locator("#toasts").innerText()).trim();
    assert.ok(after < before || toast.length > 0, `hunger ${before} -> ${after}, toast "${toast}"`);
    assert.ok(after < before, "a hungry pet should eat");
    assert.deepEqual(page.problems, []);
    await ctx.close();
  });

  it("refuses to feed a full pet, with a message", async () => {
    const { ctx, page } = await openWithSave(child({ meters: { hunger: 0, energy: 80, hygiene: 80, health: 100, sickness: 0 } }));
    await page.locator('#dock [data-action="feed"]').click({ force: true }); // aria-disabled, still tappable
    await page.locator("#toasts .toast, #toasts > *").first().waitFor({ timeout: 3000 });
    await ctx.close();
  });

  it("opens and closes the Mind drawer", async () => {
    const { ctx, page } = await openWithSave(child());
    await page.getByRole("button", { name: /mind/i }).first().click();
    await page.waitForFunction(() => document.querySelector("#mind")?.getAttribute("aria-hidden") === "false");
    await page.getByRole("button", { name: /mind/i }).first().click();
    await page.waitForFunction(() => document.querySelector("#mind")?.getAttribute("aria-hidden") === "true");
    assert.deepEqual(page.problems, []);
    await ctx.close();
  });

  it("opens the Book from the menu and switches tabs", async () => {
    const { ctx, page } = await openWithSave(child());
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: /^Book/ }).click();
    const dialog = page.getByRole("dialog", { name: "Book" });
    await dialog.waitFor();
    for (const tab of ["Codex", "Graveyard", "Journal"]) {
      await dialog.getByRole("tab", { name: tab }).click();
      assert.equal(await dialog.getByRole("tab", { name: tab }).getAttribute("aria-selected"), "true");
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(page.problems, []);
    await ctx.close();
  });

  it("a dead pet can be replaced with a new egg and lands in the graveyard", async () => {
    const now = Date.now();
    const { ctx, page } = await openWithSave(child({ dead: true, diedAt: now, causeOfDeath: "starvation", meters: { hunger: 100, energy: 50, hygiene: 50, health: 0, sickness: 0 } }));
    await page.getByRole("button", { name: "Raise a new egg" }).click({ timeout: 8000 });
    await page.waitForFunction((k) => { const s = JSON.parse(localStorage.getItem(k)); return s.pet.stage === "egg" && !s.pet.dead; }, SAVE_KEY);
    const save = await readSave(page);
    assert.ok(save.graveyard.length >= 1, "old pet is in the graveyard");
    assert.deepEqual(page.problems, []);
    await ctx.close();
  });

  it("Start over on a living pet buries it and hands out an egg", async () => {
    const { ctx, page } = await openWithSave(child());
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("dialog", { name: "Start over?" }).getByRole("button", { name: "Start over" }).click();
    await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).pet.stage === "egg", SAVE_KEY);
    const save = await readSave(page);
    assert.equal(save.graveyard.length, 1);
    assert.equal(save.graveyard[0].name, "Tester");
    await ctx.close();
  });
});
