/**
 * Deterministic weather + seasons from the real (local) date and time.
 *
 * Everyone opening the game in the same 3-hour block of the same local day sees
 * the same sky, but tomorrow differs. Pure functions, no clocks read here: pass
 * a Date in.
 */
import { makeRng } from "./rng.js";

export type WeatherKind = "clear" | "cloudy" | "drizzle" | "rain" | "storm" | "snow";
export type Season = "spring" | "summer" | "autumn" | "winter";

export const WEATHER_KINDS: readonly WeatherKind[] = ["clear", "cloudy", "drizzle", "rain", "storm", "snow"];
export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

export interface Weather {
  kind: WeatherKind;
  /** 0-1 strength within the kind (a light vs. a heavy rain). */
  intensity: number;
  season: Season;
  /** 0-1 breeziness; drives drift of clouds, petals and the wind bed. */
  wind: number;
}

/** Meteorological Northern-hemisphere seasons. */
export function seasonOf(date: Date): Season {
  const m = date.getMonth(); // 0 = Jan
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}

/** Index of the local 3-hour block of the day, 0-7. */
export const blockOf = (date: Date): number => Math.floor(date.getHours() / 3);

type Odds = Readonly<Record<WeatherKind, number>>;
const ODDS: Record<Season, Odds> = {
  spring: { clear: 0.36, cloudy: 0.2, drizzle: 0.16, rain: 0.19, storm: 0.09, snow: 0 },
  summer: { clear: 0.52, cloudy: 0.18, drizzle: 0.07, rain: 0.13, storm: 0.1, snow: 0 },
  autumn: { clear: 0.3, cloudy: 0.28, drizzle: 0.2, rain: 0.17, storm: 0.05, snow: 0 },
  winter: { clear: 0.3, cloudy: 0.27, drizzle: 0.05, rain: 0.05, storm: 0, snow: 0.33 },
};

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const WORLD_SEED = 0x7e47e5;

/** Weather for the local date and 3-hour block of `date`. */
export function weatherAt(date: Date): Weather {
  const season = seasonOf(date);
  const block = blockOf(date);
  const day = makeRng(WORLD_SEED).derive(`day-${dayKey(date)}`);
  const blk = makeRng(WORLD_SEED).derive(`block-${dayKey(date)}-${block}`);
  // Blocks lean on the day's roll so a rainy day tends to stay rainy for a while,
  // yet each roll is uniform so the long-run odds match the table.
  const dayRoll = day.next();
  const lean = blk.next() < 0.55;
  const u = lean ? dayRoll : blk.next();
  const odds = ODDS[season];
  let acc = 0;
  let kind: WeatherKind = "clear";
  for (const k of WEATHER_KINDS) {
    acc += odds[k];
    if (u < acc) { kind = k; break; }
  }
  const strength = blk.next();
  const gust = blk.next();
  const intensity = kind === "clear" || kind === "cloudy"
    ? 0.3 + strength * 0.7
    : kind === "storm" ? 0.6 + strength * 0.4 : 0.35 + strength * 0.65;
  const baseWind = kind === "storm" ? 0.65 : season === "winter" ? 0.35 : season === "autumn" ? 0.3 : 0.15;
  const wind = Math.min(1, baseWind + gust * 0.3);
  return { kind, intensity, season, wind };
}
