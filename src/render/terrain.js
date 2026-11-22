// 地形渲染：礁石、洞穴、沉船残骸，以及附着其上的珊瑚/海绵。
// 礁石和洞穴都由"一串圆"组成，所以直接把这些圆画进同一条 path、一次 fill，
// 就得到天然融合的轮廓（同向圆弧按非零环绕规则取并集）。

import { TAU, clamp, hsl, lerp } from '../core/math.js';
import { ctx } from '../core/viewport.js';
import { world, depthM } from '../world/world.js';

/** 把一圈圆合成一条 path。 */
function blobPath(parts, shrink, ox, oy, cx, cy, grow = 0) {
  for (const c of parts) {
    let { x, y, r } = c;
    if (shrink !== 1) {
      x = cx + (x - cx) * shrink;
      y = cy + (y - cy) * shrink;
      r = r * shrink;
    }
    r += grow;
    ctx.moveTo(x + r + ox, y + oy);
    ctx.arc(x + ox, y + oy, r, 0, TAU);
  }
}

/** 实心块：先铺一圈暗边，再填主体，最后压一块整体高光。
 *  注意不要 stroke —— 并集路径里每个圆都会留下内部弧线。 */
function solidBlob(o, hue, sat, lit, highlight) {
  ctx.beginPath();
  blobPath(o.parts, 1, 0, 0, o.x, o.y, 3);
  ctx.fillStyle = hsl(hue, sat * 0.8, lit * 0.62, 0.95);
  ctx.fill();

  ctx.beginPath();
  blobPath(o.parts, 1, 0, 0, o.x, o.y);
  ctx.fillStyle = hsl(hue, sat, lit, 0.98);
  ctx.fill();

  if (highlight) {
    // 内圈提亮：收缩后的并集仍是光滑轮廓，不会暴露拼接的圆
    ctx.beginPath();
    blobPath(o.parts, 0.68, -o.r * 0.03, -o.r * 0.08, o.x, o.y);
    ctx.fillStyle = hsl(hue, sat * 0.9, lit + 9, 0.42);
    ctx.fill();
  }
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
      // 扇形珊瑚：一个半圆 + 几道放射裂隙
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
      // 管状海绵：三根高低不同的管子
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

function drawRock(o) {
  solidBlob(o, o.hue, 26, o.lit, true);
  drawCoral(o);
}

function drawCave(o) {
  solidBlob(o, o.hue, 28, o.lit, true);

  // 两块巨石之间的暗缝：高度贴合巨石，上下收窄，避免变成一根黑柱子
  const halfH = o.outerR * 0.52;

  // 一层更宽的柔和暗影，让缝隙和石体有过渡
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.gap * 0.82, halfH * 1.05, 0, 0, TAU);
  ctx.fillStyle = 'rgba(3,14,20,.4)';
  ctx.fill();

  // 缝隙本体
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

  // 船体：一段弧形外壳
  ctx.beginPath();
  ctx.moveTo(-len * 0.5, -hullR * 0.2);
  ctx.quadraticCurveTo(-len * 0.28, hullR * 1.15, 0, hullR * 1.25);
  ctx.quadraticCurveTo(len * 0.3, hullR * 1.15, len * 0.5, -hullR * 0.15);
  ctx.quadraticCurveTo(len * 0.2, hullR * 0.15, 0, hullR * 0.1);
  ctx.quadraticCurveTo(-len * 0.24, hullR * 0.2, -len * 0.5, -hullR * 0.2);
  ctx.closePath();
  ctx.fillStyle = hsl(o.hue, 22, o.lit, 0.96);
  ctx.fill();

  // 肋骨
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = -len * 0.36 + i * (len * 0.18);
    ctx.moveTo(x, hullR * 0.05);
    ctx.quadraticCurveTo(x + len * 0.02, -hullR * 0.95, x + len * 0.05, -hullR * 1.15);
  }
  ctx.strokeStyle = hsl(o.hue, 26, o.lit * 0.8, 0.9);
  ctx.lineWidth = Math.max(1.5, hullR * 0.13);
  ctx.stroke();

  // 断掉的桅杆
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
  // 深处的岩石整体更暗，靠生物光才看得见轮廓
  const deep = clamp((depthM() - 60) / 220, 0, 1);
  ctx.save();
  if (deep > 0.01) ctx.globalAlpha = 1 - deep * 0.12;

  for (const o of world.terrain) {
    if (o.kind === 'rock') drawRock(o);
    else if (o.kind === 'cave') drawCave(o);
    else drawWreck(o);
  }

  ctx.restore();
}
