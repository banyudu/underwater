// 地形：礁石、洞穴、沉船残骸。
//
// 所有地形都用"一串圆"来表示，碰撞就是圆vs圆，简单且稳定。
// 洞穴是按拱形排列的圆，底部中央留一个缺口：
// 缺口宽度固定，所以体型小的玩家能钻进去躲，大猎手进不来——洞穴是保命机制而不是装饰。

import { TAU, clamp, rand, lerp } from '../core/math.js';
import { world, depthM } from './world.js';
import { viewHW, viewHH, viewArea } from '../systems/view.js';

const ROCK_MAX = 4;
const CAVE_MAX = 2;
const WRECK_MAX = 1;

export function rockTarget() { return clamp(Math.round(viewArea() / 260000), 2, ROCK_MAX); }
export function caveTarget() { return clamp(Math.round(viewArea() / 900000), 0, CAVE_MAX); }
export function wreckTarget() {
  // 沉船是稀有地标，越深越容易遇到
  if (depthM() < 70) return 0;
  return Math.random() < 0.35 ? WRECK_MAX : 0;
}

function offscreenFar(x, y, mul = 2.2) {
  return Math.abs(x - world.cam.x) > viewHW() * mul
      || Math.abs(y - world.cam.y) > viewHH() * mul;
}

/** 远离玩家和已有地形的位置。 */
function pickSpot(minGap) {
  const hw = viewHW(), hh = viewHH();
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = world.cam.x + rand(-hw * 1.25, hw * 1.25);
    const y = clamp(world.cam.y + rand(-hh * 1.15, hh * 1.15), 200, 30000);
    const dp = Math.hypot(x - world.player.x, y - world.player.y);
    if (dp < Math.max(minGap, world.player.r * 8)) continue;
    let clash = false;
    for (const o of world.terrain) {
      if (Math.hypot(x - o.x, y - o.y) < (o.r + minGap) * 0.72) { clash = true; break; }
    }
    if (!clash) return { x, y };
  }
  return null;
}

/** 用 AABB 缓存包住 parts，碰撞前先做廉价早退。 */
function finalize(o) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of o.parts) {
    if (c.x - c.r < minX) minX = c.x - c.r;
    if (c.y - c.r < minY) minY = c.y - c.r;
    if (c.x + c.r > maxX) maxX = c.x + c.r;
    if (c.y + c.r > maxY) maxY = c.y + c.r;
  }
  o.minX = minX; o.minY = minY; o.maxX = maxX; o.maxY = maxY;
  return o;
}

export function makeRock(init) {
  const spot = init
    ? { x: world.cam.x + rand(-viewHW(), viewHW()), y: clamp(world.cam.y + rand(-viewHH(), viewHH()), 220, 30000) }
    : pickSpot(200);
  if (!spot) return null;

  const r = rand(52, 118);
  const parts = [{ x: spot.x, y: spot.y + r * 0.18, r: r * 0.78 }];
  const lumps = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < lumps; i++) {
    const a = rand(TAU);
    const d = rand(0, r * 0.55);
    parts.push({
      x: spot.x + Math.cos(a) * d,
      y: spot.y + Math.sin(a) * d * 0.6 + r * 0.1,
      r: rand(r * 0.42, r * 0.72),
    });
  }

  return finalize({
    kind: 'rock',
    x: spot.x, y: spot.y, r,
    parts,
    seed: rand(100),
    hue: rand(196, 212),
    lit: rand(17, 25),
    // 石头上附着的珊瑚/海绵
    coral: Array.from({ length: 2 + ((Math.random() * 3) | 0) }, () => ({
      ox: rand(-r * 0.62, r * 0.62),
      oy: rand(-r * 0.72, -r * 0.15),
      size: rand(9, 22),
      hue: rand(300, 372) % 360,
      kind: Math.random() < 0.5 ? 'fan' : 'tube',
      ph: rand(TAU),
    })),
  });
}

export function makeCave(init) {
  const spot = init
    ? { x: world.cam.x + rand(-viewHW() * 0.75, viewHW() * 0.75), y: clamp(world.cam.y + rand(-viewHH() * 0.65, viewHH() * 0.65), 260, 30000) }
    : pickSpot(320);
  if (!spot) return null;

  // 两块巨石夹出一道竖直窄缝，缝宽固定：
  // 玩家(直径~41)钻得进去，大猎手(直径 80+)进不来 —— 小体型时的保命点。
  const gap = 76;
  const cr = rand(52, 68);          // 巨石主圆半径
  const parts = [];

  for (const side of [-1, 1]) {
    const innerX = spot.x + side * (gap / 2 + cr);
    parts.push({ x: innerX, y: spot.y, r: cr });
    parts.push({ x: innerX + side * cr * 0.62, y: spot.y - cr * 0.52, r: cr * 0.78 });
    parts.push({ x: innerX + side * cr * 0.55, y: spot.y + cr * 0.6, r: cr * 0.7 });
  }

  return finalize({
    kind: 'cave',
    x: spot.x, y: spot.y, r: cr * 2.1,
    parts,
    gap,
    outerR: cr * 2,
    seed: rand(100),
    hue: rand(200, 214),
    lit: rand(15, 21),
    coral: Array.from({ length: 3 + ((Math.random() * 3) | 0) }, () => ({
      ox: rand(-cr * 1.9, cr * 1.9),
      oy: rand(-cr * 1.1, -cr * 0.25),
      size: rand(10, 22),
      hue: rand(300, 372) % 360,
      kind: Math.random() < 0.5 ? 'fan' : 'tube',
      ph: rand(TAU),
    })),
  });
}

export function makeWreck(init) {
  const spot = init
    ? { x: world.cam.x + rand(-viewHW() * 0.7, viewHW() * 0.7), y: clamp(world.cam.y + rand(-viewHH() * 0.5, viewHH() * 0.5), 300, 30000) }
    : pickSpot(380);
  if (!spot) return null;

  const len = rand(190, 290);
  const hullR = len * 0.16;
  const tilt = rand(-0.5, 0.5);
  const parts = [];
  // 船体沿一条倾斜的轴线摆一串圆
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const t = (i / (segs - 1) - 0.5) * len * 0.78;
    parts.push({
      x: spot.x + Math.cos(tilt) * t,
      y: spot.y + Math.sin(tilt) * t,
      r: hullR * (1 - Math.abs(i / (segs - 1) - 0.5) * 0.5),
    });
  }

  return finalize({
    kind: 'wreck',
    x: spot.x, y: spot.y, r: len * 0.5,
    parts, len, tilt, hullR,
    seed: rand(100),
    hue: rand(30, 44),
    lit: rand(15, 21),
    coral: Array.from({ length: 4 + ((Math.random() * 4) | 0) }, () => ({
      ox: rand(-len * 0.4, len * 0.4),
      oy: rand(-hullR * 0.9, hullR * 0.2),
      size: rand(8, 18),
      hue: rand(300, 372) % 360,
      kind: Math.random() < 0.5 ? 'fan' : 'tube',
      ph: rand(TAU),
    })),
  });
}

/* ---------------- 碰撞 ---------------- */

const OUT = { x: 0, y: 0 };

/**
 * 把一个半径 pr 的圆推出所有地形。
 * 命中返回 {x,y}（复用同一个对象，调用方要立刻取值），未命中返回 null。
 */
export function collideTerrain(px, py, pr) {
  let hit = false;
  OUT.x = px; OUT.y = py;

  // 多轮迭代：两块石头夹出的凹角需要几轮才能收敛。
  // 只做 2 轮时会被判成"一直碰撞"，法向速度被反复清零，玩家就冻住了。
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (const o of world.terrain) {
      if (OUT.x < o.minX - pr || OUT.x > o.maxX + pr) continue;
      if (OUT.y < o.minY - pr || OUT.y > o.maxY + pr) continue;

      for (const c of o.parts) {
        const dx = OUT.x - c.x, dy = OUT.y - c.y;
        const rr = c.r + pr;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;

        // 正好落在圆心上时方向是退化的，随便挑一个方向推出去，
        // 否则会被永久卡在石头中心。
        if (d2 < 1e-6) {
          OUT.y -= rr;
          moved = true;
          hit = true;
          continue;
        }

        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        OUT.x += dx * push;
        OUT.y += dy * push;
        moved = true;
        hit = true;
      }
    }
    if (!moved) break;
  }

  return hit ? OUT : null;
}

/**
 * 让一个带速度的物体沿地形表面滑动。
 * 关键：只消掉"朝墙里"的法向速度分量，保留切向分量。
 * 之前直接 vx*=0.35, vy*=0.35 把切向速度也杀了，结果顶着石头干推、20 秒挪不动。
 */
export function slideAgainstTerrain(obj, radius) {
  const hit = collideTerrain(obj.x, obj.y, radius);
  if (!hit) return false;

  const cx = hit.x - obj.x;
  const cy = hit.y - obj.y;
  obj.x = hit.x;
  obj.y = hit.y;

  const len = Math.hypot(cx, cy);
  if (len > 1e-4) {
    const nx = cx / len, ny = cy / len;
    const vn = obj.vx * nx + obj.vy * ny;
    if (vn < 0) { obj.vx -= vn * nx; obj.vy -= vn * ny; }
  }
  return true;
}

/* ---------------- 增删 ---------------- */

export function updateTerrain() {
  const { terrain } = world;
  for (let i = terrain.length - 1; i >= 0; i--) {
    if (offscreenFar(terrain[i].x, terrain[i].y)) terrain.splice(i, 1);
  }

  const rocks = terrain.filter(o => o.kind === 'rock').length;
  const caves = terrain.filter(o => o.kind === 'cave').length;
  const wrecks = terrain.filter(o => o.kind === 'wreck').length;

  if (rocks < rockTarget()) {
    const o = clampBelowSurface(makeRock(terrain.length === 0));
    if (o) terrain.push(o);
  }
  if (caves < caveTarget()) {
    const o = clampBelowSurface(makeCave(false));
    if (o) terrain.push(o);
  }
  if (wrecks < wreckTarget()) {
    const o = clampBelowSurface(makeWreck(false));
    if (o) terrain.push(o);
  }
}

const SURFACE_MARGIN = 185;   // 地形顶部至少要低于水面这么多

/** 若地形顶部侵入水面附近，整体往下挪。否则玩家会被"水面硬边界 + 石头"夹死。 */
function clampBelowSurface(o) {
  if (!o) return o;
  const shift = SURFACE_MARGIN - o.minY;
  if (shift > 0) {
    o.y += shift;
    for (const c of o.parts) c.y += shift;
    o.minY += shift;
    o.maxY += shift;
  }
  return o;
}

export function resetTerrain() {
  world.terrain.length = 0;
  const clear = o => o && Math.hypot(o.x - world.player.x, o.y - world.player.y) > world.player.r * 9;
  for (let i = 0; i < rockTarget(); i++) {
    const o = clampBelowSurface(makeRock(true));
    if (clear(o)) world.terrain.push(o);
  }
  for (let i = 0; i < caveTarget(); i++) {
    const o = clampBelowSurface(makeCave(true));
    if (clear(o)) world.terrain.push(o);
  }
}
