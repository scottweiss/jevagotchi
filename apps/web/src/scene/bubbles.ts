/** Speech + thought bubbles with hand-lettered text and drawn (not emoji) icons. */
import type { Want } from "@jevagotchi/core";
import type { Layout } from "./room.js";
import { FONT, P, Spring, clamp, rrect, star5 } from "./util.js";

type Ctx = CanvasRenderingContext2D;

interface Glyph { ch: string; x: number; dy: number; rot: number }
interface Line { glyphs: Glyph[]; w: number }

export class Bubbles {
  private speechSp = new Spring(0, 240, 16);
  private thoughtSp = new Spring(0, 260, 15);
  private text = "";
  private lines: Line[] = [];
  private lineH = 20;
  private fs = 18;
  private bw = 0; private bh = 0;
  private laidFor = "";
  private icon: Want | null = null;
  private wantOn = false;
  private urgency = 0;

  update(dt: number, speech: string | null, want: Want | null, urgency: number, L: Layout, ctx: Ctx): void {
    if (speech && speech !== this.text) { this.text = speech; this.laidFor = ""; }
    const fs = clamp(L.size * 0.125, 15, 24);
    const key = `${this.text}|${fs}|${L.W}`;
    if (this.text && this.laidFor !== key) this.layout(ctx, fs, L);
    this.speechSp.step(speech ? 1 : 0, dt);
    if (want && want !== "nothing") { this.icon = want; this.wantOn = true; } else this.wantOn = false;
    this.thoughtSp.step(this.wantOn ? 1 : 0, dt);
    this.urgency = urgency;
  }

  private layout(ctx: Ctx, fs: number, L: Layout): void {
    this.fs = fs;
    this.laidFor = `${this.text}|${fs}|${L.W}`;
    ctx.save();
    ctx.font = `600 ${fs}px ${FONT}`;
    const maxW = Math.min(L.W * 0.66, 250);
    const words = this.text.split(/\s+/).filter(Boolean);
    const rows: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (cur && ctx.measureText(t).width > maxW) { rows.push(cur); cur = w; } else cur = t;
    }
    if (cur) rows.push(cur);
    this.lines = rows.map((r, li) => {
      const glyphs: Glyph[] = [];
      for (let i = 0; i < r.length; i++) {
        const h = Math.sin((i + 1) * 12.9898 + (li + 1) * 78.233) * 43758.5453;
        const f = h - Math.floor(h);
        glyphs.push({ ch: r[i]!, x: ctx.measureText(r.slice(0, i)).width, dy: (f - 0.5) * fs * 0.09, rot: (f - 0.5) * 0.045 });
      }
      return { glyphs, w: ctx.measureText(r).width };
    });
    ctx.restore();
    this.lineH = fs * 1.22;
    this.bw = Math.max(...this.lines.map((l) => l.w), 20) + fs * 1.5;
    this.bh = this.lines.length * this.lineH + fs * 0.85;
  }

  draw(ctx: Ctx, L: Layout, now: number, headY: number, asleep: boolean): void {
    const sp = this.speechSp.x;
    if (sp > 0.02 && this.lines.length) this.drawSpeech(ctx, L, now, headY, sp);
    const tp = this.thoughtSp.x;
    if (tp > 0.02 && this.icon && !asleep) this.drawThought(ctx, L, now, tp);
  }

  private drawSpeech(ctx: Ctx, L: Layout, now: number, headY: number, sp: number): void {
    const bob = Math.sin(now * 0.0021) * 2.2;
    let bx = L.cx - this.bw / 2;
    bx = clamp(bx, 10, L.W - this.bw - 10);
    const by = headY - 20 - this.bh + bob;
    const pivotX = L.cx, pivotY = headY - 8;
    ctx.save();
    ctx.translate(pivotX, pivotY);
    const sc = Math.max(0.01, sp);
    ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(sp * 1.6);
    ctx.translate(-pivotX, -pivotY);
    // bubble body + tail as one silhouette
    ctx.shadowColor = "rgba(27,22,56,0.4)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    rrect(ctx, bx, by, this.bw, this.bh, Math.min(this.bh / 2, 20));
    ctx.fillStyle = "#fbf9ff";
    ctx.fill();
    ctx.shadowColor = "transparent";
    const tx = clamp(L.cx, bx + 22, bx + this.bw - 22);
    ctx.beginPath();
    ctx.moveTo(tx - 9, by + this.bh - 1);
    ctx.quadraticCurveTo(tx - 1, by + this.bh + 2, L.cx + 1, headY - 9);
    ctx.quadraticCurveTo(tx + 6, by + this.bh + 4, tx + 10, by + this.bh - 1);
    ctx.closePath();
    ctx.fillStyle = "#fbf9ff";
    ctx.fill();
    // paper highlight
    const hg = ctx.createLinearGradient(0, by, 0, by + this.bh);
    hg.addColorStop(0, "rgba(236,233,255,0)"); hg.addColorStop(1, "rgba(200,190,255,0.35)");
    rrect(ctx, bx, by, this.bw, this.bh, Math.min(this.bh / 2, 20));
    ctx.fillStyle = hg; ctx.fill();
    // text
    ctx.font = `600 ${this.fs}px ${FONT}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = P.ink;
    const total = this.lines.length * this.lineH;
    let ly = by + (this.bh - total) / 2 + this.fs * 0.98;
    for (const ln of this.lines) {
      const lx = bx + (this.bw - ln.w) / 2;
      for (const gl of ln.glyphs) {
        if (gl.ch === " ") continue;
        ctx.save();
        ctx.translate(lx + gl.x, ly + gl.dy);
        ctx.rotate(gl.rot);
        ctx.fillText(gl.ch, 0, 0);
        ctx.restore();
      }
      ly += this.lineH;
    }
    ctx.restore();
  }

  private drawThought(ctx: Ctx, L: Layout, now: number, tp: number): void {
    const r = clamp(L.size * 0.21, 24, 42);
    const x = L.cx + L.size * 0.68 + r * 0.1, y = L.cy - L.size * 0.34;
    const bob = Math.sin(now * 0.003) * 2;
    const hot = this.urgency > 0.66;
    const pulse = hot ? 1 + Math.sin(now * 0.012) * 0.06 : 1 + Math.sin(now * 0.004) * 0.025;
    ctx.save();
    ctx.translate(x, y + bob);
    const sc = Math.max(0.01, tp) * pulse;
    ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(tp * 1.6);
    ctx.shadowColor = "rgba(27,22,56,0.4)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#fbf9ff";
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.fill();
    // trailing dots toward the creature
    ctx.beginPath(); ctx.arc(-r * 0.95, r * 0.95, r * 0.2, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 1.28, r * 1.35, r * 0.11, 0, 6.3); ctx.fill();
    ctx.shadowColor = "transparent";
    if (hot) {
      ctx.strokeStyle = P.coral; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, r - 1.5, 0, 6.3); ctx.stroke();
    }
    ctx.scale(r / 30, r / 30);
    drawIcon(ctx, this.icon!, now);
    ctx.restore();
  }
}

/** Icons drawn in a ~60x60 box centred on the origin. */
export function drawIcon(ctx: Ctx, w: Want, now: number): void {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  switch (w) {
    case "food": {
      // bowl with kibble
      ctx.fillStyle = P.butter;
      for (const [x, y] of [[-10, -4], [0, -9], [10, -4], [-3, -2], [6, -1]] as const) { ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.3); ctx.fill(); }
      ctx.fillStyle = "#ff7d92";
      ctx.beginPath(); ctx.moveTo(-21, 0); ctx.quadraticCurveTo(-18, 20, -8, 21); ctx.lineTo(8, 21); ctx.quadraticCurveTo(18, 20, 21, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffa1b0"; ctx.beginPath(); ctx.ellipse(0, 0, 21, 5, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#7a2c4a"; ctx.beginPath(); ctx.ellipse(0, 0.5, 17, 3.2, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = P.butter; ctx.beginPath(); ctx.arc(-4, -1, 3.6, Math.PI, 0); ctx.arc(5, -1, 3.6, Math.PI, 0); ctx.fill();
      break;
    }
    case "play": {
      const rot = now * 0.002;
      ctx.save(); ctx.rotate(rot);
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, 6.3); ctx.fillStyle = P.coral; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = P.butter; ctx.fillRect(-30, -6, 60, 12);
      ctx.fillStyle = P.lagoon; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.3); ctx.fill();
      ctx.restore();
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.ellipse(-8, -10, 5, 3, -0.7, 0, 6.3); ctx.fill();
      break;
    }
    case "sleep": {
      ctx.fillStyle = "#8FA8FF";
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, 6.3); ctx.fill();
      // bite out of the disc in the paper colour to leave a crescent
      ctx.fillStyle = "#fbf9ff"; ctx.beginPath(); ctx.arc(9, -6, 16, 0, 6.3); ctx.fill();
      ctx.save(); ctx.translate(15, 12); star5(ctx, 6); ctx.fillStyle = P.butter; ctx.fill(); ctx.restore();
      break;
    }
    case "cleaning": {
      // soap bar + bubbles
      ctx.save(); ctx.rotate(-0.25);
      rrect(ctx, -19, -4, 38, 24, 9); ctx.fillStyle = P.lagoon; ctx.fill();
      rrect(ctx, -19, -4, 38, 8, 6); ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fill();
      ctx.restore();
      for (const [x, y, r] of [[-8, -12, 6], [6, -19, 4.5], [10, -8, 3.5]] as const) {
        ctx.strokeStyle = "#7fb8e8"; ctx.lineWidth = 2; ctx.fillStyle = "rgba(160,220,255,0.35)";
        ctx.beginPath(); ctx.arc(x, y + Math.sin(now * 0.004 + x) * 1.2, r, 0, 6.3); ctx.fill(); ctx.stroke();
      }
      break;
    }
    case "attention": {
      // waving hand
      ctx.save(); ctx.rotate(Math.sin(now * 0.008) * 0.18);
      ctx.fillStyle = "#ffcfae"; ctx.strokeStyle = "#e09a76"; ctx.lineWidth = 1.6;
      for (const [x, a, l] of [[-11, -0.22, 20], [-3.5, -0.07, 24], [4, 0.08, 23], [11, 0.24, 18]] as const) {
        ctx.save(); ctx.translate(x, -3); ctx.rotate(a);
        rrect(ctx, -3.6, -l, 7.2, l + 2, 3.6); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.beginPath(); ctx.ellipse(0, 6, 15, 13, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(-13, 6); ctx.rotate(-0.9); rrect(ctx, -3.6, -14, 7.2, 16, 3.6); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.restore();
      break;
    }
    case "medicine": {
      ctx.save(); ctx.rotate(-0.6);
      rrect(ctx, -22, -9.5, 44, 19, 9.5); ctx.save(); ctx.clip();
      ctx.fillStyle = P.coral; ctx.fillRect(-22, -10, 22, 20);
      ctx.fillStyle = "#fbf9ff"; ctx.fillRect(0, -10, 22, 20);
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(-20, -7, 40, 4);
      ctx.restore();
      rrect(ctx, -22, -9.5, 44, 19, 9.5); ctx.strokeStyle = "#a63b56"; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
      break;
    }
    default: break;
  }
}
