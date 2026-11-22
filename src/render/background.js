// 背景层：水色渐变、天空、太阳、水面波纹、光柱、焦散、三层视差礁石、浑浊、海雪。
// 这是填充率最重的一层，改动前先跑 tools/bench.mjs。

import { TAU, clamp, lerp, rand, hsl, fbm, noise1 } from '../core/math.js';
import { ctx, W, H } from '../core/viewport.js';
import { palAt } from '../config/zones.js';
import { world, depthM } from '../world/world.js';

export function drawWater(dt) {
  const { cam, time, snow } = world;
  const d = depthM();
  const p = palAt(d);
  const light = clamp(1 - d / 100, 0, 1);
  const lightS = light * light;

  // gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, hsl(p.a[0], p.a[1], p.a[2]));
  g.addColorStop(0.62, hsl(lerp(p.a[0], p.b[0], 0.65), lerp(p.a[1], p.b[1], 0.65), lerp(p.a[2], p.b[2], 0.65)));
  g.addColorStop(1, hsl(p.b[0], p.b[1], p.b[2]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // surface / sky
  const sy = (0 - cam.y) * cam.z + H / 2;
  if (sy > -260) {
    if (sy > 0) {
      const sky = ctx.createLinearGradient(0, 0, 0, sy);
      sky.addColorStop(0, 'rgba(118,192,226,1)');
      sky.addColorStop(0.5, 'rgba(190,240,248,1)');
      sky.addColorStop(1, 'rgba(255,247,216,1)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, Math.min(H, sy));
    }

    // sun glow + core
    const sunX = W * 0.72 - cam.x * 0.04;
    const sunY = sy - Math.min(132, H * 0.18);
    const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.min(W, H) * 0.55);
    sg.addColorStop(0, `rgba(255,255,238,${0.5 * light})`);
    sg.addColorStop(0.16, `rgba(220,255,250,${0.2 * light})`);
    sg.addColorStop(0.5, `rgba(160,250,255,${0.06 * light})`);
    sg.addColorStop(1, 'rgba(150,240,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, Math.max(0, sy + 200));

    const cr = Math.min(W, H) * 0.03;
    const cg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, cr * 2.4);
    cg.addColorStop(0, `rgba(255,255,252,${0.98 * light})`);
    cg.addColorStop(0.3, `rgba(255,250,224,${0.7 * light})`);
    cg.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(sunX, sunY, cr * 2.4, 0, TAU); ctx.fill();

    // sunlight bleeding through the surface
    if (sy > -140) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const refl = ctx.createRadialGradient(sunX, sy + 80, 0, sunX, sy + 80, Math.max(W * 0.3, 240));
      refl.addColorStop(0, `rgba(255,250,225,${0.13 * light})`);
      refl.addColorStop(0.4, `rgba(200,255,245,${0.045 * light})`);
      refl.addColorStop(1, 'rgba(200,255,245,0)');
      ctx.fillStyle = refl;
      ctx.fillRect(0, Math.max(0, sy), W, 280);
      ctx.restore();
    }

    // waterline waves
    if (sy > -80) {
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        const amp = 7 + layer * 6;
        const off = layer * 11;
        for (let x = -10; x <= W + 10; x += 12) {
          const y = sy + off + Math.sin(x * 0.018 + time * (1.1 + layer * 0.3) + layer) * amp
                          + Math.sin(x * 0.006 - time * 0.8 + layer * 2) * amp * 1.3;
          if (x < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(240,255,255,${0.55 - layer * 0.14})`;
        ctx.lineWidth = 2.8 - layer * 0.55;
        ctx.stroke();
      }
      const band = ctx.createLinearGradient(0, sy, 0, sy + 110);
      band.addColorStop(0, 'rgba(230,255,255,.22)');
      band.addColorStop(1, 'rgba(190,255,250,0)');
      ctx.fillStyle = band;
      ctx.fillRect(0, sy, W, 110);
    }
  }

  // god rays
  if (light > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const top = Math.max(-120, sy);
    const count = 6;
    for (let i = 0; i < count; i++) {
      const ph = i * 1.73;
      let x = ((i + 0.5) / count) * W + Math.sin(time * 0.11 + ph) * W * 0.07 - cam.x * 0.06;
      x = ((x % W) + W) % W;
      const w = 46 + 34 * Math.sin(time * 0.28 + ph);
      const len = H * 1.25;
      const slant = 170 + 60 * Math.sin(time * 0.07 + ph);
      const rg = ctx.createLinearGradient(0, top, 0, top + len);
      rg.addColorStop(0, `rgba(190,255,240,${0.085 * lightS})`);
      rg.addColorStop(0.45, `rgba(150,245,255,${0.026 * lightS})`);
      rg.addColorStop(1, 'rgba(130,230,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.14, top);
      ctx.lineTo(x + w * 0.14, top);
      ctx.lineTo(x + slant + w * 0.55, top + len);
      ctx.lineTo(x + slant - w * 0.3, top + len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // caustic shimmer just below the surface
  if (sy > -120 && light > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 5; k++) {
      const yy = sy + 34 + k * 42;
      if (yy < -40 || yy > H + 40) continue;
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 26) {
        const y = yy + Math.sin(x * 0.021 + time * 1.5 + k * 0.9) * 9
                      + Math.cos(x * 0.008 - time * 0.9 + k) * 7;
        if (x < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(210,255,250,${0.07 * light * (1 - k / 6)})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  // distant reefs (three parallax layers)
  const layers = [
    { par: 0.16, amp: 380, base: 1.02, li: 0.44, seed: 2.3, step: 46 },
    { par: 0.32, amp: 250, base: 1.10, li: 0.30, seed: 7.1, step: 34 },
    { par: 0.54, amp: 150, base: 1.19, li: 0.19, seed: 13.7, step: 26 },
  ];
  for (const L of layers) {
    const off = cam.x * L.par;
    const yb = H * L.base + cam.y * 0.018 * L.par;
    ctx.beginPath();
    ctx.moveTo(-90, H + 100);
    for (let sx = -90; sx <= W + 90; sx += L.step) {
      const nx = (sx + off) * 0.0022 + L.seed;
      const n = clamp((fbm(nx, 4) - 0.22) / 0.52, 0, 1);
      const h = Math.pow(n, 1.45) * L.amp
        + Math.sin(nx * 5.1 + L.seed) * L.amp * 0.045
        + (noise1(nx * 14 + L.seed * 3) - 0.5) * L.amp * 0.07;
      ctx.lineTo(sx, yb - h);
    }
    ctx.lineTo(W + 90, H + 100);
    ctx.closePath();
    ctx.fillStyle = hsl(p.a[0] + 6, p.a[1] * 0.62, Math.max(3, p.a[2] * L.li), 0.97);
    ctx.fill();
    ctx.strokeStyle = hsl(p.a[0] + 12, Math.min(60, p.a[1] * 0.5), Math.min(74, p.a[2] * 1.25), 0.14);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // deep murk at the bottom
  const murk = ctx.createLinearGradient(0, H * 0.58, 0, H);
  murk.addColorStop(0, hsl(p.b[0], p.b[1], p.b[2], 0));
  murk.addColorStop(1, hsl(p.b[0], p.b[1], Math.max(4, p.b[2] * 0.72), 0.6));
  ctx.fillStyle = murk;
  ctx.fillRect(0, H * 0.58, W, H * 0.42);

  // marine snow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of snow) {
    s.y += (5 + s.z * 16) * dt;
    s.x += (Math.sin(time * 0.5 + s.z * 20) * 6 - 4 * s.z) * dt;
    if (s.y > H + 5) { s.y = -5; s.x = rand(W); }
    if (s.x > W + 5) s.x = -5;
    if (s.x < -5) s.x = W + 5;
    const px = ((s.x - cam.x * s.z * 0.035) % W + W) % W;
    const py = ((s.y - cam.y * s.z * 0.035) % H + H) % H;
    ctx.fillStyle = `rgba(205,245,255,${0.05 + s.z * 0.13})`;
    const sz = s.s + s.z * 1.2;
    ctx.fillRect(px, py, sz, sz);
  }
  ctx.restore();
}
