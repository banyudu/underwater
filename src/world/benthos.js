// 底栖/周边生物：螃蟹（在礁石表面爬）、海龟（缓慢游过）。
// 同样不参与吃/被吃，只增加生态感。

import { TAU, clamp, rand } from '../core/math.js';
import { world, depthM } from './world.js';
import { viewHW, viewHH, viewArea } from '../systems/view.js';

const CRAB_MAX = 4;
const TURTLE_MAX = 2;

export function crabTarget() {
  const rocks = world.terrain.filter(o => o.kind === 'boulder').length;
  return clamp(Math.round(Math.min(rocks, viewArea() / 400000)), 0, CRAB_MAX);
}
export function turtleTarget() { return clamp(Math.round(viewArea() / 1200000), 0, TURTLE_MAX); }

export function makeCrab(host) {
  return {
    host,
    // 在石头的上半弧上行走，a 是当前角度
    a: rand(-Math.PI * 0.85, -Math.PI * 0.15),
    dir: Math.random() < 0.5 ? -1 : 1,
    speed: rand(0.25, 0.55),
    ph: rand(TAU),
    size: rand(4.2, 7),
  };
}

export function makeTurtle(init) {
  const hw = viewHW(), hh = viewHH();
  return {
    x: world.cam.x + (init ? rand(-hw * 0.9, hw * 0.9) : rand(-hw * 1.35, hw * 1.35)),
    y: clamp(world.cam.y + rand(-hh * 0.8, hh * 0.8), 200, 30000),
    r: rand(26, 46),
    vx: rand(10, 22) * (Math.random() < 0.5 ? -1 : 1),
    vy: rand(-6, 6),
    ph: rand(TAU),
    hue: rand(150, 180),
  };
}

/** 石头没了，附在上面的螃蟹也要跟着走。 */
function pruneCrabs() {
  const { crabs, terrain } = world;
  for (let i = crabs.length - 1; i >= 0; i--) {
    if (!terrain.includes(crabs[i].host)) crabs.splice(i, 1);
  }
}

export function updateBenthos(dt) {
  const { crabs, turtles, terrain } = world;

  pruneCrabs();

  // 给空闲的石头配上螃蟹
  const want = crabTarget();
  if (crabs.length < want) {
    for (const o of terrain) {
      if (crabs.length >= want) break;
      if (o.kind !== 'rock') continue;
      if (crabs.some(c => c.host === o)) continue;
      crabs.push(makeCrab(o));
    }
  }

  for (const c of crabs) {
    c.ph += dt;
    c.a += c.dir * c.speed * dt;
    // 走到弧的两端就折返
    if (c.a < -Math.PI * 0.88) { c.a = -Math.PI * 0.88; c.dir = 1; }
    if (c.a > -Math.PI * 0.12) { c.a = -Math.PI * 0.12; c.dir = -1; }
  }

  for (let i = turtles.length - 1; i >= 0; i--) {
    const t = turtles[i];
    t.ph += dt;
    t.x += (t.vx + Math.sin(world.time * 0.25 + t.ph) * 5) * dt;
    t.y += (t.vy + Math.cos(world.time * 0.21 + t.ph) * 4) * dt;
    if (Math.abs(t.x - world.cam.x) > viewHW() * 1.9 || Math.abs(t.y - world.cam.y) > viewHH() * 1.7) {
      turtles.splice(i, 1);
    }
  }
  while (turtles.length < turtleTarget()) {
    turtles.push(makeTurtle(turtles.length === 0));
  }
}

export function resetBenthos() {
  world.crabs.length = 0;
  world.turtles.length = 0;
  for (let i = 0; i < turtleTarget(); i++) world.turtles.push(makeTurtle(true));
  // 螃蟹在第一次 updateBenthos 时按石头自动配对
}

/** 螃蟹的世界坐标：贴在石头表面的上半弧上。 */
export function crabPos(c) {
  const host = c.host;
  const R = host.r * 0.78;
  return {
    x: host.x + Math.cos(c.a) * R,
    y: host.y + Math.sin(c.a) * R * 0.72 + host.r * 0.1,
  };
}
