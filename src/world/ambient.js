// 环境元素：鱼群、蝠鲼、热泉。
// 和鱼/水母不同，它们不参与"吃/被吃"，只负责让海洋有层次和生态感。
// 按深度分工：浅水有鱼群，中深层出现蝠鲼与热泉。

import { TAU, clamp, rand } from '../core/math.js';
import { world, depthM } from './world.js';
import { addBubble } from './fx.js';
import { viewHW, viewHH, viewArea } from '../systems/view.js';

const SHOAL_MAX = 3;
const MANTA_MAX = 2;
const VENT_MAX = 4;

export function shoalTarget() { return clamp(Math.round(viewArea() / 520000), 1, SHOAL_MAX); }
export function mantaTarget() { return clamp(Math.round(viewArea() / 1100000), 0, MANTA_MAX); }

/** 热泉只在 55m 以下出现。 */
export function ventTarget() {
  if (depthM() < 55) return 0;
  return clamp(Math.round(viewArea() / 760000), 1, VENT_MAX);
}

function offscreen(x, y, mul) {
  return Math.abs(x - world.cam.x) > viewHW() * mul || Math.abs(y - world.cam.y) > viewHH() * mul;
}

export function makeShoal(init) {
  const hw = viewHW(), hh = viewHH();
  const count = 9 + ((Math.random() * 13) | 0);
  const members = [];
  for (let i = 0; i < count; i++) {
    members.push({
      ox: rand(-1, 1),
      oy: rand(-0.62, 0.62),
      ph: rand(TAU),
      sz: rand(0.65, 1.15),
    });
  }
  return {
    x: world.cam.x + (init ? rand(-hw * 0.85, hw * 0.85) : rand(-hw, hw)),
    y: clamp(world.cam.y + rand(-hh * 0.8, hh * 0.8), 140, 30000),
    vx: rand(16, 36) * (Math.random() < 0.5 ? -1 : 1),
    vy: rand(-9, 9),
    r: rand(30, 68),
    hue: rand(176, 214),
    ph: rand(TAU),
    members,
  };
}

export function makeManta(init) {
  const hw = viewHW(), hh = viewHH();
  return {
    x: world.cam.x + (init ? rand(-hw * 0.9, hw * 0.9) : rand(-hw * 1.3, hw * 1.3)),
    y: clamp(world.cam.y + rand(-hh * 0.75, hh * 0.75), 220, 30000),
    r: rand(62, 118),
    vx: rand(15, 27) * (Math.random() < 0.5 ? -1 : 1),
    vy: rand(-4, 4),
    ph: rand(TAU),
    pitch: rand(-0.12, 0.12),
  };
}

export function makeVent(init) {
  const hw = viewHW(), hh = viewHH();
  return {
    x: world.cam.x + rand(-hw * 0.9, hw * 0.9),
    // 贴在视野下缘附近，像从海底冒上来
    y: clamp(world.cam.y + rand(hh * 0.45, hh * 1.15), 240, 30000),
    ph: rand(TAU),
    rate: rand(0.28, 0.75),
    t: rand(0.4),
    hue: rand(14, 38),
  };
}

/** 补足数量，并把跑出视野的回收。 */
export function updateAmbient(dt) {
  const { shoals, mantas, vents, cam } = world;

  for (let i = shoals.length - 1; i >= 0; i--) {
    const s = shoals[i];
    s.ph += dt;
    s.x += (s.vx + Math.sin(world.time * 0.4 + s.ph) * 8) * dt;
    s.y += (s.vy + Math.cos(world.time * 0.33 + s.ph) * 6) * dt;
    if (Math.abs(s.x - cam.x) > viewHW() * 1.6 || Math.abs(s.y - cam.y) > viewHH() * 1.6) {
      shoals.splice(i, 1);
    }
  }
  while (shoals.length < shoalTarget()) {
    shoals.push(makeShoal(shoals.length === 0));
  }

  for (let i = mantas.length - 1; i >= 0; i--) {
    const m = mantas[i];
    m.ph += dt;
    m.x += m.vx * dt;
    m.y += (m.vy + Math.sin(world.time * 0.22 + m.ph) * 5) * dt;
    if (Math.abs(m.x - cam.x) > viewHW() * 2.1 || Math.abs(m.y - cam.y) > viewHH() * 1.8) {
      mantas.splice(i, 1);
    }
  }
  while (mantas.length < mantaTarget()) {
    mantas.push(makeManta(mantas.length === 0));
  }

  const vt = ventTarget();
  for (let i = vents.length - 1; i >= 0; i--) {
    const v = vents[i];
    v.ph += dt;
    if (Math.abs(v.x - cam.x) > viewHW() * 1.5 || Math.abs(v.y - cam.y) > viewHH() * 1.7) {
      vents.splice(i, 1);
      continue;
    }
    // 周期吐泡，复用已有的气泡系统
    v.t -= dt;
    if (v.t <= 0) {
      v.t = v.rate * (0.6 + Math.random() * 0.8);
      addBubble(v.x + rand(-5, 5), v.y + rand(-6, 6), rand(1.2, 3.2));
    }
  }
  while (vents.length < vt) vents.push(makeVent(vents.length === 0));
}

export function resetAmbient() {
  world.shoals.length = 0;
  world.mantas.length = 0;
  world.vents.length = 0;
  for (let i = 0; i < shoalTarget(); i++) world.shoals.push(makeShoal(true));
  for (let i = 0; i < mantaTarget(); i++) world.mantas.push(makeManta(true));
  for (let i = 0; i < ventTarget(); i++) world.vents.push(makeVent(true));
}
