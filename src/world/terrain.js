// 地形：海底岩台（seabed shelves）。
//
// 石头不会凭空悬在水里。地形是一层层横向的岩台，玩家沿着它们往下潜：
//   - 岩台横跨一片区域，中间留缺口，玩家从缺口或岩台两端下潜
//   - 石头、珊瑚、裂缝、沉船都长在岩台顶面上
//   - 个别层是"空窗"（整层没有岩台），留出自由下潜的空间
//
// 岩台按索引确定性生成（hash(n)），所以在世界坐标里是稳定的：
// 游回去还是同一块岩台，不会因为回收/重生而跳变。
//
// 碰撞仍然是圆 vs 圆：每条岩台的实心段用一排圆填满。

import { TAU, clamp, hash, lerp } from '../core/math.js';
import { world } from './world.js';
import { viewHW, viewHH } from '../systems/view.js';

const SHELF_BASE = 330;        // 第一条岩台的深度
const SHELF_STEP = 780;        // 岩台之间的竖向间距
const SHELF_SPAN = 5200;       // 岩台横向跨度（超出两端就是开阔水，可以绕过去）
const SHELF_THICK = 180;       // 基准厚度（太薄会变成上下都有边的漂浮板）
const CREVICE_GAP = 76;        // 裂缝宽度：小的能钻，大的进不来

const shelfCache = new Map();

/* ---------------- 生成 ---------------- */

function mergeIntervals(list) {
  const out = [];
  for (const [a, b] of list) {
    if (b - a < 8) continue;
    if (out.length && a <= out[out.length - 1][1] + 4) {
      out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    } else {
      out.push([a, b]);
    }
  }
  return out;
}

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

function coralAt(seed, spread, baseY) {
  const n = 2 + Math.floor(hash(seed + 3) * 3);
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      ox: (hash(seed + 10 + i) - 0.5) * spread,
      oy: baseY + (hash(seed + 20 + i) - 0.5) * 14,
      size: 7 + hash(seed + 30 + i) * 9,
      hue: (hash(seed + 40 + i) * 80 + 285) % 360,
      kind: hash(seed + 50 + i) < 0.5 ? 'fan' : 'tube',
      ph: hash(seed + 60 + i) * TAU,
    });
  }
  return list;
}

/**
 * 第 n 条岩台。返回 null 表示这一层是空窗（没有任何地形）。
 * 结果按 n 缓存，保证同一层每次拿到的是同一份几何。
 */
export function shelfAt(n) {
  if (shelfCache.has(n)) return shelfCache.get(n);

  const s = n * 7.13 + 2.71;
  const y = SHELF_BASE + n * SHELF_STEP + (hash(s) - 0.5) * 150;

  // 空窗：整层没有岩台，让下潜节奏有变化
  if (hash(s + 0.5) < 0.17) {
    shelfCache.set(n, null);
    return null;
  }

  const thick = SHELF_THICK * (0.8 + hash(s + 1) * 0.45);
  const cr = thick * 0.5;

  // 缺口：2~4 个
  const gapCount = 2 + Math.floor(hash(s + 2) * 3);
  const gaps = [];
  // 缺口按槽位均分（每个槽一位 + 抖动），避免全挤在一侧导致下潜要横穿整屏
  const slotWidth = (SHELF_SPAN * 0.88) / gapCount;
  for (let k = 0; k < gapCount; k++) {
    const slot = (k + 0.5) / gapCount - 0.5;               // -0.5 .. 0.5
    const jitter = (hash(s + 10 + k) - 0.5) * slotWidth * 0.45;
    gaps.push({
      x: slot * SHELF_SPAN * 0.88 + jitter,
      w: 205 + hash(s + 20 + k) * 105,
    });
  }
  gaps.sort((a, b) => a.x - b.x);

  // 缺口之间的实心段
  const solids = [];
  let cursor = -SHELF_SPAN / 2;
  for (const g of gaps) {
    const left = g.x - g.w / 2;
    if (left > cursor) solids.push([cursor, left]);
    cursor = Math.max(cursor, g.x + g.w / 2);
  }
  if (cursor < SHELF_SPAN / 2) solids.push([cursor, SHELF_SPAN / 2]);

  const merged = mergeIntervals(solids);

  const parts = [];
  for (const [a, b] of merged) {
    const span = b - a;
    const count = Math.max(1, Math.ceil(span / (cr * 1.05)));
    for (let i = 0; i <= count; i++) {
      parts.push({ x: a + (span * i) / count, y, r: cr });
    }
  }

  // 悬突：从岩体上凸出来的岩块（上下都有）。
  // 它们也进 parts，所以是实心的——视觉轮廓（并集外形）和碰撞天然一致。
  // 位置离段两端留出距离，不会堵住缺口。
  for (const [a, b] of merged) {
    const n = 1 + Math.floor(hash(s + a * 0.019) * 3);
    for (let i = 0; i < n; i++) {
      const ks = s + a * 0.023 + i * 7.9;
      const kr = cr * (0.45 + hash(ks) * 0.42);
      if (b - a < kr * 3.2) continue;
      const kx = lerp(a + kr * 1.6, b - kr * 1.6, hash(ks + 1));
      const up = hash(ks + 2) < 0.58;
      parts.push({
        x: kx,
        y: y + (up ? -cr * 0.52 : cr * 0.52),
        r: kr,
      });
    }
  }

  const shelf = finalize({
    kind: 'shelf',
    n, y, thick, cr,
    x0: -SHELF_SPAN / 2, x1: SHELF_SPAN / 2,
    solids: merged,
    gaps,
    parts,
    seed: s,
    hue: 202 + hash(s + 4) * 10,
    lit: 25 + hash(s + 5) * 8,
    coral: [],
  });

  // 顶面的珊瑚。坐标统一用"相对物体"的形式，
  // 所以这里 baseY 传相对值 (-cr + 4)，之后再整体平移到该段中心。
  shelf.x = 0;
  shelf.y = y;
  for (const [a, b] of merged) {
    if (b - a < 160) continue;
    const spread = Math.min(b - a - 60, 900);
    shelf.coral.push(...coralAt(s + a * 0.01, spread, -cr + 4)
      .map(c => ({ ...c, ox: clamp(c.ox, -spread / 2, spread / 2) + (a + b) / 2 })));
  }

  /* --- 海藻：也长在岩台顶面上，浅水才有 --- */
  const depthOfShelf = y / 20;
  const kelpFade = clamp(1 - (depthOfShelf - 30) / 150, 0, 1);   // 30m 起变稀，180m 消失
  shelf.kelp = [];
  if (kelpFade > 0.05) {
    for (const [a, b] of merged) {
      for (let x = a + 40; x < b - 40; x += 46) {
        const ks = s + x * 0.031;
        if (hash(ks) > 0.82 * kelpFade) continue;
        shelf.kelp.push({
          ox: x,
          h: (160 + hash(ks + 1) * 210) * (0.55 + kelpFade * 0.45),
          w: 15 + hash(ks + 2) * 15,
          ph: hash(ks + 3) * TAU,
        });
      }
    }
  }

  /* --- 石头：坐在岩台顶面上，绝不悬空 --- */
  const boulders = [];
  for (const [a, b] of merged) {
    const width = b - a;
    if (width < 220) continue;
    const count = 1 + Math.floor(hash(s + a * 0.013) * 2);
    for (let i = 0; i < count; i++) {
      const bs = s + a * 0.017 + i * 9.1;
      const r = 46 + hash(bs) * 58;
      const cx = lerp(a + r * 1.1, b - r * 1.1, hash(bs + 1));
      if (b - a < r * 2.6) continue;
      // 圆心嵌进岩台一点，看起来是从海底长出来的
      const by = y - cr - r * 0.32;
      const bparts = [{ x: cx, y: by, r: r * 0.92 }];
      const lump = 2 + Math.floor(hash(bs + 2) * 3);
      for (let k = 0; k < lump; k++) {
        const ang = hash(bs + 3 + k) * TAU;
        const d = hash(bs + 8 + k) * r * 0.5;
        bparts.push({
          x: cx + Math.cos(ang) * d,
          y: by + Math.sin(ang) * d * 0.6 - r * 0.15,
          r: r * (0.4 + hash(bs + 14 + k) * 0.3),
        });
      }
      boulders.push(finalize({
        kind: 'boulder',
        x: cx, y: by, r,
        parts: bparts,
        seed: bs,
        hue: 200 + hash(bs + 4) * 12,
        lit: 27 + hash(bs + 5) * 9,
        coral: coralAt(bs + 40, r * 1.2, -r * 0.55),
      }));
    }
  }

  /* --- 裂缝：两块石头夹一道缝，小的能钻、大的进不来 --- */
  const creviceSeeds = merged.filter(([a, b]) => b - a > 420);
  if (creviceSeeds.length && hash(s + 6) < 0.55) {
    const [a, b] = creviceSeeds[Math.floor(hash(s + 7) * creviceSeeds.length)];
    const cxc = lerp(a + 260, b - 260, hash(s + 8));
    const cr2 = 54;
    const cparts = [];
    for (const side of [-1, 1]) {
      const innerX = cxc + side * (CREVICE_GAP / 2 + cr2);
      cparts.push({ x: innerX, y: y - cr2 * 0.9, r: cr2 });
      cparts.push({ x: innerX + side * cr2 * 0.62, y: y - cr2 * 1.5, r: cr2 * 0.78 });
      cparts.push({ x: innerX + side * cr2 * 0.5, y: y - cr2 * 0.25, r: cr2 * 0.72 });
    }
    boulders.push(finalize({
      kind: 'crevice',
      x: cxc, y: y - cr2 * 0.9, r: cr2 * 1.9,
      parts: cparts,
      gap: CREVICE_GAP,
      seed: s + 9,
      hue: 201 + hash(s + 11) * 10,
      lit: 26 + hash(s + 12) * 7,
      coral: coralAt(s + 60, cr2 * 3.4, -cr2 * 1.5),
    }));
  }

  /* --- 沉船：稀有的海底地标，躺在岩台上 --- */
  let wreck = null;
  if (y > 1500 && hash(s + 13) < 0.3 && merged.length) {
    const [a, b] = merged[0];
    const len = 210 + hash(s + 14) * 90;
    if (b - a > len * 1.3) {
      const wx = (a + b) / 2;
      const tilt = (hash(s + 15) - 0.5) * 0.5;
      const hullR = len * 0.15;
      const wy = y - cr - hullR * 0.5;
      const wparts = [];
      for (let i = 0; i < 4; i++) {
        const tt = (i / 3 - 0.5) * len * 0.75;
        wparts.push({ x: wx + Math.cos(tilt) * tt, y: wy + Math.sin(tilt) * tt, r: hullR * 0.95 });
      }
      wreck = finalize({
        kind: 'wreck',
        x: wx, y: wy, r: len * 0.5,
        parts: wparts, len, tilt, hullR,
        seed: s + 16,
        hue: 34 + hash(s + 17) * 10,
        lit: 24 + hash(s + 18) * 6,
        coral: coralAt(s + 70, len * 0.7, -hullR * 0.4),
      });
    }
  }

  const result = { shelf, boulders, wreck };
  shelfCache.set(n, result);
  return result;
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

  for (let pass = 0; pass < 9; pass++) {
    let moved = false;
    for (const o of world.terrain) {
      if (OUT.x < o.minX - pr || OUT.x > o.maxX + pr) continue;
      if (OUT.y < o.minY - pr || OUT.y > o.maxY + pr) continue;

      for (const c of o.parts) {
        const dx = OUT.x - c.x, dy = OUT.y - c.y;
        const rr = c.r + pr;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;

        if (d2 < 1e-6) {
          OUT.y -= rr;
          moved = true; hit = true;
          continue;
        }

        const d = Math.sqrt(d2);
        // +0.02：把物体放到表面稍微外侧。否则刚好贴在表面上时，
        // 浮点误差会让下一次检测又判成"仍然碰撞"。
        const push = (rr - d + 0.02) / d;
        OUT.x += dx * push;
        OUT.y += dy * push;
        moved = true; hit = true;
      }
    }
    if (!moved) break;
  }

  return hit ? OUT : null;
}

/**
 * 让一个带速度的物体沿地形表面滑动。
 * 只消掉"朝墙里"的法向速度分量，保留切向分量。
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

/* ---------------- 视线遮挡 ---------------- */

const LOS_CAND = [];

/**
 * 两点之间的连线是否被地形挡住。
 * 用来做"躲到石头后面，猎手就看不见你"。
 * 先按线段 AABB 筛掉不相交的地形，再沿线段采样几个点做圆内测试。
 */
export function terrainBlocksLine(x1, y1, x2, y2, samples = 7) {
  LOS_CAND.length = 0;
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

  for (const o of world.terrain) {
    if (o.maxX < minX || o.minX > maxX || o.maxY < minY || o.minY > maxY) continue;
    LOS_CAND.push(o);
  }
  if (LOS_CAND.length === 0) return false;

  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (const o of LOS_CAND) {
      for (const c of o.parts) {
        const dx = px - c.x, dy = py - c.y;
        if (dx * dx + dy * dy < c.r * c.r) return true;
      }
    }
  }
  return false;
}

/* ---------------- 按视野加载/卸载 ---------------- */

const loaded = new Set();

export function updateTerrain() {
  const { cam, terrain } = world;
  const top = cam.y - viewHH() * 1.5;
  const bottom = cam.y + viewHH() * 1.7;

  const first = Math.floor((top - SHELF_BASE) / SHELF_STEP) - 1;
  const last = Math.ceil((bottom - SHELF_BASE) / SHELF_STEP) + 1;

  const want = new Set();
  for (let n = first; n <= last; n++) want.add(n);

  // 卸载不再需要的层
  for (const o of terrain) {
    if (o.shelfIndex !== undefined && !want.has(o.shelfIndex)) {
      terrain.splice(terrain.indexOf(o), 1);
    }
  }

  // 载入缺失的层（确定性生成 → 不会跳变）
  for (const n of want) {
    if (loaded.has(n)) continue;
    loaded.add(n);
    const data = shelfAt(n);
    if (!data) continue;
    data.shelf.shelfIndex = n;
    terrain.push(data.shelf);
    for (const b of data.boulders) { b.shelfIndex = n; terrain.push(b); }
    if (data.wreck) { data.wreck.shelfIndex = n; terrain.push(data.wreck); }
  }

  for (const n of [...loaded]) {
    if (!want.has(n)) loaded.delete(n);
  }
}

export function resetTerrain() {
  world.terrain.length = 0;
  loaded.clear();
  updateTerrain();
}

export { SHELF_STEP, SHELF_BASE, CREVICE_GAP };
