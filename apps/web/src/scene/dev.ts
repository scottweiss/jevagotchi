/** Dev harness for the scene: drives Stage with fake frames. Open /scene-dev.html (add ?panel=0 to hide controls). */
import type { CreatureParams, SceneFrame } from "../contracts.js";
import { SEASONS, WEATHER_KINDS, seasonOf, weatherAt, type Season, type WeatherKind } from "@jevagotchi/core";
import { audio } from "../audio.js";
import { Stage } from "./index.js";

const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
const stage = new Stage(canvas);
const panel = document.querySelector<HTMLDivElement>("#panel")!;

const params: CreatureParams = {
  species: "blobule", stage: "child", mood: "content", asleep: false, sick: false, hunger: 30, energy: 70, hygiene: 80,
  urgency: 0.2, want: "nothing", hesitant: false, gaze: null, hueShift: 0.4,
};
const frame: SceneFrame = { params, messes: 0, timeOfDay: 0.5, lightsOff: false, speech: null, wantIcon: null, name: "Jev" };
let autoClock = false;

const q = new URLSearchParams(location.search);
if (q.has("t")) frame.timeOfDay = Number(q.get("t"));
if (q.get("panel") === "0") panel.hidden = true;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
const label = (t: string, c: HTMLElement) => el("label", {}, t, c);
function select<T extends string>(opts: readonly T[], val: T, on: (v: T) => void): HTMLSelectElement {
  const s = el("select");
  for (const o of opts) s.append(el("option", { value: o, textContent: o }));
  s.value = val;
  s.onchange = () => on(s.value as T);
  return s;
}

const time = el("input", { type: "range", min: "0", max: "1", step: "0.005", value: String(frame.timeOfDay) });
time.oninput = () => { frame.timeOfDay = Number(time.value); };
const clock = el("input", { type: "checkbox" });
clock.onchange = () => { autoClock = clock.checked; };
const lights = el("input", { type: "checkbox" });
lights.onchange = () => { frame.lightsOff = lights.checked; };
const asleep = el("input", { type: "checkbox" });
asleep.onchange = () => { params.asleep = asleep.checked; };
const messes = el("input", { type: "range", min: "0", max: "4", step: "1", value: "0" });
messes.oninput = () => { frame.messes = Number(messes.value); };
const speech = el("input", { type: "text", placeholder: "speech" });
speech.oninput = () => { frame.speech = speech.value || null; };
const urgency = el("input", { type: "range", min: "0", max: "1", step: "0.05", value: "0.2" });
urgency.oninput = () => { params.urgency = Number(urgency.value); };

panel.append(
  label("time of day", time),
  el("label", {}, "auto clock ", clock), el("label", {}, "lights off ", lights), el("label", {}, "asleep ", asleep),
  label("messes", messes), label("urgency", urgency), speech,
  label("species", select(["egg", "blobule", "jevling", "placid", "feral", "needy", "stoic", "insatiable"] as const, "blobule", (v) => { params.species = v; })),
  label("mood", select(["content", "happy", "bored", "lonely", "grumpy", "anxious", "sick", "sleepy", "dead"] as const, "content", (v) => { params.mood = v; })),
  label("want icon", select(["none", "food", "play", "sleep", "cleaning", "attention", "medicine"] as const, "none", (v) => { frame.wantIcon = v === "none" ? null : v; params.want = v === "none" ? "nothing" : v; })),
);
const fxRow = el("div", { className: "row" });
for (const n of ["feed", "play", "clean", "medicine", "scold", "sleep", "wake", "hatch", "evolve", "die", "refuse", "poke", "milestone", "newborn"] as const) {
  fxRow.append(el("button", { textContent: n, onclick: () => stage.play(n, n === "evolve" ? { from: "jevling", to: params.species } : undefined) }));
}
panel.append(fxRow);

/* weather + date: "auto" follows the real seeded weather for the chosen date; anything else forces it */
const wx = { kind: (q.get("weather") ?? "auto") as WeatherKind | "auto", season: (q.get("season") ?? "auto") as Season | "auto", intensity: Number(q.get("intensity") ?? 0.7), wind: Number(q.get("wind") ?? 0.3) };
const pad2 = (n: number) => String(n).padStart(2, "0");
const now0 = new Date();
const dateIn = el("input", { type: "datetime-local", value: q.get("date") ?? `${now0.getFullYear()}-${pad2(now0.getMonth() + 1)}-${pad2(now0.getDate())}T${pad2(now0.getHours())}:00` });
function applyWeather(): void {
  const d = new Date(dateIn.value || Date.now());
  if (wx.season !== "auto") d.setMonth({ spring: 3, summer: 6, autumn: 9, winter: 0 }[wx.season], Math.min(d.getDate(), 28));
  const base = weatherAt(d);
  const forced = wx.kind !== "auto";
  frame.weather = {
    kind: forced ? wx.kind as WeatherKind : base.kind,
    intensity: forced ? wx.intensity : base.intensity,
    season: wx.season === "auto" ? seasonOf(d) : wx.season,
    wind: forced ? wx.wind : base.wind,
  };
  audio.setWeather(frame.weather.kind, frame.weather.intensity, frame.weather.wind);
}
const intensity = el("input", { type: "range", min: "0.1", max: "1", step: "0.05", value: String(wx.intensity) });
intensity.oninput = () => { wx.intensity = Number(intensity.value); applyWeather(); };
const wind = el("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(wx.wind) });
wind.oninput = () => { wx.wind = Number(wind.value); applyWeather(); };
dateIn.onchange = applyWeather;
panel.append(
  label("weather", select(["auto", ...WEATHER_KINDS] as const, wx.kind, (v) => { wx.kind = v; applyWeather(); })),
  label("season", select(["auto", ...SEASONS] as const, wx.season, (v) => { wx.season = v; applyWeather(); })),
  label("intensity", intensity), label("wind", wind), label("date", dateIn),
  el("div", { className: "row" },
    el("button", { textContent: "lightning", onclick: () => stage.strike() }),
    el("button", { textContent: "sound on", onclick: () => audio.unlock() })),
);
applyWeather();
stage.onThunder = (i) => audio.thunder(i);
addEventListener("keydown", (e) => { if (e.key === "h") panel.hidden = !panel.hidden; });

stage.onTapMess = (i) => { frame.messes = Math.max(0, frame.messes - 1); messes.value = String(frame.messes); console.info("tap mess", i); };
stage.onCreatureTap = () => console.info("creature tapped");

function loop(now: number): void {
  if (autoClock) { frame.timeOfDay = (now / 1000 / 40) % 1; time.value = String(frame.timeOfDay); }
  stage.render(frame, now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

Object.assign(window, { stage, frame, params });
