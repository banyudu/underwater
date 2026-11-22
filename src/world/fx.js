// 短命特效：粒子、气泡、飘分、扩散环。全部走对象池式的数组 + splice 回收。

import { TAU, rand } from '../core/math.js';
import { world } from './world.js';

export function burst(x, y, n, hue, gentle) {
  const { parts } = world;
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), sp = rand(gentle ? 40 : 70, gentle ? 130 : 320);
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      r: rand(1.2, gentle ? 3 : 4.4), life: rand(0.35, 0.9), max: 1,
      hue: hue + rand(-16, 16), drag: 2.6,
    });
    parts[parts.length - 1].max = parts[parts.length - 1].life;
  }
}

export function addBubble(x, y, size) {
  world.bubbles.push({ x, y, r: size || rand(1.2, 3.4), v: rand(26, 74), ph: rand(TAU), a: rand(0.4, 0.9) });
}

export function addText(x, y, txt, col) {
  world.texts.push({ x, y, txt, col, life: 1.1, max: 1.1 });
}

export function ring(x, y, r0, r1, life, col) {
  world.rings.push({ x, y, r0, r1, life, max: life, col: col || 'rgba(170,255,240,.55)' });
}

export function updateFx(dt) {
  const { parts, bubbles, rings, texts } = world;

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const d = Math.exp(-p.drag * dt);
    p.vx *= d; p.vy = p.vy * d - 16 * dt;
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.y -= b.v * dt;
    b.x += Math.sin(world.time * 2.4 + b.ph) * 18 * dt;
    b.ph += dt * 2;
    if (b.y < -30) bubbles.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    if (r.life <= 0) rings.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt;
    t.y -= 26 * dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
}
