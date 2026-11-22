// 生物层：鱼、水母、浮游生物、玩家。全部路径在运行时生成，零贴图。

import { TAU, clamp, hsl } from '../core/math.js';
import { ctx } from '../core/viewport.js';
import { PLAYER_SPEC } from '../config/species.js';
import { world, depthM } from '../world/world.js';

/** 鱼身轮廓（单位长度 2、单位高度 ~1.04）。 */
export function bodyPath(g) {
  g.beginPath();
  g.moveTo(1, 0);
  g.bezierCurveTo(0.66, -0.36, 0.12, -0.52, -0.5, -0.36);
  g.bezierCurveTo(-0.63, -0.31, -0.68, -0.18, -0.7, -0.09);
  g.lineTo(-0.7, 0.09);
  g.bezierCurveTo(-0.68, 0.18, -0.63, 0.31, -0.5, 0.36);
  g.bezierCurveTo(0.12, 0.52, 0.66, 0.36, 1, 0);
  g.closePath();
}

export function drawFish(f) {
  const time = world.time;
  const s = f.r;
  const spec = f.spec;
  const sway = Math.sin(f.phase) * 0.16;
  const finCol = hsl(spec.fin[0], spec.fin[1], spec.fin[2], 0.82);
  const deep = clamp((depthM() - 45) / 170, 0, 1);

  ctx.save();
  ctx.translate(f.x, f.y);

  // bioluminescent halo
  if (spec.glow) {
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 3.1);
    gg.addColorStop(0, hsl(spec.glow[0], spec.glow[1], spec.glow[2], 0.12));
    gg.addColorStop(0.32, hsl(spec.glow[0], spec.glow[1], spec.glow[2], 0.04));
    gg.addColorStop(1, hsl(spec.glow[0], spec.glow[1], spec.glow[2], 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, s * 3.1, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.scale(f.faceDir * s, s);
  ctx.rotate(f.pitch);

  // tail
  ctx.beginPath();
  ctx.moveTo(-0.66, 0);
  ctx.quadraticCurveTo(-1.02, -0.18 + sway * 0.4, -1.42, -0.52 + sway);
  ctx.quadraticCurveTo(-1.15, sway * 0.5, -1.42, 0.52 + sway);
  ctx.quadraticCurveTo(-1.02, 0.18 + sway * 0.4, -0.66, 0);
  ctx.closePath();
  ctx.fillStyle = finCol;
  ctx.fill();

  // dorsal fin
  ctx.beginPath();
  ctx.moveTo(0.16, -0.39);
  ctx.quadraticCurveTo(-0.06, -0.8, -0.4, -0.58);
  ctx.quadraticCurveTo(-0.52, -0.44, -0.56, -0.31);
  ctx.closePath();
  ctx.globalAlpha = 0.82;
  ctx.fill();
  ctx.globalAlpha = 1;

  // pectoral fin
  ctx.save();
  ctx.translate(0.24, 0.17);
  ctx.rotate(0.34 + Math.sin(f.phase * 1.4) * 0.22);
  ctx.beginPath();
  ctx.ellipse(-0.1, 0.05, 0.23, 0.095, 0.16, 0, TAU);
  ctx.fillStyle = hsl(spec.fin[0], spec.fin[1], Math.min(92, spec.fin[2] + 13), 0.68);
  ctx.fill();
  ctx.restore();

  // body
  bodyPath(ctx);
  ctx.fillStyle = hsl(f.hue, spec.s, f.lit);
  ctx.fill();

  // body shading + pattern
  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  ctx.fillStyle = hsl(f.hue - 8, spec.s * 0.9, f.lit * 0.52, 0.42);
  ctx.fillRect(-1.25, -0.7, 2.6, 0.73);
  ctx.fillStyle = hsl(f.hue + 12, 62, 89, 0.34);
  ctx.fillRect(-1.25, 0.07, 2.6, 0.6);
  if (spec.pat === 1) {
    ctx.fillStyle = 'rgba(8,28,38,.2)';
    for (let i = 0; i < 3; i++) ctx.fillRect(-0.56 + i * 0.35, -0.62, 0.1, 1.22);
  } else if (spec.pat === 2) {
    ctx.fillStyle = 'rgba(255,255,255,.24)';
    const dots = [[-0.42, -0.18], [-0.04, 0.1], [0.32, -0.16], [-0.18, 0.22], [0.12, -0.03]];
    for (const [x, y] of dots) { ctx.beginPath(); ctx.arc(x, y, 0.072, 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.beginPath();
  ctx.ellipse(0.38, -0.24, 0.32, 0.09, -0.26, 0, TAU);
  ctx.fill();
  ctx.restore();

  // faint rim light, so silhouettes stay readable in the dark
  if (deep > 0.02 || spec.glow) {
    bodyPath(ctx);
    ctx.strokeStyle = `rgba(170,230,255,${0.05 + deep * 0.15})`;
    ctx.lineWidth = 0.018;
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const n = spec.glow ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = -0.34 + i * 0.32;
      const y = 0.03 + Math.sin(i * 2.3 + f.seed) * 0.07;
      ctx.beginPath();
      ctx.arc(x, y, 0.11, 0, TAU);
      ctx.fillStyle = `rgba(150,255,240,${0.05 + deep * 0.09})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 0.042, 0, TAU);
      ctx.fillStyle = `rgba(160,255,245,${0.35 + deep * 0.45})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (f.danger > 0.12) {
    bodyPath(ctx);
    ctx.strokeStyle = `rgba(255,96,112,${0.1 + 0.22 * f.danger})`;
    ctx.lineWidth = 0.03;
    ctx.stroke();
  }

  // mouth line & teeth
  if (spec.teeth) {
    ctx.beginPath();
    ctx.moveTo(0.99, 0.01);
    ctx.quadraticCurveTo(0.64, 0.15, 0.34, 0.11);
    ctx.strokeStyle = 'rgba(4,16,22,.5)';
    ctx.lineWidth = 0.028;
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const x = 0.52 + i * 0.115;
      ctx.moveTo(x, 0.07);
      ctx.lineTo(x + 0.05, 0.2);
      ctx.lineTo(x + 0.1, 0.07);
    }
    ctx.fillStyle = 'rgba(238,255,250,.8)';
    ctx.fill();
  }

  // eye
  const eyeR = spec.pred ? 0.13 : 0.115;
  ctx.beginPath();
  ctx.arc(0.62, -0.14, eyeR, 0, TAU);
  ctx.fillStyle = 'rgba(242,255,252,.92)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.648, -0.14, eyeR * 0.58, 0, TAU);
  ctx.fillStyle = spec.pred ? '#1a0407' : '#071820';
  ctx.fill();
  if (spec.pred) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(0.648, -0.14, eyeR * 0.85, 0, TAU);
    ctx.fillStyle = `rgba(255,64,80,${0.3 + 0.3 * Math.sin(time * 5 + f.seed)})`;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.beginPath();
  ctx.arc(0.668, -0.166, eyeR * 0.22, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fill();

  // angler lure
  if (spec.lure) {
    const lx = 0.86 + Math.sin(time * 1.3 + f.seed) * 0.05;
    ctx.beginPath();
    ctx.moveTo(0.44, -0.36);
    ctx.quadraticCurveTo(0.82, -0.88, lx, -1.26);
    ctx.strokeStyle = 'rgba(200,230,255,.25)';
    ctx.lineWidth = 0.028;
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(lx, -1.28, 0.2, 0, TAU);
    ctx.fillStyle = `rgba(160,255,245,${0.18 + 0.1 * Math.sin(time * 3 + f.seed)})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, -1.28, 0.075, 0, TAU);
    ctx.fillStyle = 'rgba(225,255,250,.95)';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
}

export function drawJelly(j) {
  const time = world.time;
  const r = j.r;
  const pulse = 1 + Math.sin(time * 2.3 + j.ph) * 0.09;

  ctx.save();
  ctx.translate(j.x, j.y);

  const gy = -r * 0.18;
  const grad = ctx.createRadialGradient(0, gy, 0, 0, gy, r * 2.2);
  grad.addColorStop(0, hsl(j.hue, 95, 72, 0.08));
  grad.addColorStop(0.4, hsl(j.hue, 95, 70, 0.022));
  grad.addColorStop(1, hsl(j.hue, 95, 70, 0));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(0, gy, r * 2.2, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.scale(pulse, 1 / pulse);

  // tentacles
  ctx.lineCap = 'round';
  ctx.strokeStyle = hsl(j.hue, 88, 82, 0.42);
  ctx.lineWidth = Math.max(1, r * 0.045);
  for (let i = 0; i < 5; i++) {
    const sx = -r * 0.62 + i * (r * 1.24 / 4);
    ctx.beginPath();
    ctx.moveTo(sx, r * 0.05);
    for (let k = 1; k <= 6; k++) {
      const yy = k * r * 0.42;
      const xx = sx + Math.sin(time * 1.9 + j.ph + k * 0.75 + i) * r * 0.13 * Math.min(k, 3) * 0.6;
      ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }

  // bell
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.bezierCurveTo(-r * 1.03, -r * 1.16, r * 1.03, -r * 1.16, r, 0);
  for (let i = 0; i < 3; i++) {
    const x0 = r - i * (2 * r / 3);
    const x1 = x0 - (2 * r / 3);
    ctx.quadraticCurveTo((x0 + x1) / 2, r * 0.2, x1, 0);
  }
  ctx.closePath();
  ctx.fillStyle = hsl(j.hue, 92, 78, 0.22);
  ctx.fill();
  ctx.strokeStyle = hsl(j.hue, 95, 86, 0.62);
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.stroke();

  // inner rim
  ctx.beginPath();
  ctx.arc(0, -r * 0.1, r * 0.6, Math.PI * 1.08, Math.PI * 1.82);
  ctx.strokeStyle = hsl(j.hue, 95, 88, 0.34);
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();

  // rim lights
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const x = -r * 0.7 + i * (r * 1.4 / 3);
    ctx.beginPath();
    ctx.arc(x, r * 0.01, Math.max(0.8, r * 0.035), 0, TAU);
    ctx.fillStyle = hsl(j.hue, 100, 88, 0.6 + 0.2 * Math.sin(time * 3 + i + j.ph));
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
  ctx.restore();
}

export function drawFood() {
  const time = world.time;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of world.foods) {
    const pulse = 0.55 + 0.45 * Math.sin(time * 3.1 + p.ph);
    ctx.fillStyle = `hsla(${p.hue | 0},100%,68%,${0.035 + 0.05 * pulse})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.6, 0, TAU); ctx.fill();
    ctx.fillStyle = `hsla(${p.hue | 0},100%,${p.big ? 78 : 84}%,${0.4 + 0.45 * pulse})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export function drawPlayer() {
  const time = world.time;
  const player = world.player;
  const r = player.r;
  const spd = Math.hypot(player.vx, player.vy);

  ctx.save();
  ctx.translate(player.x, player.y);

  // halo
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 4.2);
  halo.addColorStop(0, 'rgba(130,255,238,.22)');
  halo.addColorStop(0.35, 'rgba(70,225,255,.075)');
  halo.addColorStop(1, 'rgba(40,160,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, r * 4.2, 0, TAU); ctx.fill();
  // boost wake
  if (spd > 300) {
    const a = Math.atan2(player.vy, player.vx);
    ctx.save();
    ctx.rotate(a);
    const wg = ctx.createLinearGradient(-r * 1.5, 0, -r * 5, 0);
    wg.addColorStop(0, `rgba(160,255,245,${0.10 * clamp((spd - 300) / 260, 0, 1)})`);
    wg.addColorStop(1, 'rgba(160,255,245,0)');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(-r * 1.4, -r * 0.28);
    ctx.lineTo(-r * 5, -r * 0.05);
    ctx.lineTo(-r * 5, r * 0.05);
    ctx.lineTo(-r * 1.4, r * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';

  if (player.invuln > 0 && Math.sin(time * 26) > 0) ctx.globalAlpha = 0.5;

  ctx.scale(player.dir * r, r);
  ctx.rotate(player.pitch);

  const spec = PLAYER_SPEC;
  const sway = Math.sin(player.phase) * 0.18;
  const finCol = hsl(spec.fin[0], spec.fin[1], spec.fin[2], 0.86);

  // tail
  ctx.beginPath();
  ctx.moveTo(-0.66, 0);
  ctx.quadraticCurveTo(-1.02, -0.19 + sway * 0.4, -1.44, -0.55 + sway);
  ctx.quadraticCurveTo(-1.16, sway * 0.5, -1.44, 0.55 + sway);
  ctx.quadraticCurveTo(-1.02, 0.19 + sway * 0.4, -0.66, 0);
  ctx.closePath();
  ctx.fillStyle = finCol;
  ctx.fill();

  // dorsal fin
  ctx.beginPath();
  ctx.moveTo(0.18, -0.4);
  ctx.quadraticCurveTo(-0.04, -0.86, -0.4, -0.6);
  ctx.quadraticCurveTo(-0.54, -0.45, -0.58, -0.31);
  ctx.closePath();
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;

  // pectoral fin
  ctx.save();
  ctx.translate(0.22, 0.18);
  ctx.rotate(0.36 + Math.sin(player.phase * 1.5) * 0.26);
  ctx.beginPath();
  ctx.ellipse(-0.1, 0.04, 0.26, 0.095, 0.18, 0, TAU);
  ctx.fillStyle = hsl(44, 96, 66, 0.7);
  ctx.fill();
  ctx.restore();

  // body
  bodyPath(ctx);
  ctx.fillStyle = hsl(spec.h, spec.s, spec.l);
  ctx.fill();

  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  ctx.fillStyle = hsl(spec.h - 9, 70, 30, 0.45);
  ctx.fillRect(-1.25, -0.72, 2.6, 0.7);
  ctx.fillStyle = hsl(168, 88, 88, 0.5);
  ctx.fillRect(-1.25, 0.08, 2.6, 0.6);
  // stripes
  ctx.fillStyle = 'rgba(6,40,46,.22)';
  for (let i = 0; i < 3; i++) ctx.fillRect(-0.56 + i * 0.35, -0.62, 0.085, 1.24);
  // iridescent streak
  ctx.fillStyle = 'rgba(210,255,250,.22)';
  ctx.beginPath();
  ctx.ellipse(0.4, -0.23, 0.34, 0.08, -0.28, 0, TAU);
  ctx.fill();
  ctx.restore();

  // luminous rim
  bodyPath(ctx);
  ctx.strokeStyle = 'rgba(205,255,250,.6)';
  ctx.lineWidth = 0.03;
  ctx.stroke();

  // eye
  ctx.beginPath();
  ctx.arc(0.62, -0.14, 0.125, 0, TAU);
  ctx.fillStyle = 'rgba(248,255,252,.97)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.648, -0.14, 0.072, 0, TAU);
  ctx.fillStyle = '#061a20';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.67, -0.17, 0.026, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.fill();

  ctx.restore();
}
