// 地形渲染：有限潜点。
//
// 每个岩体都是"一串圆"。把它们画进同一条 path、一次 fill，
// 非零环绕规则下自然得到融合的轮廓（扇贝状边缘，且与碰撞完全一致）。
// fill 之后当前路径还在，直接 clip 就能把贴图裁在岩体内部，省一次建路径。

import { TAU, clamp, hsl, hash } from '../core/math.js';
import { ctx, W, H } from '../core/viewport.js';
import { world } from '../world/world.js';

const VIS = [];

/** 一组圆在某 x 处的上下边界（用于贴附着物）。 */
function envelopeAt(o, x) {
  let top = Infinity, bot = -Infinity;
  for (const c of o.parts) {
    const dx = x - c.x;
    if (dx <= -c.r || dx >= c.r) continue;
    const dy = Math.sqrt(c.r * c.r - dx * dx);
    if (c.y - dy < top) top = c.y - dy;
    if (c.y + dy > bot) bot = c.y + dy;
  }
  return top === Infinity ? null : { top, bot };
}

function shelfTopAt(o, x) {
  const env = envelopeAt(o, x);
  return env ? env.top : o.y;
}

/**
 * 岩石的深度偏色：越深越冷、越暗。
 * 用岩石自己的世界高度算，而不是玩家深度——玩家在浅处也能看到下方的深色岩层。
 */
function rockTint(o) {
  const d = clamp((o.y / 20 - 30) / 260, 0, 1);
  return {
    hue: o.hue + d * 12,
    sat: Math.max(9, 22 - d * 6),
    // 深水里要保证岩石比水"亮一点点"，否则岩体和水融成一片，
    // 上面的珊瑚看起来就像浮在空中。
    lit: Math.max(20, o.lit - d * 4),
  };
}

/** 附着物的深度压暗系数：越深越暗、越灰，避免在深水里像霓虹灯一样跳出来。 */
function coralDim(o) {
  return clamp((o.y / 20 - 50) / 240, 0, 1) * 0.42;
}

/* ---------------- 单株附着物 ---------------- */

function coralItem(kind, size, hue, ph, t, dim = 0) {
  const L = v => Math.max(8, v - v * dim);
  const S = v => Math.max(14, v - v * dim * 0.5);

  if (kind === 'fan') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-size * 0.9, -size * 0.7, -size * 0.35, -size * 1.15);
    ctx.quadraticCurveTo(0, -size * 1.3, size * 0.35, -size * 1.15);
    ctx.quadraticCurveTo(size * 0.9, -size * 0.7, 0, 0);
    ctx.closePath();
    ctx.fillStyle = hsl(hue, S(62), L(58), 0.72);
    ctx.fill();
    ctx.strokeStyle = hsl(hue, S(70), L(76), 0.5);
    ctx.lineWidth = Math.max(0.8, size * 0.05);
    ctx.stroke();
    return;
  }

  if (kind === 'tube') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * size * 0.46;
      const h = size * (0.95 + 0.4 * Math.sin(i * 2.1 + ph));
      const w = size * 0.17;
      ctx.moveTo(ox - w * 1.15, 0);
      ctx.quadraticCurveTo(ox - w * 0.72, -h * 0.6, ox - w * 0.62, -h);
      ctx.quadraticCurveTo(ox, -h - w * 0.7, ox + w * 0.62, -h);
      ctx.quadraticCurveTo(ox + w * 0.72, -h * 0.6, ox + w * 1.15, 0);
      ctx.closePath();
    }
    ctx.fillStyle = hsl(hue, S(60), L(62), 0.7);
    ctx.fill();
    ctx.fillStyle = hsl(hue, S(78), L(82), 0.55);
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * size * 0.46;
      const h = size * (0.95 + 0.4 * Math.sin(i * 2.1 + ph));
      ctx.beginPath();
      ctx.ellipse(ox, -h - size * 0.02, size * 0.13, size * 0.055, 0, 0, TAU);
      ctx.fill();
    }
    return;
  }

  if (kind === 'anemone') {
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const len = size * (0.8 + 0.25 * Math.sin(i * 2.3 + ph));
      const tipSway = Math.sin(t * 1.6 + ph + i) * size * 0.18;
      ctx.moveTo(Math.cos(a) * size * 0.16, -size * 0.14);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.6, -len * 0.7, Math.cos(a) * len * 0.5 + tipSway, -len);
    }
    ctx.strokeStyle = hsl(hue, S(72), L(64), 0.8);
    ctx.lineWidth = Math.max(1, size * 0.13);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.44, size * 0.19, 0, 0, TAU);
    ctx.fillStyle = hsl(hue, S(64), L(44), 0.9);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -size * 0.16, size * 0.22, 0, TAU);
    ctx.fillStyle = hsl(hue, S(80), L(74), 0.55);
    ctx.fill();
    return;
  }

  if (kind === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const rr = i % 2 === 0 ? size : size * 0.4;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * 0.55;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = hsl(hue, S(72), L(58), 0.85);
    ctx.fill();
    ctx.strokeStyle = hsl(hue, S(60), L(40), 0.5);
    ctx.lineWidth = Math.max(0.6, size * 0.05);
    ctx.stroke();
    return;
  }

  // 海胆
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + ph;
    ctx.moveTo(Math.cos(a) * size * 0.3, Math.sin(a) * size * 0.3);
    ctx.lineTo(Math.cos(a) * size * 0.95, Math.sin(a) * size * 0.95);
  }
  ctx.strokeStyle = hsl(hue, S(38), L(26), 0.85);
  ctx.lineWidth = Math.max(0.7, size * 0.09);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.34, 0, TAU);
  ctx.fillStyle = hsl(hue, S(45), L(22), 0.92);
  ctx.fill();
}

/* ---------------- 岩体 ---------------- */

let visL = 0, visR = 0, visT = 0, visB = 0;

function collectVisible(o) {
  VIS.length = 0;
  for (const c of o.parts) {
    if (c.x + c.r < visL || c.x - c.r > visR) continue;
    if (c.y + c.r < visT || c.y - c.r > visB) continue;
    VIS.push(c);
  }
  return VIS.length;
}

function addArc(c) {
  ctx.moveTo(c.x + c.r, c.y);
  ctx.arc(c.x, c.y, c.r, 0, TAU);
}

function drawMass(o) {
  if (collectVisible(o) === 0) return;

  const tint = rockTint(o);

  // 岩体
  ctx.beginPath();
  for (const c of VIS) addArc(c);

  if (o.shape === 'wall') {
    // 岩壁：光从开阔水域那一侧照过来
    const g = ctx.createLinearGradient(o.x - (o.maxX - o.minX) / 2, 0, o.x + (o.maxX - o.minX) / 2, 0);
    g.addColorStop(0, hsl(tint.hue, tint.sat + 5, tint.lit + 7));
    g.addColorStop(0.5, hsl(tint.hue, tint.sat + 3, tint.lit));
    g.addColorStop(1, hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 8)));
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, o.y - (o.maxY - o.minY) / 2, 0, o.y + (o.maxY - o.minY) / 2);
    g.addColorStop(0, hsl(tint.hue, tint.sat + 6, tint.lit + 8));
    g.addColorStop(0.4, hsl(tint.hue, tint.sat + 4, tint.lit));
    g.addColorStop(1, hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 8)));
    ctx.fillStyle = g;
  }
  ctx.fill();

  // 贴图：当前路径还在，直接裁剪
  ctx.save();
  ctx.clip();

  const x0 = Math.max(o.minX, visL);
  const x1 = Math.min(o.maxX, visR);
  const y0 = Math.max(o.minY, visT);
  const y1 = Math.min(o.maxY, visB);

  // 沉积层理：世界坐标等距，镜头移动不会滑动
  const bandH = (y1 - y0) / 5;
  if (bandH > 6) {
    ctx.beginPath();
    for (let k = 1; k <= 4; k++) {
      const yy = y0 + bandH * k;
      ctx.moveTo(x0, yy);
      for (let x = x0 + 40; x <= x1; x += 40) {
        ctx.lineTo(x, yy + Math.sin(x * 0.013 + o.seed + k * 1.7) * 2.2);
      }
    }
    ctx.strokeStyle = hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 7), 0.2);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  // 颗粒：世界坐标二维网格
  const PIT = 48;
  ctx.beginPath();
  for (let ix = Math.floor(x0 / PIT); ix <= Math.ceil(x1 / PIT); ix++) {
    for (let iy = Math.floor(y0 / PIT); iy <= Math.ceil(y1 / PIT); iy++) {
      const hs = o.seed + ix * 1.73 + iy * 13.11;
      if (hash(hs) > 0.42) continue;
      const px = ix * PIT + hash(hs + 1.1) * (PIT - 8) + 4;
      const py = iy * PIT + hash(hs + 2.3) * (PIT - 8) + 4;
      const pr = 1 + hash(hs + 3.7) * 2.6;
      ctx.moveTo(px + pr, py);
      ctx.arc(px, py, pr, 0, TAU);
    }
  }
  ctx.fillStyle = hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 10), 0.2);
  ctx.fill();

  // 横向岩体的底面压暗，给一点厚度感
  if (o.shape !== 'wall') {
    const sh = ctx.createLinearGradient(0, o.y, 0, y1);
    sh.addColorStop(0, hsl(tint.hue, tint.sat, tint.lit - 4, 0));
    sh.addColorStop(1, hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 12), 0.55));
    ctx.fillStyle = sh;
    ctx.fillRect(x0, o.y, x1 - x0, Math.max(0, y1 - o.y));
  }

  ctx.restore();
}

/* ---------------- 附着物 ---------------- */

function drawShelfKelp(o) {
  if (!o.kelp || o.kelp.length === 0) return;
  const t = world.time;

  ctx.beginPath();
  for (const k of o.kelp) {
    const baseX = k.ox;
    if (baseX < visL || baseX > visR) continue;
    const baseY = shelfTopAt(o, baseX) + 3;
    const sway = Math.sin(t * 0.62 + k.ph) * (18 + k.h * 0.11);
    const topX = baseX + sway;
    const topYk = baseY - k.h;
    const w = k.w;
    const halfW = w * 0.46;
    const tipW = w * 0.2;

    ctx.moveTo(baseX - halfW, baseY + 4);
    ctx.bezierCurveTo(
      baseX - halfW * 1.06 + sway * 0.3, baseY - k.h * 0.34,
      topX - tipW + sway * 0.78, baseY - k.h * 0.7,
      topX - tipW, topYk,
    );
    ctx.quadraticCurveTo(topX, topYk - w * 0.5, topX + tipW, topYk);
    ctx.bezierCurveTo(
      topX + tipW + sway * 0.78, baseY - k.h * 0.7,
      baseX + halfW * 1.06 + sway * 0.3, baseY - k.h * 0.34,
      baseX + halfW, baseY + 4,
    );
    ctx.closePath();
  }
  ctx.fillStyle = hsl(154, 44, 20, 0.86);
  ctx.fill();
}

function drawCoral(o) {
  const t = world.time;
  if (!o.coral || o.coral.length === 0) return;
  const dim = coralDim(o);

  for (const c of o.coral) {
    const x = c.ox;
    if (x < visL || x > visR) continue;

    const env = envelopeAt(o, x);
    const y = (env ? env.top : o.y) + (c.oy || 0);
    const sway = Math.sin(t * 0.9 + c.ph) * c.size * 0.12;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway * 0.1);
    coralItem(c.kind, c.size, c.hue, c.ph, t, dim);
    ctx.restore();
  }
}

/**
 * 珊瑚礁块：一块深色瘤状基座 + 2~4 株较大的珊瑚。
 * 散点珊瑚再多也是"点"，成丛才有体积。
 */
function drawClumps(o) {
  if (!o.clumps || o.clumps.length === 0) return;
  const t = world.time;
  const dim = coralDim(o);
  const tint = rockTint(o);

  for (const c of o.clumps) {
    const x = c.ox;
    if (x < visL || x > visR) continue;

    const env = envelopeAt(o, x);
    const y = env ? env.top : o.y;

    // 基座：一块比岩体略暗的瘤状凸起
    ctx.beginPath();
    ctx.ellipse(x, y + c.size * 0.06, c.size * 0.96, c.size * 0.34, 0, 0, TAU);
    ctx.fillStyle = hsl(tint.hue - 4, tint.sat, Math.max(6, tint.lit - 6), 0.95);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - c.size * 0.1, y - c.size * 0.04, c.size * 0.62, c.size * 0.22, 0, 0, TAU);
    ctx.fillStyle = hsl(tint.hue - 2, tint.sat, Math.max(6, tint.lit - 2), 0.7);
    ctx.fill();

    for (let i = 0; i < c.members; i++) {
      const a = ((i + 0.5) / c.members) * Math.PI * 2 + c.ph;
      const mx = x + Math.cos(a) * c.size * 0.3;
      const my = y + Math.sin(a) * c.size * 0.1;
      const sz = c.size * (0.5 + 0.5 * ((i * 37 % 10) / 10));
      const sway = Math.sin(t * 0.8 + c.ph + i) * 0.08;

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(sway);
      coralItem(c.kind, sz, (c.hue + i * 12) % 360, c.ph + i, t, dim);
      ctx.restore();
    }
  }
}

/* ---------------- 入口 ---------------- */

export function drawTerrain() {
  visL = world.cam.x - W / (2 * world.cam.z) * 1.1;
  visR = world.cam.x + W / (2 * world.cam.z) * 1.1;
  visT = world.cam.y - H / (2 * world.cam.z) * 1.1;
  visB = world.cam.y + H / (2 * world.cam.z) * 1.1;

  // 先画岩体，再统一画附着物（附着物不会被后面的岩体压住）
  for (const o of world.terrain) {
    if (o.maxX < visL || o.minX > visR || o.maxY < visT || o.minY > visB) continue;
    drawMass(o);
  }
  for (const o of world.terrain) {
    if (o.maxX < visL || o.minX > visR || o.maxY < visT || o.minY > visB) continue;
    drawShelfKelp(o);
    drawClumps(o);
    drawCoral(o);
  }
}
