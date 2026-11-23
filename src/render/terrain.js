// 地形渲染：海底岩台、礁石、裂缝、沉船，以及附着其上的珊瑚/海绵。
//
// 岩台是横向的岩体，视觉上用一条路径画（顶部带起伏），碰撞用一排圆。
// 礁石/裂缝/沉船由"一串圆"组成，直接把这些圆画进同一条 path、一次 fill，
// 就得到天然融合的轮廓（同向圆弧按非零环绕规则取并集）。

import { TAU, clamp, hsl, hash } from '../core/math.js';
import { ctx } from '../core/viewport.js';
import { world, depthM } from '../world/world.js';

/** 岩台在 x 处的真实上下边界：碰撞圆的并集外形。
 *  这样"看得见的形状"和"撞得到的形状"完全一致，而且天然带扇贝状的凹凸。 */
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

/** 岩台顶面高度（供海藻、碎石、珊瑚定位）。 */
function shelfTopAt(o, x) {
  const env = envelopeAt(o, x);
  return env ? env.top : o.y - o.cr;
}

/** 岩台顶面的海藻：从台面往上长，随水流摆。所有叶带合成一条 path，只 fill 一次。 */
function drawShelfKelp(o) {
  if (!o.kelp || o.kelp.length === 0) return;
  const t = world.time;

  ctx.beginPath();
  for (const k of o.kelp) {
    const baseX = k.ox;
    const baseY = shelfTopAt(o, baseX) + 3;
    const sway = Math.sin(t * 0.62 + k.ph) * (18 + k.h * 0.11);
    const topX = baseX + sway;
    const topYk = baseY - k.h;
    const w = k.w;

    // 等宽的叶带 + 圆头：之前从宽基部收到尖顶，看起来像三角尖刺
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
        const ox = (i - 1) * c.size * 0.46;
        const h = c.size * (0.95 + 0.4 * Math.sin(i * 2.1 + c.ph));
        const w = c.size * 0.17;
        // 自下而上收细，管口再加一圈外翻，看起来像海绵而不是方盒
        ctx.moveTo(ox - w * 1.15, 0);
        ctx.quadraticCurveTo(ox - w * 0.72, -h * 0.6, ox - w * 0.62, -h);
        ctx.quadraticCurveTo(ox, -h - w * 0.7, ox + w * 0.62, -h);
        ctx.quadraticCurveTo(ox + w * 0.72, -h * 0.6, ox + w * 1.15, 0);
        ctx.closePath();
      }
      ctx.fillStyle = hsl(c.hue, 60, 62, 0.7);
      ctx.fill();
      ctx.fillStyle = hsl(c.hue, 78, 82, 0.55);
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * c.size * 0.46;
        const h = c.size * (0.95 + 0.4 * Math.sin(i * 2.1 + c.ph));
        ctx.beginPath();
        ctx.ellipse(ox, -h - c.size * 0.02, c.size * 0.13, c.size * 0.055, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}


function drawShelf(o) {
  const tint = rockTint(o);
  const sampleStep = 18;

  for (const [a, b] of o.solids) {
    const x0 = a - o.cr * 0.98;
    const x1 = b + o.cr * 0.98;

    // 采样并集轮廓
    const topPts = [];
    const botPts = [];
    for (let x = x0; x <= x1; x += sampleStep) {
      const env = envelopeAt(o, x);
      if (!env) continue;
      // 只向内做轻微扰动（不进碰撞范围），避免"看着没碰到却撞上了"
      const jitter = (hash(o.seed + x * 0.05) - 0.5) * o.cr * 0.05;
      topPts.push({ x, y: env.top + Math.max(0, jitter) });
      botPts.push({ x, y: env.bot - Math.max(0, jitter) });
    }
    if (topPts.length < 2) continue;

    const traceSeg = () => {
      ctx.beginPath();
      ctx.moveTo(topPts[0].x, topPts[0].y);
      for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i].x, topPts[i].y);
      for (let i = botPts.length - 1; i >= 0; i--) ctx.lineTo(botPts[i].x, botPts[i].y);
      ctx.closePath();
    };

    // 岩体
    const grad = ctx.createLinearGradient(0, o.y - o.cr * 1.3, 0, o.y + o.cr);
    grad.addColorStop(0, hsl(tint.hue, tint.sat + 6, tint.lit + 8));
    grad.addColorStop(0.4, hsl(tint.hue, tint.sat + 4, tint.lit));
    grad.addColorStop(1, hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 8)));
    traceSeg();
    ctx.fillStyle = grad;
    ctx.fill();

    // 顶部受光：跟着真实轮廓走
    ctx.beginPath();
    ctx.moveTo(topPts[0].x, topPts[0].y);
    for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i].x, topPts[i].y);
    for (let i = topPts.length - 1; i >= 0; i--) ctx.lineTo(topPts[i].x, topPts[i].y + 11);
    ctx.closePath();
    ctx.fillStyle = hsl(tint.hue, tint.sat + 8, tint.lit + 16, 0.42);
    ctx.fill();

    // 顶面的藻类附着带
    ctx.beginPath();
    ctx.moveTo(topPts[0].x, topPts[0].y);
    for (let i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i].x, topPts[i].y);
    for (let i = topPts.length - 1; i >= 0; i--) ctx.lineTo(topPts[i].x, topPts[i].y + 6);
    ctx.closePath();
    ctx.fillStyle = hsl(158, 26, 24, 0.28);
    ctx.fill();

    // 纹理：裁剪在轮廓内
    ctx.save();
    traceSeg();
    ctx.clip();

    const strataStep = Math.max(48, (b - a) / 34);
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const baseY = o.y - o.cr * 0.7 + (o.cr * 1.5 / 8) * k
        + (hash(o.seed + k * 2.3) - 0.5) * o.cr * 0.07;
      ctx.moveTo(a, baseY);
      for (let x = a + strataStep; x < b; x += strataStep) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.013 + o.seed + k * 1.3) * (1.4 + k * 0.5));
      }
    }
    ctx.strokeStyle = hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 7), 0.2);
    ctx.lineWidth = 1.1;
    ctx.stroke();

    const pitCount = Math.min(120, Math.floor((b - a) / 38));
    ctx.beginPath();
    for (let i = 0; i < pitCount; i++) {
      const px2 = a + hash(o.seed + i * 1.73) * (b - a);
      const py2 = o.y - o.cr * 1.1 + hash(o.seed + i * 3.11) * o.cr * 2.1;
      const pr2 = 1 + hash(o.seed + i * 5.9) * 2.6;
      ctx.moveTo(px2 + pr2, py2);
      ctx.arc(px2, py2, pr2, 0, TAU);
    }
    ctx.fillStyle = hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 10), 0.32);
    ctx.fill();

    // 底部压暗
    const shadow = ctx.createLinearGradient(0, o.y - o.cr * 0.1, 0, o.y + o.cr);
    shadow.addColorStop(0, hsl(tint.hue, tint.sat, tint.lit - 4, 0));
    shadow.addColorStop(1, hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 12), 0.6));
    ctx.fillStyle = shadow;
    ctx.fillRect(a - o.cr, o.y - o.cr * 0.1, (b - a) + o.cr * 2, o.cr * 1.1);

    // 岩缝：从顶面往下几道短裂纹
    const crackCount = Math.max(2, Math.floor((b - a) / 220));
    ctx.beginPath();
    for (let i = 0; i < crackCount; i++) {
      const cx2 = a + ((i + 0.5) / crackCount) * (b - a) + (hash(o.seed + i * 6.1) - 0.5) * 80;
      const env = envelopeAt(o, cx2);
      if (!env) continue;
      const cy2 = env.top;
      const len = o.cr * (0.25 + hash(o.seed + i * 8.3) * 0.45);
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 + (hash(o.seed + i * 9.7) - 0.5) * 18, cy2 + len);
    }
    ctx.strokeStyle = hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 12), 0.4);
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.restore();

    // 裙摆：底部渐隐进深水，避免"上下都有边"的漂浮板观感
    const skirtH = o.cr * 2.4;
    const skirt = ctx.createLinearGradient(0, o.y + o.cr * 0.3, 0, o.y + o.cr + skirtH);
    skirt.addColorStop(0, hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 6), 0.9));
    skirt.addColorStop(0.5, hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 10), 0.55));
    skirt.addColorStop(1, hsl(tint.hue, tint.sat, Math.max(2, tint.lit - 14), 0));
    // 裙摆：不做梯形收窄（那会变成方桶），而是从底边垂下一些长短不一的岩齿，
    // 让底边自然破碎、并逐渐淡出
    ctx.beginPath();
    ctx.moveTo(botPts[0].x, botPts[0].y - o.cr * 0.15);
    for (let i = 1; i < botPts.length; i++) ctx.lineTo(botPts[i].x, botPts[i].y - o.cr * 0.15);
    ctx.lineTo(botPts[botPts.length - 1].x, o.y + o.cr + skirtH * 0.45);
    ctx.lineTo(botPts[0].x, o.y + o.cr + skirtH * 0.45);
    ctx.closePath();
    ctx.fillStyle = skirt;
    ctx.fill();

    // 钟乳状岩齿：长短不一，破掉裙摆的直边
    const toothCount = Math.max(4, Math.floor((b - a) / 120));
    for (let i = 0; i < toothCount; i++) {
      const tx = a + ((i + 0.5) / toothCount) * (b - a) + (hash(o.seed + i * 4.3) - 0.5) * 60;
      const env = envelopeAt(o, tx);
      if (!env) continue;
      const tw = o.cr * (0.3 + hash(o.seed + i * 6.7) * 0.45);
      const th = o.cr * (0.7 + hash(o.seed + i * 8.9) * 1.9);
      const tg = ctx.createLinearGradient(0, env.bot, 0, env.bot + th);
      tg.addColorStop(0, hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 7), 0.9));
      tg.addColorStop(1, hsl(tint.hue, tint.sat, Math.max(2, tint.lit - 13), 0));
      ctx.beginPath();
      ctx.moveTo(tx - tw * 0.5, env.bot - 4);
      ctx.lineTo(tx + (hash(o.seed + i * 2.1) - 0.5) * tw * 0.5, env.bot + th);
      ctx.lineTo(tx + tw * 0.5, env.bot - 4);
      ctx.closePath();
      ctx.fillStyle = tg;
      ctx.fill();
    }

    // 顶面碎石
    const bumpCount = Math.max(3, Math.floor((b - a) / 90));
    for (let i = 0; i < bumpCount; i++) {
      const rx = a + ((i + 0.5) / bumpCount) * (b - a) + (hash(o.seed + i * 3.7) - 0.5) * 30;
      const rr = 5 + hash(o.seed + i * 5.1) * 10;
      const ty2 = shelfTopAt(o, rx);
      ctx.beginPath();
      ctx.ellipse(rx, ty2 + rr * 0.3, rr * 1.35, rr * 0.7, 0, 0, TAU);
      ctx.fillStyle = hsl(tint.hue, tint.sat + 2, tint.lit + 5, 0.92);
      ctx.fill();
    }
  }

  drawShelfKelp(o);
  drawCoral(o);
}

/** 取一组圆的重心和最大外接距离，用来给岩石定一个不越界的多边形。 */
function rockReach(parts) {
  let cx = 0, cy = 0, wsum = 0;
  for (const c of parts) {
    const w = c.r * c.r;
    cx += c.x * w; cy += c.y * w; wsum += w;
  }
  cx /= wsum || 1; cy /= wsum || 1;

  let reach = 0;
  for (const c of parts) {
    reach = Math.max(reach, Math.hypot(c.x - cx, c.y - cy) + c.r);
  }
  return { cx, cy, reach };
}

/**
 * 岩石的深度偏色：越深越冷、越暗。
 * 用岩石自己的世界高度算，而不是玩家深度——玩家在浅处也能看到下方的深色岩层。
 */
function rockTint(o) {
  const d = clamp((o.y / 20 - 30) / 260, 0, 1);
  return {
    hue: o.hue + d * 16,          // 往蓝紫方向偏
    sat: Math.max(8, 22 - d * 8),
    // 保留下限：深水里岩石可以很暗，但不能黑成一片——否则棱面和层理全被吃掉
    lit: Math.max(13, o.lit - d * 6),
  };
}

/**
 * 画一块不规则岩石：轮廓 + 棱面 + 层理 + 裂纹。
 *
 * 之前整块石头用"一串圆的并集"画，轮廓天生是圆的，加个椭圆高光就成了球。
 * 现在用同一个种子生成不规则多边形，从中心切棱面，再叠几条沉积层理。
 */
function rockShape(cx, cy, r0, seed, tint) {
  const n = 8 + Math.floor(hash(seed + 0.7) * 3);

  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (hash(seed + i * 2.7) - 0.5) * 0.34;
    const rad = r0 * (0.72 + hash(seed + i * 5.3) * 0.28);
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }

  const tracePath = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  };

  tracePath();
  ctx.fillStyle = hsl(tint.hue, tint.sat, tint.lit, 0.98);
  ctx.fill();

  // 棱面：朝上的面偏亮（光从水面来）
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();

    const up = clamp((cy - (a.y + b.y) / 2) / (r0 * 0.9), -1, 1);
    const jitter = (hash(seed + i * 3.1) - 0.5) * 5;
    ctx.fillStyle = hsl(tint.hue, tint.sat - 2, tint.lit + up * 6 + jitter, 0.5);
    ctx.fill();
  }

  // 沉积层理：裁剪在轮廓内，画几条近水平的波纹线
  if (r0 > 26) {
    ctx.save();
    tracePath();
    ctx.clip();
    for (let k = 1; k <= 3; k++) {
      const yy = cy - r0 * 0.46 + (r0 * 0.92 / 3) * k + (hash(seed + k * 4.4) - 0.5) * r0 * 0.1;
      ctx.beginPath();
      const x0 = cx - r0, x1 = cx + r0;
      ctx.moveTo(x0, yy);
      for (let x = x0 + r0 * 0.3; x <= x1; x += r0 * 0.3) {
        ctx.lineTo(x, yy + Math.sin(x * 0.09 + seed + k * 1.7) * r0 * 0.045);
      }
      ctx.strokeStyle = hsl(tint.hue, tint.sat - 4, Math.max(3, tint.lit - 6), 0.42);
      ctx.lineWidth = Math.max(1, r0 * 0.022);
      ctx.stroke();
    }

    // 颗粒感：小凹坑，一次 fill
    const pits = Math.min(48, Math.round(r0 * 0.55));
    ctx.beginPath();
    for (let i = 0; i < pits; i++) {
      const a2 = hash(seed + i * 1.31) * TAU * 4;
      const d2 = Math.sqrt(hash(seed + i * 2.77)) * r0 * 0.86;
      const px2 = cx + Math.cos(a2) * d2;
      const py2 = cy + Math.sin(a2) * d2;
      const pr2 = Math.max(0.8, 0.8 + hash(seed + i * 5.13) * r0 * 0.035);
      ctx.moveTo(px2 + pr2, py2);
      ctx.arc(px2, py2, pr2, 0, TAU);
    }
    ctx.fillStyle = hsl(tint.hue, tint.sat - 2, Math.max(3, tint.lit - 9), 0.32);
    ctx.fill();
    ctx.restore();
  }

  // 轮廓
  tracePath();
  ctx.strokeStyle = hsl(tint.hue, tint.sat + 2, Math.max(3, tint.lit - 8), 0.55);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 裂纹
  ctx.beginPath();
  for (let k = 0; k < 2; k++) {
    const i = Math.floor(hash(seed + k * 9.7) * n);
    const a = pts[i];
    ctx.moveTo(cx + (a.x - cx) * 0.18, cy + (a.y - cy) * 0.18);
    ctx.lineTo(cx + (a.x - cx) * 0.7, cy + (a.y - cy) * 0.7);
  }
  ctx.strokeStyle = hsl(tint.hue, tint.sat, Math.max(3, tint.lit - 7), 0.4);
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

/**
 * 一块礁石 = 2~3 块错落堆叠的岩石。
 * 所有堆叠都收在碰撞外接圆以内，视觉不会超出实际能撞到的范围。
 */
function drawRock(o, parts = o.parts, seed = o.seed) {
  const { cx, cy, reach } = rockReach(parts);
  const tint = rockTint(o);

  // 主岩体
  const baseR = reach * 0.74;
  rockShape(cx, cy + reach * 0.08, baseR, seed, tint);

  // 叠在主岩体上的次岩块
  if (hash(seed + 11) < 0.8) {
    rockShape(
      cx + (hash(seed + 12) - 0.5) * reach * 0.5,
      cy - reach * 0.34,
      baseR * 0.56,
      seed + 13.3,
      tint,
    );
  }
  if (hash(seed + 21) < 0.55) {
    rockShape(
      cx + (hash(seed + 22) - 0.5) * reach * 0.55,
      cy - reach * 0.56,
      baseR * 0.34,
      seed + 23.7,
      tint,
    );
  }
}

function drawCrevice(o) {
  // 左右两簇各自的圆，分别当作一块岩石来画
  const left = o.parts.filter(c => c.x < o.x);
  const right = o.parts.filter(c => c.x >= o.x);
  drawRock(o, left, o.seed);
  drawRock(o, right, o.seed + 31.7);

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
  if (deep > 0.01) ctx.globalAlpha = 1 - deep * 0.06;

  // 先画岩台（在下面），再画石头/沉船（在上面）
  for (const o of world.terrain) {
    if (o.kind === 'shelf') drawShelf(o);
  }
  for (const o of world.terrain) {
    if (o.kind === 'boulder') { drawRock(o); drawCoral(o); }
    else if (o.kind === 'crevice') drawCrevice(o);
    else if (o.kind === 'wreck') drawWreck(o);
  }

  ctx.restore();
}
