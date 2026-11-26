// 地形：有限潜点（bounded dive site）。
//
// 一张固定尺寸的潜点：左右岩壁 + 海底 + 从岩壁和海底长出来的岩台与石柱。
// 所有岩体都"长"在壁或底上——这正是"石头不会悬在水里"的结构性保证，
// 不再需要"每层留缺口"之类的规则去勉强合理化。
//
// 所有岩体统一表示成"一串圆"（union of circles）：
//   - 碰撞：圆 vs 圆
//   - 渲染：把同一批圆画进一条 path、一次 fill，得到天然融合的轮廓
// 于是形状天然带扇贝状起伏，而且"看得见的形状 == 撞得到的形状"。

import { TAU, clamp, hash, lerp } from '../core/math.js';
import { world } from './world.js';

/** 潜点边界。整个地图就是这一块，玩家不能离开。 */
export const SITE = {
  left: -600,
  right: 600,
  top: 120,        // 水面下（玩家活动上界）
  bottom: 3400,    // 海底（世界 y，约 170m）
};

const WALL_R = 150;
const FLOOR_R = 130;

/* ---------------- 取形 ---------------- */

/** 岩壁内表面的横向位置，随深度起伏 → 悬突与凹陷。 */
function wallFace(y, side) {
  const n = Math.sin(y * 0.0017) * 95
    + Math.sin(y * 0.0049 + 1.9) * 42
    + Math.sin(y * 0.0121 + 3.1) * 15;
  const inward = Math.max(-30, n);
  return side < 0 ? SITE.left + 100 + inward : SITE.right - 100 - inward;
}

/** 海底顶面高度。 */
function floorTop(x) {
  return SITE.bottom - 90
    + Math.sin(x * 0.0021) * 55
    + Math.sin(x * 0.0057 + 2.2) * 26;
}

/** 一组圆在某 x 处的上边界（供附着物定位）。 */
function topAt(parts, x) {
  let top = Infinity;
  for (const c of parts) {
    const dx = x - c.x;
    if (dx <= -c.r || dx >= c.r) continue;
    const dy = Math.sqrt(c.r * c.r - dx * dx);
    if (c.y - dy < top) top = c.y - dy;
  }
  return top === Infinity ? null : top;
}

function makeMass(parts, shape, seed) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of parts) {
    if (c.x - c.r < minX) minX = c.x - c.r;
    if (c.x + c.r > maxX) maxX = c.x + c.r;
    if (c.y - c.r < minY) minY = c.y - c.r;
    if (c.y + c.r > maxY) maxY = c.y + c.r;
  }
  return {
    kind: 'rock',
    shape,
    parts,
    minX, minY, maxX, maxY,
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    seed,
    hue: 202 + hash(seed) * 12,
    lit: 25 + hash(seed + 1) * 8,
    coral: [],
    clumps: [],
    kelp: [],
  };
}

/* ---------------- 生成 ---------------- */

function buildWalls() {
  const out = [];
  for (const side of [-1, 1]) {
    const parts = [];
    for (let y = SITE.top - 500; y <= SITE.bottom + 500; y += WALL_R * 0.62) {
      const face = wallFace(y, side);
      // 圆心退进壁里一个半径，于是内表面正好落在 face 上
      parts.push({ x: face + side * WALL_R, y, r: WALL_R });
      parts.push({ x: face + side * WALL_R * 2.05, y: y + WALL_R * 0.5, r: WALL_R * 0.92 });
    }
    out.push(makeMass(parts, 'wall', side < 0 ? 11 : 23));
  }
  return out;
}

function buildFloor() {
  const parts = [];
  for (let x = SITE.left - 600; x <= SITE.right + 600; x += FLOOR_R * 0.62) {
    const top = floorTop(x);
    parts.push({ x, y: top + FLOOR_R, r: FLOOR_R });
    parts.push({ x: x + FLOOR_R * 0.5, y: top + FLOOR_R * 1.95, r: FLOOR_R * 0.9 });
  }
  return makeMass(parts, 'wide', 37);
}

/** 岩台：从某一侧岩壁横向伸出，长度/厚度/间距都不规则。 */
function buildLedges() {
  const out = [];
  let y = SITE.top + 420;
  let k = 0;
  // 通道宽度：岩壁内表面之间的净空
  const corridor = (SITE.right - 240) - (SITE.left + 240);

  while (y < SITE.bottom - 700) {
    k++;
    const s = 100 + k * 7.31;
    // 竖向间距不规则：240 ~ 620
    y += 240 + hash(s) * 380;

    // 左右交替偏多，但不严格交替
    const side = (k % 2 === 0) === (hash(s + 1) < 0.7) ? -1 : 1;
    const face = wallFace(y, side);
    // 长度上限：留出一半通道，保证最大体型（直径 260）也过得去
    const maxLen = corridor * 0.5;
    const len = Math.min(maxLen, 200 + hash(s + 2) * 360);
    const r = 68 + hash(s + 3) * 52;
    const dir = side < 0 ? 1 : -1;
    const parts = [];

    for (let d = r * 0.5; d <= len; d += r * 0.62) {
      const taper = 1 - 0.5 * (d / len);
      parts.push({
        x: face + dir * d,
        y: y + Math.sin(d * 0.009 + s) * 7,
        r: r * taper,
      });
    }
    if (parts.length >= 2) out.push(makeMass(parts, 'wide', s));
  }
  return out;
}

/** 石柱：从海底竖起来。 */
function buildPillars() {
  const out = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const s = 400 + i * 31.7;
    const x = lerp(SITE.left + 420, SITE.right - 420, hash(s));
    const h = 320 + hash(s + 1) * 520;
    const r = 58 + hash(s + 2) * 42;
    const base = floorTop(x) + r * 0.3;
    const parts = [];

    for (let d = 0; d < h; d += r * 0.62) {
      const taper = 1 - 0.4 * (d / h);
      parts.push({
        x: x + Math.sin(d * 0.007 + s) * 26,
        y: base - d,
        r: r * taper,
      });
    }
    if (parts.length >= 2) out.push(makeMass(parts, 'wide', s + 9));
  }
  return out;
}

/** 海底与岩台上的散石（底部嵌进地面，不悬空）。 */
function buildBoulders() {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const s = 700 + i * 17.3;
    const x = lerp(SITE.left + 260, SITE.right - 260, hash(s));
    const r = 38 + hash(s + 1) * 66;
    const base = floorTop(x);
    const parts = [{ x, y: base - r * 0.3, r }];

    const extra = 1 + Math.floor(hash(s + 2) * 2);
    for (let j = 0; j < extra; j++) {
      parts.push({
        x: x + (hash(s + 3 + j) - 0.5) * r * 1.5,
        y: base - r * 0.25 - hash(s + 6 + j) * r * 0.6,
        r: r * (0.45 + hash(s + 9 + j) * 0.3),
      });
    }
    const m = makeMass(parts, 'wide', s);
    // 螃蟹在石头上半弧爬行，需要单圆信息
    m.crabHost = true;
    m.cx = parts[0].x;
    m.cy = parts[0].y;
    m.cr = parts[0].r;
    out.push(m);
  }
  return out;
}

/* ---------------- 附着物 ---------------- */

const CORAL_KINDS = ['fan', 'tube', 'anemone', 'star', 'urchin'];

function coralAt(seed, count, spread) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const r1 = hash(seed + 10 + i * 1.7);
    list.push({
      ox: (hash(seed + 10 + i * 2.3) - 0.5) * spread,
      oy: (hash(seed + 20 + i * 3.1) - 0.5) * 5,
      size: 7 + hash(seed + 30 + i * 4.9) * 11,
      hue: (hash(seed + 40 + i * 5.3) * 340 + 10) % 360,
      kind: CORAL_KINDS[Math.floor(r1 * CORAL_KINDS.length) % CORAL_KINDS.length],
      ph: hash(seed + 60 + i * 6.1) * TAU,
    });
  }
  return list;
}

/** 在横向岩体的顶面铺附着物。位置按世界坐标，所以镜头移动时不会滑动。 */
function decorate(m) {
  if (m.shape !== 'wide') return;
  const span = m.maxX - m.minX;
  if (span < 80) return;

  // 散点
  const count = clamp(Math.floor(span / 150), 2, 16);
  for (let i = 0; i < count; i++) {
    const cs = m.seed + i * 3.7;
    const ox = m.minX + 20 + hash(cs) * (span - 40);
    if (topAt(m.parts, ox) === null) continue;
    m.coral.push({
      ox,
      oy: (hash(cs + 4) - 0.5) * 5,
      size: 7 + hash(cs + 5) * 11,
      hue: (hash(cs + 6) * 340 + 10) % 360,
      kind: CORAL_KINDS[Math.floor(hash(cs + 7) * CORAL_KINDS.length) % CORAL_KINDS.length],
      ph: hash(cs + 8) * TAU,
    });
  }

  // 珊瑚礁块（成丛）
  const clumps = clamp(Math.floor(span / 340), 0, 6);
  for (let i = 0; i < clumps; i++) {
    const cs = m.seed + 50 + i * 5.7;
    const ox = m.minX + 60 + hash(cs) * Math.max(10, span - 120);
    if (topAt(m.parts, ox) === null) continue;
    m.clumps.push({
      ox,
      size: 19 + hash(cs + 1) * 21,
      hue: (hash(cs + 2) * 340 + 10) % 360,
      kind: hash(cs + 3) < 0.55 ? 'fan' : 'tube',
      members: 2 + Math.floor(hash(cs + 4) * 3),
      ph: hash(cs + 5) * TAU,
    });
  }

  // 海藻：只长在 180m 以上
  const shallow = m.minY < SITE.bottom;
  if (shallow) {
    const fade = clamp(1 - (m.minY / 20 - 30) / 150, 0, 1);
    if (fade > 0.05) {
      for (let x = m.minX + 30; x < m.maxX - 30; x += 70) {
        const ks = m.seed + x * 0.031;
        if (hash(ks) > 0.6 * fade) continue;
        if (topAt(m.parts, x) === null) continue;
        m.kelp.push({
          ox: x,
          h: (150 + hash(ks + 1) * 190) * (0.55 + fade * 0.45),
          w: 15 + hash(ks + 2) * 15,
          ph: hash(ks + 3) * TAU,
        });
      }
    }
  }
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

  // 每轮只解析"穿透最深"的那一个圆，再重新评估。
  // 密集排列的圆（岩壁、石柱）里如果每轮把所有穿透都推一遍，几个推力会互相抵消、
  // 来回震荡；按最深优先逐个解析收敛得多。
  for (let pass = 0; pass < 16; pass++) {
    let best = null;
    let bestPen = 0;
    let bx = 0, by = 0, brr = 0;

    for (const o of world.terrain) {
      if (OUT.x < o.minX - pr || OUT.x > o.maxX + pr) continue;
      if (OUT.y < o.minY - pr || OUT.y > o.maxY + pr) continue;

      for (const c of o.parts) {
        const dx = OUT.x - c.x, dy = OUT.y - c.y;
        const rr = c.r + pr;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;

        const d = Math.sqrt(d2);
        const pen = rr - d;
        if (pen > bestPen) {
          bestPen = pen;
          best = c;
          bx = dx; by = dy; brr = rr;
        }
      }
    }

    if (!best) break;
    hit = true;

    if (bx * bx + by * by < 1e-6) {
      OUT.y -= brr;
      continue;
    }

    const d = Math.sqrt(bx * bx + by * by);
    // +0.02：把物体放到表面稍微外侧。否则刚好贴在表面上时，
    // 浮点误差会让下一次检测又判成"仍然碰撞"。
    const push = (brr - d + 0.02) / d;
    OUT.x += bx * push;
    OUT.y += by * push;
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

/** 某个点是否在岩石内部（给气泡/雪粒做遮挡用）。 */
export function terrainContains(x, y, pad = 0) {
  for (const o of world.terrain) {
    if (x + pad < o.minX || x - pad > o.maxX || y + pad < o.minY || y - pad > o.maxY) continue;
    for (const c of o.parts) {
      const dx = x - c.x, dy = y - c.y;
      const rr = c.r + pad;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
  }
  return false;
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

/* ---------------- 生命周期 ---------------- */

/**
 * 有限地图：整张潜点一次生成，不需要按视野加载/卸载。
 * 保留这个导出是为了不动 main.js 的调用点。
 */
export function updateTerrain() {}

export function resetTerrain() {
  const terrain = world.terrain;
  terrain.length = 0;

  const masses = [
    ...buildWalls(),
    buildFloor(),
    ...buildLedges(),
    ...buildPillars(),
    ...buildBoulders(),
  ];

  for (const m of masses) {
    decorate(m);
    terrain.push(m);
  }
}
