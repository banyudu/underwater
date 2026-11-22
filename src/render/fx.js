// 特效层：扩散环、粒子、气泡、飘分。

import { TAU, clamp, lerp } from '../core/math.js';
import { ctx } from '../core/viewport.js';
import { world } from '../world/world.js';

export function drawFx() {
  const { rings, parts, bubbles, texts, cam } = world;

  // rings
  for (const r of rings) {
    const t = 1 - r.life / r.max;
    const rad = lerp(r.r0, r.r1, 1 - Math.pow(1 - t, 2));
    ctx.beginPath();
    ctx.arc(r.x, r.y, rad, 0, TAU);
    ctx.strokeStyle = r.col;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 2.4 * (1 - t) + 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // particles
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    const a = p.life / p.max;
    ctx.fillStyle = `hsla(${p.hue | 0},95%,72%,${a * 0.85})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.4, p.r * a), 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // bubbles
  ctx.save();
  ctx.lineWidth = 1;
  for (const b of bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.strokeStyle = `rgba(210,255,255,${0.38 * b.a})`;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, TAU);
    ctx.fillStyle = `rgba(255,255,255,${0.5 * b.a})`;
    ctx.fill();
  }
  ctx.restore();

  // floating score
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.round(13 / cam.z)}px -apple-system,"PingFang SC",sans-serif`;
  for (const t of texts) {
    const a = clamp(t.life / t.max * 1.4, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = t.col;
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
