// 屏幕层：受伤时的红色脉冲。

import { ctx, W, H } from '../core/viewport.js';
import { world } from '../world/world.js';

export function drawOverlay() {
  const flash = world.flash;
  if (flash > 0.01) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, `rgba(255,40,70,${flash * 0.16})`);
    g.addColorStop(0.55, `rgba(255,30,60,${flash * 0.24})`);
    g.addColorStop(1, `rgba(160,0,20,${flash * 0.4})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
