// 环境元素渲染：海藻林、鱼群、蝠鲼、热泉。
// 海藻画在屏幕空间（视差层，贴近海底边缘）；其余画在世界空间。

import { TAU, clamp, hsl, lerp } from '../core/math.js';
import { ctx, W, H } from '../core/viewport.js';
import { world, depthM } from '../world/world.js';

/* ---------------- 海藻林 ---------------- */

// 每层：视差、间距、高度范围、颜色、透明度
const KELP_LAYERS = [
  { par: 0.30, spacing: 118, hMin: 210, hMax: 400, hue: 154, sat: 44, li: 21, alpha: 0.42, width: 30 },
  { par: 0.50, spacing: 156, hMin: 160, hMax: 310, hue: 147, sat: 40, li: 15, alpha: 0.6, width: 38 },
  { par: 0.72, spacing: 210, hMin: 110, hMax: 210, hue: 142, sat: 34, li: 11, alpha: 0.72, width: 44 },
];

export function drawKelp() {
  const d = depthM();
  // 越深越没有海藻：40m 开始变稀，170m 以下彻底消失（深处交给热泉和生物光）
  const fade = clamp(1 - (d - 40) / 130, 0, 1);
  if (fade <= 0.03) return;

  const { cam, time } = world;
  ctx.save();

  for (let li = 0; li < KELP_LAYERS.length; li++) {
    const L = KELP_LAYERS[li];
    const span = W + L.spacing * 2;
    const count = Math.ceil(span / L.spacing);
    const baseY = H + 26;
    const off = cam.x * L.par;

    ctx.fillStyle = hsl(L.hue, L.sat, L.li, L.alpha * fade);
    ctx.beginPath();

    for (let i = 0; i < count; i++) {
      // 用取模把海藻铺成无限横移的一排
      let x = i * L.spacing - off;
      x = ((x % span) + span) % span - L.spacing;
      if (x < -80 || x > W + 80) continue;

      const seed = i * 7.31 + li * 13.7;
      const h = lerp(L.hMin, L.hMax, Math.abs(Math.sin(seed * 1.7)));
      const w = L.width * (0.8 + 0.4 * Math.abs(Math.cos(seed)));
      const sway = Math.sin(time * 0.62 + seed) * (10 + h * 0.055);
      const lean = Math.sin(seed * 2.3) * w * 0.9;

      const topX = x + sway + lean;
      const topY = baseY - h;

      // 一条从根部收细、带波浪边缘、并向一侧倾斜的叶带
      const wv = w * 0.16;
      ctx.moveTo(x - w * 0.5, baseY + 10);
      // 左缘：三段，带两个内凹，叶缘才有起伏
      ctx.bezierCurveTo(
        x - w * 0.46 + sway * 0.3, baseY - h * 0.26,
        x - w * 0.30 + sway * 0.55 + wv, baseY - h * 0.42,
        x - w * 0.34 + sway * 0.6, baseY - h * 0.56,
      );
      ctx.bezierCurveTo(
        x - w * 0.22 + sway * 0.8, baseY - h * 0.72,
        topX - w * 0.16, baseY - h * 0.88,
        topX, topY,
      );
      // 右缘
      ctx.bezierCurveTo(
        topX + w * 0.16, baseY - h * 0.86,
        x + w * 0.30 + sway * 0.7 - wv, baseY - h * 0.66,
        x + w * 0.36 + sway * 0.5, baseY - h * 0.5,
      );
      ctx.bezierCurveTo(
        x + w * 0.42 + sway * 0.3, baseY - h * 0.32,
        x + w * 0.46, baseY - h * 0.14,
        x + w * 0.5, baseY + 10,
      );
      ctx.closePath();
    }
    ctx.fill();
  }

  ctx.restore();
}

/* ---------------- 鱼群 ---------------- */

export function drawShoals() {
  const { shoals, time } = world;
  for (const s of shoals) {
    const t = time * 1.5 + s.ph;
    const cx = s.x + Math.sin(t * 0.5) * 7;
    const cy = s.y + Math.cos(t * 0.42) * 5;

    ctx.beginPath();
    for (const m of s.members) {
      // 成员在小范围内摆动，整体像一个会呼吸的云
      const wob = Math.sin(t * 1.1 + m.ph);
      const mx = cx + m.ox * s.r * (0.92 + 0.08 * wob);
      const my = cy + m.oy * s.r * 0.58 * (0.92 + 0.08 * Math.cos(t * 1.3 + m.ph));
      const len = 5.2 * m.sz;
      const hgt = 1.9 * m.sz;
      // 一条两笔的极简鱼形，所有成员合并进同一条 path，只 fill 一次
      ctx.moveTo(mx - len, my);
      ctx.quadraticCurveTo(mx, my - hgt, mx + len, my);
      ctx.quadraticCurveTo(mx, my + hgt, mx - len, my);
    }
    ctx.fillStyle = hsl(s.hue, 68, 64, 0.62);
    ctx.fill();
  }
}

/* ---------------- 蝠鲼 ---------------- */

export function drawMantas() {
  const { mantas, time } = world;
  for (const m of mantas) {
    const R = m.r;
    const flap = Math.sin(time * 0.85 + m.ph);
    // 翅膀上下摆动：把翼展在 0.55~1.15 之间缩放
    const span = 0.85 + flap * 0.3;

    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(m.vx < 0 ? -1 : 1, 1);
    ctx.rotate(m.pitch);

    // 真实蝠鲼的比例：翼展约是体长的 1.8 倍，翼尖明显后掠到身体之后
    ctx.beginPath();
    ctx.moveTo(R * 0.62, 0);                                              // 吻端
    ctx.quadraticCurveTo(R * 0.30, -R * 0.30 * span, R * 0.02, -R * 0.62 * span);
    ctx.quadraticCurveTo(-R * 0.30, -R * 0.95 * span, -R * 0.58, -R * 0.96 * span);  // 翼尖（后掠）
    ctx.quadraticCurveTo(-R * 0.34, -R * 0.52 * span, -R * 0.44, -R * 0.22);          // 后缘内凹
    ctx.quadraticCurveTo(-R * 0.50, -R * 0.07, -R * 0.52, 0);                          // 尾根
    // 镜像到下半侧
    ctx.quadraticCurveTo(-R * 0.50, R * 0.07, -R * 0.44, R * 0.22);
    ctx.quadraticCurveTo(-R * 0.34, R * 0.52 * span, -R * 0.58, R * 0.96 * span);
    ctx.quadraticCurveTo(-R * 0.30, R * 0.95 * span, R * 0.02, R * 0.62 * span);
    ctx.quadraticCurveTo(R * 0.30, R * 0.30 * span, R * 0.62, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,22,34,.42)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,215,235,.14)';
    ctx.lineWidth = Math.max(1, R * 0.01);
    ctx.stroke();

    // 中央体脊
    ctx.beginPath();
    ctx.moveTo(R * 0.42, 0);
    ctx.quadraticCurveTo(R * 0.02, -R * 0.1, -R * 0.48, 0);
    ctx.quadraticCurveTo(R * 0.02, R * 0.1, R * 0.42, 0);
    ctx.fillStyle = 'rgba(110,180,205,.1)';
    ctx.fill();

    // 细尾（比翼展短很多）
    ctx.beginPath();
    ctx.moveTo(-R * 0.52, -R * 0.03);
    ctx.quadraticCurveTo(-R * 0.82, flap * R * 0.05, -R * 1.12, flap * R * 0.09);
    ctx.quadraticCurveTo(-R * 0.82, R * 0.015 + flap * R * 0.05, -R * 0.52, R * 0.03);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,32,46,.4)';
    ctx.fill();

    // 两团眼影，让它有"有脸"的感觉
    ctx.fillStyle = 'rgba(190,240,250,.22)';
    ctx.beginPath();
    ctx.arc(R * 0.46, -R * 0.09, R * 0.028, 0, TAU);
    ctx.arc(R * 0.46, R * 0.09, R * 0.028, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}

/* ---------------- 热泉 ---------------- */

export function drawVents() {
  const { vents, time } = world;
  for (const v of vents) {
    const pulse = 0.75 + 0.25 * Math.sin(time * 1.6 + v.ph);

    // 暖色光晕（越深越显眼）
    const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 150);
    g.addColorStop(0, hsl(v.hue, 92, 62, 0.3 * pulse));
    g.addColorStop(0.35, hsl(v.hue, 86, 50, 0.12 * pulse));
    g.addColorStop(1, hsl(v.hue, 80, 40, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(v.x, v.y, 150, 0, TAU);
    ctx.fill();

    // 喷口：一块深色岩体 + 发光缝
    ctx.beginPath();
    ctx.moveTo(v.x - 26, v.y + 22);
    ctx.quadraticCurveTo(v.x - 14, v.y - 14, v.x - 4, v.y - 18);
    ctx.quadraticCurveTo(v.x + 10, v.y - 14, v.x + 24, v.y + 22);
    ctx.closePath();
    ctx.fillStyle = 'rgba(5,14,20,.85)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(v.x - 5, v.y + 2);
    ctx.quadraticCurveTo(v.x, v.y - 14, v.x + 5, v.y + 2);
    ctx.closePath();
    ctx.fillStyle = hsl(v.hue, 96, 66, 0.55 * pulse);
    ctx.fill();

    // 上升的暖色烟柱：三层由浓到淡
    const hh = 120 + 40 * pulse;
    for (let k = 0; k < 3; k++) {
      const spread = 12 + k * 16;
      const tall = hh * (1 - k * 0.22);
      ctx.beginPath();
      ctx.moveTo(v.x - spread * 0.5, v.y - 10);
      ctx.quadraticCurveTo(v.x - spread, v.y - tall * 0.55, v.x - spread * 0.2, v.y - tall);
      ctx.quadraticCurveTo(v.x + spread * 0.9, v.y - tall * 0.55, v.x + spread * 0.5, v.y - 10);
      ctx.closePath();
      ctx.fillStyle = hsl(v.hue, 78, 58, (0.1 - k * 0.025) * pulse);
      ctx.fill();
    }
  }
}
