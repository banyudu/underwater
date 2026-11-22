// 地形渲染：海底岩台、礁石、裂缝、沉船，以及附着其上的珊瑚/海绵。
//
// 岩台是横向的岩体，视觉上用一条路径画（顶部带起伏），碰撞用一排圆。
// 礁石/裂缝/沉船由"一串圆"组成，直接把这些圆画进同一条 path、一次 fill，
// 就得到天然融合的轮廓（同向圆弧按非零环绕规则取并集）。

import { TAU, clamp, hsl, hash } from '../core/math.js';
import { ctx } from '../core/viewport.js';
import { world, depthM } from '../world/world.js';

/** 岩台顶面高度：带轻微起伏，避免一条死板的直线。 */
function topY(o, x) {
  return o.y - o.cr
    + Math.sin(x * 0.011 + o.seed) * 4.5
    + Math.sin(x * 0.043 + o.seed * 2.3) * 2.5
    + (hash(x * 0.07 + o.seed) - 0.5) * 6;
}

/** 岩台底面高度。 */
function botY(o, x) {
  return o.y + o.cr * (0.86 + 0.12 * Math.sin(x * 0.017 + o.seed * 1.7))
    + Math.sin(x * 0.031 + o.seed * 0.7) * 6;
}

/** 岩台顶面的海藻：从台面往上长，随水流摆。所有叶带合成一条 path，只 fill 一次。 */
function drawShelfKelp(o) {
  if (!o.kelp || o.kelp.length === 0) return;
  const t = world.time;

  ctx.beginPath();
  for (const k of o.kelp) {
    const baseX = k.ox;
    const baseY = topY(o, baseX) + 3;
    const sway = Math.sin(t * 0.62 + k.ph) * (9 + k.h * 0.05);
    const topX = baseX + sway;
    const topYk = baseY - k.h;
    const w = k.w;

    // 等宽的叶带 + 圆头：之前从宽基部收到尖顶，看起来像三角尖刺
    const halfW = w * 0.46;
    const tipW = w * 0.32;

    ctx.moveTo(baseX - halfW, baseY + 4);
    ctx.bezierCurveTo(
      baseX - halfW * 1.06 + sway * 0.3, baseY - k.h * 0.34,
      topX - tipW + sway * 0.78, baseY - k.h * 0.7,
      topX - tipW, topYk,
    );
    ctx.quadraticCurveTo(topX, topYk - w * 0.62, topX + tipW, topYk);
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
  for (const c of o.coral) {
    const x = o.x + c.ox;
    const y = o.y + c.oy;
    const sway = Math.sin(t * 0.9 + c.ph) * c.size * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway * 0.12);

    if (c.kind === 'fan') {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-c.size * 0.9, -c.size * 0.7, -c.size * 0.35, -c.size * 1.15);
      ctx.quadraticCurveTo(0, -c.size * 1.3, c.size * 0.35, -c.size * 1.15);
      ctx.quadraticCurveTo(c.size * 0.9, -c.size * 0.7, 0, 0);
      ctx.closePath();
      ctx.fillStyle = hsl(c.hue, 62, 58, 0.72);
      ctx.fill();
      ctx.strokeStyle = hsl(c.hue, 70, 76, 0.5);
      ctx.lineWidth = Math.max(0.8, c.size * 0.05);
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * c.size * 0.42;
        const h = c.size * (0.9 + 0.35 * Math.sin(i * 2.1 + c.ph));
        const w = c.size * 0.26;
        ctx.moveTo(ox - w, 0);
        ctx.lineTo(ox - w * 0.8, -h);
        ctx.lineTo(ox + w * 0.8, -h);
        ctx.lineTo(ox + w, 0);
        ctx.closePath();
      }
      ctx.fillStyle = hsl(c.hue, 60, 62, 0.7);
      ctx.fill();
      ctx.fillStyle = hsl(c.hue, 78, 82, 0.55);
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * c.size * 0.42;
        const h = c.size * (0.9 + 0.35 * Math.sin(i * 2.1 + c.ph));
        ctx.beginPath();
        ctx.ellipse(ox, -h, c.size * 0.22, c.size * 0.1, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawShelf(o) {
  const step = 36;
  const yt = x => topY(o, x);
  const yb = x => botY(o, x);

  for (const [a, b] of o.solids) {
    // 岩体：竖向渐变，顶亮底暗
    const grad = ctx.createLinearGradient(0, o.y - o.cr, 0, o.y + o.cr);
    grad.addColorStop(0, hsl(o.hue, 28, o.lit + 7));
    grad.addColorStop(0.45, hsl(o.hue, 26, o.lit));
    grad.addColorStop(1, hsl(o.hue, 22, Math.max(4, o.lit - 7)));

    ctx.beginPath();
    ctx.moveTo(a, yt(a));
    for (let x = a + step; x < b; x += step) ctx.lineTo(x, yt(x));
    ctx.lineTo(b, yt(b));
    // 右端鼓成圆弧，不是直切
    ctx.quadraticCurveTo(b + o.cr * 0.85, o.y, b, yb(b));
    for (let x = b - step; x > a; x -= step) ctx.lineTo(x, yb(x));
    ctx.lineTo(a, yb(a));
    // 左端同理
    ctx.quadraticCurveTo(a - o.cr * 0.85, o.y, a, yt(a));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 顶面受光带
    ctx.beginPath();
    ctx.moveTo(a, yt(a));
    for (let x = a + step; x < b; x += step) ctx.lineTo(x, yt(x));
    ctx.lineTo(b, yt(b));
    ctx.lineTo(b, yt(b) + 10);
    for (let x = b - step; x > a; x -= step) ctx.lineTo(x, yt(x) + 10);
    ctx.lineTo(a, yt(a) + 10);
    ctx.closePath();
    ctx.fillStyle = hsl(o.hue, 34, o.lit + 16, 0.5);
    ctx.fill();

    // 嵌在顶面的碎石，打断那条直线
    const bumpCount = Math.max(2, Math.floor((b - a) / 130));
    for (let i = 0; i < bumpCount; i++) {
      const rx = a + ((i + 0.5) / bumpCount) * (b - a) + (hash(o.seed + i * 3.7) - 0.5) * 40;
      const rr = 7 + hash(o.seed + i * 5.1) * 13;
      ctx.beginPath();
      ctx.ellipse(rx, yt(rx) + rr * 0.35, rr * 1.35, rr * 0.75, 0, 0, TAU);
      ctx.fillStyle = hsl(o.hue, 26, o.lit + 4, 0.85);
      ctx.fill();
    }

    // 层理：多几条、带起伏
    for (let k = 1; k <= 4; k++) {
      const baseY = o.y - o.cr * 0.28 + (o.cr * 0.42) * k;
      ctx.beginPath();
      ctx.moveTo(a, baseY);
      for (let x = a + step * 2; x < b; x += step * 2) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.02 + o.seed + k * 1.7) * (2 + k));
      }
      ctx.strokeStyle = hsl(o.hue, 24, Math.max(4, o.lit - 8), 0.34 + k * 0.05);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  drawShelfKelp(o);
  drawCoral(o);
}

/** 并集圆填充：先一圈暗边，再主体，再内圈提亮。不要 stroke（会露出内部弧线）。 */
function solidBlob(o, hue, sat, lit, highlight) {
  const g = 3;
  ctx.beginPath();
  for (const c of o.parts) {
    ctx.moveTo(c.x + c.r + g, c.y);
    ctx.arc(c.x, c.y, c.r + g, 0, TAU);
  }
  ctx.fillStyle = hsl(hue, sat * 0.8, lit * 0.62, 0.95);
  ctx.fill();

  ctx.beginPath();
  for (const c of o.parts) {
    ctx.moveTo(c.x + c.r, c.y);
    ctx.arc(c.x, c.y, c.r, 0, TAU);
  }
  ctx.fillStyle = hsl(hue, sat, lit, 0.98);
  ctx.fill();

  if (highlight) {
    // 不用同心缩小（那会看起来像个球），而是在顶面抹一道偏上的窄高光
    ctx.beginPath();
    ctx.ellipse(o.x, o.y - o.r * 0.42, o.r * 0.72, o.r * 0.24, 0, 0, TAU);
    ctx.fillStyle = hsl(hue, sat * 0.9, lit + 10, 0.28);
    ctx.fill();
  }
}

function drawCrevice(o) {
  solidBlob(o, o.hue, 28, o.lit, true);

  // 两块石头之间的暗缝
  const halfH = o.r * 0.62;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.gap * 0.82, halfH * 1.05, 0, 0, TAU);
  ctx.fillStyle = 'rgba(3,14,20,.4)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(o.x, o.y - halfH);
  ctx.quadraticCurveTo(o.x - o.gap * 0.54, o.y - halfH * 0.15, o.x - o.gap * 0.34, o.y + halfH);
  ctx.lineTo(o.x + o.gap * 0.34, o.y + halfH);
  ctx.quadraticCurveTo(o.x + o.gap * 0.54, o.y - halfH * 0.15, o.x, o.y - halfH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(2,8,13,.92)';
  ctx.fill();

  drawCoral(o);
}

function drawWreck(o) {
  const { len, tilt, hullR } = o;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(tilt);

  ctx.beginPath();
  ctx.moveTo(-len * 0.5, -hullR * 0.2);
  ctx.quadraticCurveTo(-len * 0.28, hullR * 1.15, 0, hullR * 1.25);
  ctx.quadraticCurveTo(len * 0.3, hullR * 1.15, len * 0.5, -hullR * 0.15);
  ctx.quadraticCurveTo(len * 0.2, hullR * 0.15, 0, hullR * 0.1);
  ctx.quadraticCurveTo(-len * 0.24, hullR * 0.2, -len * 0.5, -hullR * 0.2);
  ctx.closePath();
  ctx.fillStyle = hsl(o.hue, 22, o.lit, 0.96);
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = -len * 0.36 + i * (len * 0.18);
    ctx.moveTo(x, hullR * 0.05);
    ctx.quadraticCurveTo(x + len * 0.02, -hullR * 0.95, x + len * 0.05, -hullR * 1.15);
  }
  ctx.strokeStyle = hsl(o.hue, 26, o.lit * 0.8, 0.9);
  ctx.lineWidth = Math.max(1.5, hullR * 0.13);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-len * 0.02, -hullR * 0.4);
  ctx.lineTo(len * 0.06, -hullR * 2.1);
  ctx.strokeStyle = hsl(o.hue, 24, o.lit * 0.75, 0.85);
  ctx.lineWidth = Math.max(1.5, hullR * 0.1);
  ctx.stroke();

  ctx.restore();

  drawCoral(o);
}

export function drawTerrain() {
  const deep = clamp((depthM() - 60) / 220, 0, 1);
  ctx.save();
  if (deep > 0.01) ctx.globalAlpha = 1 - deep * 0.1;

  // 先画岩台（在下面），再画石头/沉船（在上面）
  for (const o of world.terrain) {
    if (o.kind === 'shelf') drawShelf(o);
  }
  for (const o of world.terrain) {
    if (o.kind === 'boulder') { solidBlob(o, o.hue, 26, o.lit, true); drawCoral(o); }
    else if (o.kind === 'crevice') drawCrevice(o);
    else if (o.kind === 'wreck') drawWreck(o);
  }

  ctx.restore();
}
