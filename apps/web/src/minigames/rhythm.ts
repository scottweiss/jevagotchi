/** Bubble pop: notes fall in four lanes to a steady beat. Tap, or D F J K. */
import type { MinigameContext } from "../contracts.js";
import { PAL, createKit, drawPet, font, rgba, rng, shade, speciesColor } from "./kit.js";

const LANE_COLORS = [PAL.coral, PAL.butter, PAL.lagoon, "#8FA8FF"];
const LANE_KEYS: Record<string, number> = { d: 0, f: 1, j: 2, k: 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
const BPM = 112;
const BEAT = 60 / BPM;
const TRAVEL = 1.45;      // seconds from spawn to hit line
const PERFECT = 0.09, GOOD = 0.17;
const LEAD_IN = 1.7;

interface Note { lane: number; t: number; state: "live" | "hit" | "miss"; grade?: "perfect" | "good"; fade: number }

/** A simple phrased chart: mostly on-beat, occasional offbeats and doubles. Seeded, so it is stable per run. */
function chart(seed: number): Note[] {
  const r = rng(seed);
  const notes: Note[] = [];
  let lane = Math.floor(r() * 4);
  const beats = 40;
  for (let b = 0; b < beats; b++) {
    const phraseEnd = b % 8 === 7;
    if (phraseEnd && r() < 0.5) continue; // breathing room
    const t = LEAD_IN + b * BEAT;
    const step = r();
    lane = step < 0.4 ? (lane + 1) % 4 : step < 0.8 ? (lane + 3) % 4 : Math.floor(r() * 4);
    notes.push({ lane, t, state: "live", fade: 0 });
    if (b > 6 && r() < 0.22) notes.push({ lane: (lane + 2) % 4, t, state: "live", fade: 0 });          // double
    if (b > 3 && !phraseEnd && r() < 0.28) notes.push({ lane: (lane + 1 + Math.floor(r() * 3)) % 4, t: t + BEAT / 2, state: "live", fade: 0 }); // offbeat
  }
  return notes;
}

export function mountRhythm(mg: MinigameContext): () => void {
  const notes = chart(((Date.now() / 1000) | 0) ^ 0x9e37);
  const maxPts = notes.length * 3;
  const kit = createKit(mg.host, mg, {
    title: "Bubble pop",
    hint: "Pop the bubbles as they reach the ring. Tap the lane, or D F J K.",
    duration: LEAD_IN + 40 * BEAT + 1.2,
    stars: (s) => (s >= maxPts * 0.85 ? 3 : s >= maxPts * 0.6 ? 2 : s >= maxPts * 0.3 ? 1 : 0),
    untimed: true,
  });
  const color = speciesColor(mg.species);
  let song = -0.0, score = 0, combo = 0, best = 0, hits = 0;
  let ended = false;
  const flash = [0, 0, 0, 0];
  let petFace: "idle" | "happy" | "ouch" | "cheer" = "idle";
  let faceT = 0, bounce = 0, beatPulse = 0, lastBeat = -1;

  const geom = (): { x0: number; lw: number; top: number; hitY: number; petR: number } => {
    const petR = Math.max(22, Math.min(38, Math.min(kit.w, kit.h) * 0.075));
    const total = Math.min(kit.w - 16, 480);
    return { x0: (kit.w - total) / 2, lw: total / 4, top: 44, hitY: kit.h - petR * 2.7 - 18, petR };
  };

  function judge(lane: number): void {
    let bestNote: Note | null = null, bestD = 9;
    for (const n of notes) {
      if (n.lane !== lane || n.state !== "live") continue;
      const d = Math.abs(n.t - song);
      if (d < bestD) { bestD = d; bestNote = n; }
    }
    flash[lane] = 1;
    const g = geom();
    const x = g.x0 + g.lw * (lane + 0.5);
    if (!bestNote || bestD > GOOD) {
      // Button-mashing is not rhythm: a stray tap breaks the combo and costs a point.
      combo = 0; kit.setExtra("");
      score = Math.max(0, score - 1); kit.setScore(score, false);
      kit.sfx("tap");
      return;
    }
    bestNote.state = "hit";
    const perfect = bestD <= PERFECT;
    bestNote.grade = perfect ? "perfect" : "good";
    const combos = combo;
    combo += 1; hits += 1; best = Math.max(best, combo);
    score += perfect ? 3 : 2;
    kit.setScore(score);
    kit.setExtra(combo >= 3 ? `${combo} combo` : "");
    kit.burst(x, g.hitY, LANE_COLORS[lane]!, perfect ? 16 : 9, perfect ? "star" : "dot");
    kit.ring(x, g.hitY, perfect ? PAL.butter : LANE_COLORS[lane]!);
    kit.float(x, g.hitY - 26, perfect ? "Perfect" : "Good", perfect ? PAL.butter : PAL.fog, perfect ? 22 : 18);
    kit.sfx(perfect ? (combos > 0 && combo % 8 === 0 ? "happy" : "coin") : "chirp");
    petFace = perfect ? "cheer" : "happy"; faceT = 0.3; bounce = perfect ? 1 : 0.6;
  }

  kit.onKey((k) => {
    if (kit.phase !== "play") return;
    const lane = LANE_KEYS[k];
    if (lane !== undefined) judge(lane);
  });
  kit.onPointer("down", (x) => {
    if (kit.phase !== "play") return;
    const g = geom();
    const lane = Math.floor((x - g.x0) / g.lw);
    if (lane >= 0 && lane < 4) judge(lane);
  });

  function update(dt: number, phase: string): void {
    bounce = Math.max(0, bounce - dt * 3);
    faceT -= dt; if (faceT <= 0) petFace = "idle";
    for (let i = 0; i < 4; i++) flash[i] = Math.max(0, flash[i]! - dt * 5);
    beatPulse = Math.max(0, beatPulse - dt * 3.5);
    if (phase !== "play") return;
    song += dt;
    kit.setProgress(1 - song / (LEAD_IN + 40 * BEAT));
    const beat = Math.floor(song / BEAT);
    if (beat !== lastBeat && song > 0) { lastBeat = beat; beatPulse = 1; }
    for (const n of notes) {
      if (n.state === "live" && song - n.t > GOOD) {
        n.state = "miss";
        combo = 0; kit.setExtra("");
        const g = geom();
        kit.float(g.x0 + g.lw * (n.lane + 0.5), g.hitY + 6, "Miss", PAL.coral, 17);
        kit.sfx("miss"); kit.shake(4);
        petFace = "ouch"; faceT = 0.35;
      }
      if (n.state !== "live") n.fade += dt;
    }
    if (!ended && notes.every((n) => n.state !== "live") && song > notes[notes.length - 1]!.t) {
      ended = true;
      setTimeout(() => kit.finish(score), 700);
    }
  }

  function bubble(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number, pop: number): void {
    c.save();
    c.globalAlpha = a;
    c.globalCompositeOperation = "lighter";
    const h = c.createRadialGradient(x, y, r * 0.4, x, y, r * 2.3);
    h.addColorStop(0, rgba(col, 0.4)); h.addColorStop(1, rgba(col, 0));
    c.fillStyle = h; c.beginPath(); c.arc(x, y, r * 2.3, 0, 6.283); c.fill();
    c.globalCompositeOperation = "source-over";
    const rr = r * (1 + pop * 0.5);
    const g = c.createRadialGradient(x - rr * 0.3, y - rr * 0.35, rr * 0.1, x, y, rr);
    g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.35));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, 6.283); c.fill();
    c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "rgba(255,255,255,.75)";
    c.beginPath(); c.ellipse(x - rr * 0.32, y - rr * 0.38, rr * 0.26, rr * 0.14, -0.6, 0, 6.283); c.fill();
    c.restore();
  }

  function draw(c: CanvasRenderingContext2D): void {
    kit.backdrop(LANE_COLORS[Math.floor(kit.time * 0.4) % 4]!);
    const g = geom();
    const speed = (g.hitY - g.top) / TRAVEL;
    const nr = Math.min(g.lw * 0.36, 26);

    // lanes
    for (let i = 0; i < 4; i++) {
      const x = g.x0 + g.lw * i;
      const col = LANE_COLORS[i]!;
      const lg = c.createLinearGradient(0, g.top, 0, g.hitY + 30);
      lg.addColorStop(0, rgba(col, 0.02)); lg.addColorStop(1, rgba(col, 0.13 + flash[i]! * 0.25));
      c.fillStyle = lg;
      c.fillRect(x + 3, g.top, g.lw - 6, g.hitY + 30 - g.top);
      if (flash[i]! > 0) {
        c.save(); c.globalCompositeOperation = "lighter";
        const bg = c.createLinearGradient(0, g.top, 0, g.hitY);
        bg.addColorStop(0, rgba(col, 0)); bg.addColorStop(1, rgba(col, flash[i]! * 0.45));
        c.fillStyle = bg; c.fillRect(x + 6, g.top, g.lw - 12, g.hitY - g.top);
        c.restore();
      }
    }
    // targets
    for (let i = 0; i < 4; i++) {
      const x = g.x0 + g.lw * (i + 0.5);
      const col = LANE_COLORS[i]!;
      c.save();
      c.lineWidth = 3;
      c.strokeStyle = rgba(col, 0.55 + flash[i]! * 0.45 + beatPulse * 0.15);
      c.beginPath(); c.arc(x, g.hitY, nr * (1.12 + beatPulse * 0.08 + flash[i]! * 0.12), 0, 6.283); c.stroke();
      c.fillStyle = rgba(col, 0.1 + flash[i]! * 0.3);
      c.fill();
      c.font = font(Math.max(11, nr * 0.55), 700);
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = rgba(PAL.fog, 0.55);
      c.fillText("DFJK"[i]!, x, g.hitY);
      c.restore();
    }

    // notes
    for (const n of notes) {
      const y = g.hitY - (n.t - song) * speed;
      if (y < g.top - nr * 2 || y > kit.h + nr) continue;
      const x = g.x0 + g.lw * (n.lane + 0.5);
      if (n.state === "live") {
        const appear = Math.min(1, (y - g.top + nr) / (nr * 3));
        bubble(c, x, y, nr, LANE_COLORS[n.lane]!, Math.max(0.2, appear), 0);
      } else if (n.state === "hit" && n.fade < 0.18) {
        bubble(c, x, g.hitY, nr, LANE_COLORS[n.lane]!, 1 - n.fade / 0.18, n.fade / 0.18);
      } else if (n.state === "miss" && n.fade < 0.6) {
        bubble(c, x, y, nr * 0.85, "#6b6488", 0.5 * (1 - n.fade / 0.6), 0);
      }
    }

    // pet
    const jump = Math.abs(Math.sin(bounce * Math.PI)) * 10 + beatPulse * 2;
    const sy = 1 + beatPulse * 0.05 - bounce * 0.05;
    drawPet(c, kit.w / 2, kit.h - 12 - jump, g.petR, { color, face: petFace, sy, sx: 1 / sy, time: kit.time, look: 0 });
  }

  kit.run(update, draw);
  void best; void hits;
  return () => kit.dispose();
}
