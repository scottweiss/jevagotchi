import { refusalFor, type Action, type Behavior, type PetState } from "@jevagotchi/core";
import type { CreatureParams, SceneFrame } from "../contracts.js";
import type { Game } from "../game.js";
import type { DockAction, HudState } from "./hud.js";
import { hash01 } from "./util.js";

export const dockAction = (a: DockAction, pet: PetState): Action =>
  a === "lights" ? (pet.asleep ? "wake" : "sleep") : a;

/** 0 midnight .. 0.5 noon, from the real clock. */
export function timeOfDay(d = new Date()): number {
  return (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24;
}

/** Sky colour for the browser chrome, following the same clock as the scene. */
export function themeColor(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [27, 22, 56]], [0.22, [58, 42, 107]], [0.3, [255, 181, 138]], [0.5, [120, 170, 230]],
    [0.7, [255, 150, 130]], [0.8, [58, 42, 107]], [1, [27, 22, 56]],
  ];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1]![0]) i++;
  const [t0, c0] = stops[i]!, [t1, c1] = stops[i + 1]!;
  const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  const c = c0.map((v, j) => Math.round(v + (c1[j]! - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function creatureParams(game: Game, gaze: { x: number; y: number } | null): CreatureParams {
  const pet = game.save.pet;
  const b = game.behavior;
  return {
    species: pet.species,
    stage: pet.stage,
    mood: pet.dead ? "dead" : pet.asleep ? "sleepy" : b?.mood ?? "content",
    asleep: pet.asleep,
    sick: pet.meters.sickness > 0,
    hunger: pet.meters.hunger,
    energy: pet.meters.energy,
    hygiene: pet.meters.hygiene,
    urgency: pet.dead || pet.asleep ? 0 : b?.urgency ?? 0,
    want: pet.dead || pet.asleep || !b ? "nothing" : b.want,
    hesitant: !!b && b.demeanour === "hesitant",
    gaze,
    hueShift: hash01(pet.id),
  };
}

export function buildFrame(game: Game, gaze: { x: number; y: number } | null, tod: number): SceneFrame {
  const pet = game.save.pet;
  const p = creatureParams(game, gaze);
  return {
    params: p,
    messes: pet.messes,
    timeOfDay: tod,
    lightsOff: pet.asleep,
    speech: pet.dead ? null : game.speech,
    wantIcon: p.want === "nothing" ? null : p.want,
    name: pet.name,
    accessories: game.save.wardrobe.equipped,
    room: game.save.wardrobe.room,
  };
}

const stat = (v: number, lo: number, hi: number): number => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

export function hudState(game: Game, muted: boolean, mindOpen: boolean, tod: number): HudState {
  const pet = game.save.pet;
  const b: Behavior | null = game.behavior;
  const refused = {} as Record<DockAction, boolean>;
  for (const a of ["feed", "play", "clean", "lights", "medicine", "scold"] as DockAction[]) {
    refused[a] = refusalFor(pet, dockAction(a, pet)) !== null || (a === "play" && game.minigameRefusal() !== null);
  }
  const wantUrgency = b && !pet.asleep ? Math.max(0.35, b.urgency) : 0;
  const w = b?.want;
  const urgency: Record<DockAction, number> = {
    feed: Math.max(w === "food" ? wantUrgency : 0, stat(pet.meters.hunger, 60, 95)),
    play: Math.max(w === "play" || w === "attention" ? wantUrgency : 0, stat(100 - pet.happiness, 65, 95) * 0.8),
    clean: Math.max(w === "cleaning" ? wantUrgency : 0, stat(100 - pet.meters.hygiene, 60, 95), pet.messes > 1 ? 0.6 : 0),
    lights: pet.asleep ? 0 : Math.max(w === "sleep" ? wantUrgency : 0, stat(100 - pet.meters.energy, 65, 95)),
    medicine: pet.meters.sickness > 0 ? 1 : 0,
    scold: 0,
  };
  return {
    name: pet.name, species: pet.species, stage: pet.stage, ageMinutes: pet.ageMinutes,
    dead: pet.dead, asleep: pet.asleep, sick: pet.meters.sickness > 0,
    refused, urgency,
    gauges: { fed: 100 - pet.meters.hunger, rested: pet.meters.energy, clean: pet.meters.hygiene, joy: pet.happiness },
    muted, mindOpen, timeOfDay: tod,
    stars: game.save.wardrobe.stars,
  };
}
