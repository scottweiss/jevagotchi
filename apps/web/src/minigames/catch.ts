/** Treat Catch: slide under falling snacks, dodge the vegetables. */
import type { MinigameContext } from "../contracts.js";
import { PAL, createKit, drawPet, lerp, rgba, shade, speciesColor } from "./kit.js";

type Kind = "berry" | "cookie" | "star" | "veg";
interface Item { x: number; y: number; vy: number; kind: Kind; r: number; rot: number; spin: number; wob: number; }

const PALETTE: Record<Kind, string> = { berry: PAL.coral, cookie: PAL.peach, star: PAL.butter, veg: "#5FA84A" };

export function mountCatch(mg: MinigameContext): () => void {
  const kit = createKit(mg.host, mg, {
    title: "Treat catch",
    hint: "Slide to catch snacks. Dodge the veg.",
    duration: 25,
    scoreLabel: "",
    stars: (s) => (s >= 38 ? 3 : s >= 24 ? 2 : s >= 12 ? 1 : 0),
  });
  const color = speciesColor(mg.species);
  const items: Item[] = [];
  let px = kit.w / 2, target = px, vel = 0;
  let squash = 0, squashV = 0, faceT = 0, face: "idle" | "eat" | "ouch" | "cheer" = "idle";
  let spawnT = 0.4, elapsed = 0, combo = 0, score = 0, caught = 0;

  const petR = (): number => Math.max(24, Math.min(58, Math.min(kit.w, kit.h) * 0.1));
  const groundY = (): number => kit.h - Math.max(18, kit.h * 0.06);

  kit.onPointer("down", (x) => { target = x; });
  kit.onPointer("move", (x) => { target = x; });

  function spawn(): void {
    const r = Math.max(11, Math.min(18, kit.w * 0.034));
    const roll = Math.random();
    const kind: Kind = roll < 0.24 ? "veg" : roll < 0.3 ? "star" : roll < 0.65 ? "berry" : "cookie";
    const speed = kit.h * lerp(0.42, 0.72, Math.min(1, elapsed / 25)) * (kind === "star" ? 1.25 : 1) * (0.9 + Math.random() * 0.25);
    const margin = r + 8;
    items.push({ x: margin + Math.random() * (kit.w - margin * 2), y: -r, vy: speed, kind, r, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 3, wob: Math.random() * 6 });
  }

  function pulse(amount: number): void { squashV += amount; }

  function update(dt: number, phase: string): void {
    const R = petR();
    const speed = Math.max(kit.w, 320) * 1.1;
    if (phase === "play") {
      if (kit.keys.has("arrowleft") || kit.keys.has("a")) target -= speed * dt;
      if (kit.keys.has("arrowright") || kit.keys.has("d")) target += speed * dt;
    }
    target = Math.max(R, Math.min(kit.w - R, target));
    const nx = px + (target - px) * Math.min(1, dt * 16);
    vel = (nx - px) / Math.max(dt, 1e-3);
    px = nx;

    // squash spring
    squashV += (-squash * 260 - squashV * 16) * dt;
    squash += squashV * dt;
    faceT -= dt;
    if (faceT <= 0) face = "idle";

    if (phase !== "play") return;
    elapsed += dt;
    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = lerp(0.72, 0.4, Math.min(1, elapsed / 25)) * (0.75 + Math.random() * 0.5); }

    const gy = groundY();
    const mouthY = gy - R * 1.5;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      it.y += it.vy * dt;
      it.rot += it.spin * dt;
      const hitX = Math.abs(it.x - px) < R * 1.0 + it.r * 0.5;
      const hitY = it.y + it.r > mouthY - R * 0.4 && it.y - it.r < gy - R * 0.6;
      if (hitX && hitY) {
        items.splice(i, 1);
        if (it.kind === "veg") {
          combo = 0;
          score = Math.max(0, score - 3);
          face = "ouch"; faceT = 0.7;
          pulse(-9);
          kit.shake(9);
          kit.burst(it.x, it.y, "#5FA84A", 12);
          kit.float(it.x, it.y - 10, "-3", PAL.coral);
          kit.sfx("miss");
        } else {
          combo += 1; caught += 1;
          const base = it.kind === "star" ? 5 : 1;
          const bonus = it.kind === "star" ? 0 : combo >= 10 ? 2 : combo >= 5 ? 1 : 0;
          score += base + bonus;
          face = combo >= 8 ? "cheer" : "eat"; faceT = 0.35;
          pulse(7);
          kit.burst(it.x, it.y, PALETTE[it.kind], it.kind === "star" ? 16 : 9, it.kind === "star" ? "star" : "dot");
          kit.ring(it.x, it.y, PALETTE[it.kind]);
          kit.float(it.x, it.y - 12, `+${base + bonus}`, it.kind === "star" ? PAL.butter : PAL.fog);
          kit.sfx(it.kind === "star" ? "star" : combo % 5 === 0 ? "happy" : "coin");
        }
        kit.setScore(score);
        kit.setExtra(combo >= 3 ? `${combo} in a row` : "");
        continue;
      }
      if (it.y - it.r > kit.h) {
        items.splice(i, 1);
        if (it.kind !== "veg") { combo = 0; kit.setExtra(""); }
      }
    }
  }

  function drawItem(c: CanvasRenderingContext2D, it: Item, t: number): void {
    c.save();
    c.translate(it.x, it.y);
    // glow
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(0, 0, 0, 0, 0, it.r * 2.6);
    g.addColorStop(0, rgba(PALETTE[it.kind], it.kind === "veg" ? 0.16 : 0.42));
    g.addColorStop(1, rgba(PALETTE[it.kind], 0));
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, it.r * 2.6, 0, 6.283); c.fill();
    c.globalCompositeOperation = "source-over";
    c.rotate(it.kind === "veg" ? Math.sin(t * 5 + it.wob) * 0.25 : it.rot);
    const r = it.r;
    if (it.kind === "star") {
      c.fillStyle = PAL.butter;
      c.strokeStyle = "#fff6c8"; c.lineWidth = 2; c.lineJoin = "round";
      c.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.5 : r * 1.25; const a = (i * Math.PI) / 5 - Math.PI / 2; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.stroke();
    } else if (it.kind === "veg") {
      c.fillStyle = "#3F7A38";
      c.fillRect(-r * 0.22, r * 0.2, r * 0.44, r * 0.85);
      for (const [x, y, k] of [[-0.55, -0.1, 0.62], [0.55, -0.1, 0.62], [0, -0.5, 0.7], [0, 0.05, 0.65]] as const) {
        const b = c.createRadialGradient(x * r - 3, y * r - 3, 1, x * r, y * r, r * k * 1.1);
        b.addColorStop(0, "#8FD36A"); b.addColorStop(1, "#3F7A38");
        c.fillStyle = b;
        c.beginPath(); c.arc(x * r, y * r, r * k, 0, 6.283); c.fill();
      }
      c.strokeStyle = PAL.ink; c.lineWidth = 1.8; c.lineCap = "round";
      c.beginPath(); c.moveTo(-r * 0.4, -r * 0.2); c.lineTo(-r * 0.15, -r * 0.05); c.moveTo(r * 0.4, -r * 0.2); c.lineTo(r * 0.15, -r * 0.05);
      c.moveTo(-r * 0.22, r * 0.28); c.quadraticCurveTo(0, r * 0.08, r * 0.22, r * 0.28); c.stroke();
    } else if (it.kind === "berry") {
      const b = c.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r * 1.1);
      b.addColorStop(0, shade(PAL.coral, 0.45)); b.addColorStop(1, shade(PAL.coral, -0.2));
      c.fillStyle = b; c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.fill();
      c.fillStyle = PAL.lagoon;
      c.beginPath(); c.ellipse(0, -r * 0.95, r * 0.34, r * 0.16, -0.5, 0, 6.283); c.fill();
      c.fillStyle = "rgba(255,255,255,.7)"; c.beginPath(); c.arc(-r * 0.35, -r * 0.35, r * 0.2, 0, 6.283); c.fill();
    } else {
      const b = c.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r * 1.1);
      b.addColorStop(0, "#FFE0C2"); b.addColorStop(1, shade(PAL.peach, -0.25));
      c.fillStyle = b; c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.fill();
      c.fillStyle = "#7A4A3A";
      for (const [x, y] of [[-0.3, -0.25], [0.35, -0.1], [-0.05, 0.4], [0.25, 0.4]] as const) { c.beginPath(); c.arc(x * r, y * r, r * 0.14, 0, 6.283); c.fill(); }
    }
    c.restore();
  }

  function draw(c: CanvasRenderingContext2D): void {
    kit.backdrop(PAL.peach);
    const gy = groundY();
    // floor: glossy platform
    const fl = c.createLinearGradient(0, gy - 4, 0, kit.h);
    fl.addColorStop(0, rgba(PAL.lagoon, 0.28)); fl.addColorStop(1, rgba(PAL.ink, 0.6));
    c.fillStyle = fl; c.fillRect(-20, gy - 2, kit.w + 40, kit.h - gy + 22);
    c.fillStyle = rgba(PAL.fog, 0.2); c.fillRect(-20, gy - 2, kit.w + 40, 2);

    for (const it of items) drawItem(c, it, kit.time);

    const R = petR();
    const sy = 1 - squash * 0.22, sx = 1 / sy;
    drawPet(c, px, gy, R, { color, face, sx, sy, look: Math.max(-1, Math.min(1, vel / 400)), time: kit.time, tilt: Math.max(-0.25, Math.min(0.25, vel * 0.0004)) });
  }

  kit.run(update, draw);
  void caught;
  return () => kit.dispose();
}
