/**
 * When is a background nudge warranted? Pure decision logic, no I/O, no clock of its own.
 * The web app supplies the state, the settings, `now` and the history of what was sent.
 */
import type { Want } from "./psyche.js";

export type NudgeReason = "want" | "sick" | "mess" | "critical";

export interface NudgeState {
  name: string;
  dead: boolean;
  asleep: boolean;
  health: number;
  sickness: number;
  messes: number;
  want: Want | null;
  urgency: number;
  /** The tab or app is in the foreground. Never nudge someone who is looking. */
  visible: boolean;
}

export interface NudgeSettings {
  enabled: boolean;
  quietEnabled: boolean;
  /** Local hour (0-23) quiet time starts. May be greater than `quietEnd` (wraps midnight). */
  quietStart: number;
  quietEnd: number;
}

export const DEFAULT_NUDGE_SETTINGS: NudgeSettings = { enabled: false, quietEnabled: true, quietStart: 23, quietEnd: 8 };

/** When each reason last fired, epoch ms. */
export type NudgeHistory = Partial<Record<NudgeReason, number>>;

export interface Nudge { reason: NudgeReason; title: string; body: string }

export const NUDGE_COOLDOWN_MS = 20 * 60_000;
export const URGENCY_THRESHOLD = 0.66;
export const CRITICAL_HEALTH = 20;
export const MESS_PILE = 3;

export function inQuietHours(s: NudgeSettings, now: number): boolean {
  if (!s.quietEnabled || s.quietStart === s.quietEnd) return false;
  const h = new Date(now).getHours();
  return s.quietStart < s.quietEnd
    ? h >= s.quietStart && h < s.quietEnd
    : h >= s.quietStart || h < s.quietEnd;
}

const WANT_COPY: Partial<Record<Want, (n: string) => string>> = {
  food: (n) => `${n} is hungry.`,
  play: (n) => `${n} wants to play.`,
  sleep: (n) => `${n} is sleepy. Lights out would help.`,
  cleaning: (n) => `${n} would like the room cleaned.`,
  attention: (n) => `${n} misses you.`,
  medicine: (n) => `${n} feels unwell. Medicine would help.`,
};

/** Priority order: the most serious reason wins when several apply at once. */
export function shouldNudge(state: NudgeState, settings: NudgeSettings, now: number, history: NudgeHistory): Nudge | null {
  if (!settings.enabled || state.visible || state.dead) return null;

  const ready = (r: NudgeReason): boolean => now - (history[r] ?? -Infinity) >= NUDGE_COOLDOWN_MS;
  const critical = state.health < CRITICAL_HEALTH;
  if (inQuietHours(settings, now) && !critical) return null;

  const n = state.name;
  if (critical && ready("critical")) {
    return { reason: "critical", title: n, body: `${n} is in a bad way. Please come back.` };
  }
  if (state.sickness > 0 && ready("sick")) {
    return { reason: "sick", title: n, body: `${n} feels unwell. Medicine would help.` };
  }
  if (state.messes >= MESS_PILE && ready("mess")) {
    return { reason: "mess", title: n, body: `${n}'s room is getting messy.` };
  }
  if (!state.asleep && state.want && state.want !== "nothing" && state.urgency > URGENCY_THRESHOLD && ready("want")) {
    const copy = WANT_COPY[state.want];
    if (copy) return { reason: "want", title: n, body: copy(n) };
  }
  return null;
}
