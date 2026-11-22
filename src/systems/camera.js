// 摄像机：跟随玩家并随体型拉远，带轻微前瞻。

import { lerp, clamp } from '../core/math.js';
import { H } from '../core/viewport.js';
import { world } from '../world/world.js';

export function updateCamera(dt) {
  const { cam, player } = world;
  const zt = clamp(1.5 - (player.r - 24) * 0.0092, 0.7, 1.5);
  cam.z = lerp(cam.z, zt, 1 - Math.exp(-2.6 * dt));
  const tx = player.x + player.vx * 0.18;
  let ty = player.y + player.vy * 0.14;
  ty = Math.max(ty, H / (2 * cam.z) - 150);
  const k = 1 - Math.exp(-4.2 * dt);
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
}
