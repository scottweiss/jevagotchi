/** Sparkle memory: the pet lights a growing sequence of glowing orbs. Repeat it. */
import type { MinigameContext, SfxName } from "../contracts.js";
import { PAL, createKit, drawGlowOrb, drawPet, font, rgba, rng, speciesColor } from "./kit.js";

const ORB_COLORS = [PAL.coral, PAL.butter, PAL.lagoon, "#8FA8FF"]; // up, right, down, left
const ORB_SFX: SfxName[] = ["tap", "coin", "chirp", "star"];
const KEYS: Record<string, number> = { arrowup: 0, arrowright: 1, arrowdown: 2, arrowleft: 3, w: 0, d: 1, s: 2, a: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
const ROUNDS = 7;
const LIT = 0.34, GAP = 0.14;

type Mode = "wait" | "show" | "input" | "cheer" | "oops";

export function mountMemory(mg: MinigameContext): () => void {
  const kit = createKit(mg.host, mg, {
    title: "Sparkle memory",
    hint: "Watch the lights, then repeat them. Tap, arrows, or 1 to 4.",
    duration: 60,
    untimed: true,
    scoreLabel: "",
    stars: (s) => (s >= 28 ? 3 : s >= 15 ? 2 : s >= 6 ? 1 : 0),
  });
  const color = speciesColor(mg.species);
  const r = rng(((Date.now() / 1000) | 0) ^ 0x51ed);
  const seq = Array.from({ length: ROUNDS }, () => Math.floor(r() * 4));
  const lit = [0, 0, 0, 0];
  let mode: Mode = "wait";
  let round = 1, step = 0, timer = 0.8, showIdx = 0, showPhase: "on" | "off" = "off";
  let lives = 2, score = 0, look = { x: 0, y: 0 };
  let face: "idle" | "focus" | "happy" | "cheer" | "ouch" = "idle";
  let bounce = 0, prompt = "";

  const geom = (): { cx: number; cy: number; R: number; D: number; petR: number } => {
    const R = Math.max(26, Math.min(kit.w, kit.h) * 0.12);
    const cx = kit.w / 2, cy = kit.h / 2 + 22;
    const D = Math.max(R * 1.55, Math.min(kit.w / 2 - R - 12, (kit.h - 70) / 2 - R - 10));
    return { cx, cy, R, D, petR: Math.max(20, Math.min(D * 0.42, 46)) };
  };
  const orbPos = (i: number): { x: number; y: number } => {
    const g = geom();
    const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][i]!;
    return { x: g.cx + Math.cos(a) * g.D, y: g.cy + Math.sin(a) * g.D };
  };
  const updateExtra = (): void => kit.setExtra(`${"♥".repeat(lives)}${"♡".repeat(2 - lives)}  round ${round}/${ROUNDS}`);

  function light(i: number, strong = 1): void {
    lit[i] = strong;
    const p = orbPos(i);
    kit.burst(p.x, p.y, ORB_COLORS[i]!, 10, "star");
    kit.ring(p.x, p.y, ORB_COLORS[i]!);
    kit.sfx(ORB_SFX[i]!);
    look = { x: (p.x - geom().cx) / geom().D, y: (p.y - geom().cy) / geom().D };
    bounce = 0.7;
  }

  function startShow(): void {
    mode = "show"; showIdx = 0; showPhase = "off"; timer = 0.55; step = 0;
    face = "focus"; prompt = "Watch";
    updateExtra();
  }

  function press(i: number): void {
    if (mode !== "input") return;
    light(i);
    if (i === seq[step]) {
      step += 1;
      face = "happy";
      if (step === round) {
        score += round;
        kit.setScore(score);
        const g = geom();
        kit.float(g.cx, g.cy - g.D - g.R - 10, round === ROUNDS ? "All of them!" : "Nice", PAL.butter, 26);
        kit.burst(g.cx, g.cy, PAL.butter, 22, "star");
        kit.sfx("happy");
        mode = "cheer"; timer = 1.0; face = "cheer"; prompt = "";
      }
    } else {
      lives -= 1;
      mode = "oops"; timer = 1.0; face = "ouch"; prompt = "Oops";
      kit.shake(10); kit.sfx("miss");
      updateExtra();
    }
  }

  kit.onKey((k) => { const i = KEYS[k]; if (i !== undefined) press(i); });
  kit.onPointer("down", (x, y) => {
    if (kit.phase !== "play") return;
    const g = geom();
    for (let i = 0; i < 4; i++) {
      const p = orbPos(i);
      if (Math.hypot(x - p.x, y - p.y) < g.R * 1.25) { press(i); return; }
    }
  });

  function update(dt: number, phase: string): void {
    for (let i = 0; i < 4; i++) lit[i] = Math.max(0, lit[i]! - dt * (mode === "show" ? 2.6 : 3.4));
    bounce = Math.max(0, bounce - dt * 2.5);
    look.x *= Math.pow(0.05, dt); look.y *= Math.pow(0.05, dt);
    if (phase === "intro") { if (mode === "wait") prompt = ""; return; }
    if (phase !== "play") return;
    if (mode === "wait") { timer -= dt; if (timer <= 0) startShow(); return; }
    timer -= dt;
    if (mode === "show") {
      if (timer > 0) return;
      if (showPhase === "off") {
        if (showIdx >= round) { mode = "input"; step = 0; face = "idle"; prompt = "Your turn"; return; }
        light(seq[showIdx]!, 1); showPhase = "on"; timer = LIT;
      } else {
        showIdx += 1; showPhase = "off"; timer = GAP;
      }
    } else if (mode === "cheer") {
      if (timer <= 0) {
        if (round >= ROUNDS) { mode = "wait"; timer = 99; kit.finish(score); return; }
        round += 1; startShow();
      }
    } else if (mode === "oops") {
      if (timer <= 0) {
        if (lives <= 0) { mode = "wait"; timer = 99; kit.finish(score); return; }
        startShow();
      }
    }
  }

  function draw(c: CanvasRenderingContext2D): void {
    kit.backdrop(PAL.lagoon);
    const g = geom();
    // soft stage pool under everything
    const pool = c.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.D + g.R * 1.6);
    pool.addColorStop(0, rgba(PAL.plum, 0.9)); pool.addColorStop(1, rgba(PAL.plum, 0));
    c.fillStyle = pool; c.beginPath(); c.arc(g.cx, g.cy, g.D + g.R * 1.6, 0, 6.283); c.fill();

    // connecting threads
    c.save();
    c.strokeStyle = rgba(PAL.fog, 0.08); c.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const p = orbPos(i); c.beginPath(); c.moveTo(g.cx, g.cy); c.lineTo(p.x, p.y); c.stroke(); }
    c.restore();

    for (let i = 0; i < 4; i++) {
      const p = orbPos(i);
      const ready = mode === "input" ? 0.06 + 0.04 * Math.sin(kit.time * 4 + i) : 0;
      const sc = 1 + lit[i]! * 0.12;
      drawGlowOrb(c, p.x, p.y, g.R * sc, ORB_COLORS[i]!, Math.max(lit[i]!, ready));
    }

    drawPet(c, g.cx, g.cy + g.petR * 0.9, g.petR, {
      color, face, time: kit.time, look: look.x,
      sy: 1 + bounce * 0.07, sx: 1 - bounce * 0.05,
    });

    if (prompt) {
      c.save();
      c.font = font(Math.max(17, Math.min(26, kit.w * 0.055)), 800);
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = rgba(PAL.fog, mode === "input" ? 0.9 : 0.75);
      c.fillText(prompt, kit.w / 2, 62);
      c.restore();
    }
    // progress pips for the current sequence
    if (mode === "input" || mode === "show" || mode === "cheer") {
      const y = kit.h - 20, gap = 16, x0 = kit.w / 2 - ((round - 1) * gap) / 2;
      for (let i = 0; i < round; i++) {
        const done = mode === "cheer" || (mode === "input" && i < step);
        c.fillStyle = done ? PAL.butter : rgba(PAL.fog, 0.22);
        c.beginPath(); c.arc(x0 + i * gap, y, done ? 5 : 4, 0, 6.283); c.fill();
      }
    }
  }

  kit.run(update, draw, () => { updateExtra(); kit.setProgress(1); });
  return () => kit.dispose();
}
