// 摄像机：跟随玩家并随体型拉远，带轻微前瞻。

import { lerp, clamp } from '../core/math.js';
import { W, H } from '../core/viewport.js';
import { world } from '../world/world.js';
import { SITE } from '../world/terrain.js';

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

  // 有限地图：视野不能越出潜点边界。视野比地图还宽时就直接居中。
  const hw = W / (2 * cam.z);
  const hh = H / (2 * cam.z);
  const midX = (SITE.left + SITE.right) / 2;
  const midY = (SITE.top + SITE.bottom) / 2;
  if (SITE.right - SITE.left <= hw * 2) cam.x = midX;
  else cam.x = clamp(cam.x, SITE.left + hw, SITE.right - hw);
  if (SITE.bottom - SITE.top <= hh * 2) cam.y = midY;
  else cam.y = clamp(cam.y, SITE.top + hh, SITE.bottom - hh);
}
