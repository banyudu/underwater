// 底栖生物渲染：螃蟹、海龟。

import { TAU, hsl } from '../core/math.js';
import { ctx } from '../core/viewport.js';
import { world } from '../world/world.js';
import { crabPos } from '../world/benthos.js';

export function drawCrabs() {
  const t = world.time;
  for (const c of world.crabs) {
    const { x, y } = crabPos(c);
    const s = c.size;
    const step = Math.sin(t * 7 + c.ph);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(c.dir, 1);

    // 腿：四条细线，交替抬落
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * s * 0.34;
      const lift = (i % 2 === 0 ? step : -step) * s * 0.28;
      ctx.moveTo(off, s * 0.1);
      ctx.lineTo(off + s * 0.5, s * 0.42 + lift);
      ctx.lineTo(off + s * 0.78, s * 0.5 + lift * 1.4);
    }
    ctx.strokeStyle = 'rgba(255,150,120,.72)';
    ctx.lineWidth = Math.max(0.9, s * 0.11);
    ctx.lineCap = 'round';
    ctx.stroke();

    // 一对钳子
    ctx.beginPath();
    ctx.arc(s * 0.72, -s * 0.18, s * 0.3, 0, TAU);
    ctx.arc(-s * 0.5, -s * 0.14, s * 0.24, 0, TAU);
    ctx.fillStyle = 'rgba(255,132,104,.85)';
    ctx.fill();

    // 甲壳
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.92, s * 0.62, 0, 0, TAU);
    ctx.fillStyle = hsl(8, 68, 54, 0.95);
    ctx.fill();
    // 壳上的高光
    ctx.beginPath();
    ctx.ellipse(-s * 0.12, -s * 0.18, s * 0.5, s * 0.22, -0.2, 0, TAU);
    ctx.fillStyle = 'rgba(255,210,190,.4)';
    ctx.fill();

    // 眼柄
    ctx.beginPath();
    ctx.arc(s * 0.34, -s * 0.42, s * 0.1, 0, TAU);
    ctx.arc(s * 0.56, -s * 0.4, s * 0.1, 0, TAU);
    ctx.fillStyle = 'rgba(20,10,10,.9)';
    ctx.fill();

    ctx.restore();
  }
}

export function drawTurtles() {
  const t = world.time;
  for (const m of world.turtles) {
    const R = m.r;
    const flap = Math.sin(t * 1.4 + m.ph);

    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(m.vx < 0 ? -1 : 1, 1);

    // 四肢鳍：上下缓慢划动
    ctx.fillStyle = hsl(m.hue, 34, 46, 0.9);
    ctx.beginPath();
    ctx.ellipse(R * 0.18, -R * 0.62 - flap * R * 0.1, R * 0.52, R * 0.2, -0.5 + flap * 0.18, 0, TAU);
    ctx.ellipse(R * 0.18, R * 0.62 + flap * R * 0.1, R * 0.52, R * 0.2, 0.5 - flap * 0.18, 0, TAU);
    ctx.ellipse(-R * 0.5, -R * 0.42, R * 0.3, R * 0.14, -0.35, 0, TAU);
    ctx.ellipse(-R * 0.5, R * 0.42, R * 0.3, R * 0.14, 0.35, 0, TAU);
    ctx.fill();

    // 头
    ctx.beginPath();
    ctx.ellipse(R * 0.86, 0, R * 0.28, R * 0.2, 0, 0, TAU);
    ctx.fillStyle = hsl(m.hue, 30, 52, 0.95);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(R * 0.98, -R * 0.06, R * 0.045, 0, TAU);
    ctx.fillStyle = 'rgba(12,26,30,.9)';
    ctx.fill();

    // 龟壳：椭圆 + 内圈纹路
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.92, R * 0.68, 0, 0, TAU);
    ctx.fillStyle = hsl(m.hue, 40, 34, 0.95);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.7, R * 0.5, 0, 0, TAU);
    ctx.fillStyle = hsl(m.hue, 44, 42, 0.85);
    ctx.fill();

    // 壳纹：几块分片
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.5);
    }
    ctx.strokeStyle = hsl(m.hue, 46, 28, 0.5);
    ctx.lineWidth = Math.max(1, R * 0.035);
    ctx.stroke();

    // 壳顶高光
    ctx.beginPath();
    ctx.ellipse(-R * 0.18, -R * 0.22, R * 0.4, R * 0.18, -0.3, 0, TAU);
    ctx.fillStyle = 'rgba(200,255,235,.14)';
    ctx.fill();

    ctx.restore();
  }
}
