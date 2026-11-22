// 生成与回收：鱼、水母、浮游生物、海雪，以及世界重置。

import { TAU, clamp, rand, pick } from '../core/math.js';
import { onResize, W, H } from '../core/viewport.js';
import { world, depthM } from './world.js';
import { SPECS, FOOD_KEYS, DEEP_FOOD, PRED_KEYS, DEEP_PRED } from '../config/species.js';
import { viewHW, viewHH, viewArea } from '../systems/view.js';

// 数量上限按可视面积缩放，桌面和手机都能保持合适密度。
export function fishTarget() { return clamp(Math.round(viewArea() / 18000), 10, 30); }
export function jellyTarget() { return clamp(Math.round(viewArea() / 150000), 3, 5); }
export function foodTarget() { return clamp(Math.round(viewArea() / 4200), 55, 170); }

export function spawnPos(init, margin = 1.12) {
  const hw = viewHW(), hh = viewHH();
  if (init) {
    return { x: world.cam.x + rand(-hw * 0.95, hw * 0.95), y: world.cam.y + rand(-hh * 0.95, hh * 0.95) };
  }
  const ang = rand(TAU);
  const m = rand(margin, margin + 0.26);
  return { x: world.cam.x + Math.cos(ang) * hw * m, y: world.cam.y + Math.sin(ang) * hh * m };
}

export function addFish(init) {
  const d = depthM();
  const player = world.player;
  const pr = player.r;
  const roll = Math.random();
  let r, key;
  const deep = d > 85;

  if (roll < 0.56) {
    r = pr * rand(0.22, 0.74);
    key = pick(deep && Math.random() < 0.5 ? DEEP_FOOD : FOOD_KEYS);
  } else if (roll < 0.8) {
    r = pr * rand(0.84, 1.04);
    key = pick(deep ? DEEP_FOOD : FOOD_KEYS);
  } else {
    r = pr * rand(1.3, 2.15);
    key = pick(deep ? DEEP_PRED : PRED_KEYS);
  }
  r *= 1 + clamp(d / 700, 0, 0.42);
  r = clamp(r, 4, 132);

  const spec = SPECS[key];
  const pos = spawnPos(init);
  // never spawn on top of the player
  if (Math.hypot(pos.x - player.x, pos.y - player.y) < Math.max(190, player.r * 6)) {
    const a = rand(TAU);
    const dd = Math.max(220, player.r * 6);
    pos.x = player.x + Math.cos(a) * dd;
    pos.y = player.y + Math.sin(a) * dd;
  }
  const f = {
    x: pos.x, y: clamp(pos.y, 120, 30000), vx: 0, vy: 0, r,
    spec, key,
    hue: spec.h + rand(-9, 9),
    lit: spec.l + rand(-5, 5),
    phase: rand(TAU), seed: rand(100),
    hunt: 0, giveup: 0, lunge: 0, lungeCd: rand(0.5, 3), danger: 0,
    faceDir: 1, pitch: 0,
  };
  f.lungeCd = rand(0.5, 3);
  world.fishes.push(f);
}

export function addJelly(init) {
  const d = depthM();
  const pos = spawnPos(init, 1.05);
  const r = rand(9, 26) * (1 + clamp(d / 800, 0, 0.6));
  world.jellies.push({
    x: pos.x, y: clamp(pos.y, 140, 30000),
    r, hue: rand(188, 306), ph: rand(TAU),
    vy: rand(-14, 6), vx: rand(-10, 10),
  });
}

export function makeFood(init) {
  const hw = viewHW(), hh = viewHH();
  const big = Math.random() < 0.09;
  return {
    x: world.cam.x + rand(-hw * 1.05, hw * 1.05),
    y: clamp(world.cam.y + rand(-hh * 1.05, hh * 1.05), 110, 30000),
    r: big ? rand(2.6, 3.8) : rand(1.2, 2.0),
    big, hue: rand(158, 202), ph: rand(TAU),
  };
}

export function relocateFood(p) {
  const hw = viewHW(), hh = viewHH();
  p.x = world.cam.x + rand(-hw * 1.05, hw * 1.05);
  p.y = clamp(world.cam.y + rand(-hh * 1.05, hh * 1.05), 110, 30000);
  p.ph = rand(TAU);
  p.big = Math.random() < 0.09;
  p.r = p.big ? rand(2.6, 3.8) : rand(1.2, 2.0);
}

export function buildSnow() {
  world.snow = [];
  const n = Math.min(150, Math.max(50, Math.round(W * H / 13000)));
  for (let i = 0; i < n; i++) {
    world.snow.push({ x: rand(W), y: rand(H), z: rand(0.25, 1), s: rand(0.6, 1.5) });
  }
}

export function resetWorld() {
  const { fishes, jellies, foods, parts, bubbles, rings, texts } = world;
  const player = world.player;

  fishes.length = 0; jellies.length = 0; foods.length = 0;
  parts.length = 0; bubbles.length = 0; rings.length = 0; texts.length = 0;

  player.x = 0; player.y = 660;
  player.vx = player.vy = 0;
  player.r = 24;
  player.dir = 1; player.pitch = 0; player.phase = 0;
  player.invuln = 2.4; player.alive = true; player.trail = 0;
  world.cam.x = 0; world.cam.y = player.y; world.cam.z = 1.5;

  const nFish = fishTarget(), nJelly = jellyTarget(), nFood = foodTarget();
  for (let i = 0; i < nFish; i++) addFish(true);
  for (let i = 0; i < nJelly; i++) addJelly(true);
  for (let i = 0; i < nFood; i++) foods.push(makeFood(true));

  world.zoneIdx = -1;
  world.maxDepth = 0;
}

// 窗口尺寸变化时重铺海雪
onResize(buildSnow);
