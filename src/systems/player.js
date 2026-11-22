// 玩家操控：键鼠 / 指针引导 / 标题页自动巡航。

import { clamp, rand } from '../core/math.js';
import { PLAYER } from '../config/tuning.js';
import { keys, pointer } from '../core/input.js';
import { W, H } from '../core/viewport.js';
import { world } from '../world/world.js';
import { addBubble } from '../world/fx.js';

export function updatePlayer(dt) {
  const player = world.player;
  let ix = 0, iy = 0, boost = false;

  if (world.mode === 'play') {
    if (keys.has('w') || keys.has('arrowup')) iy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) iy += 1;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
    if (keys.has('d') || keys.has('arrowright')) ix += 1;
    const kl = Math.hypot(ix, iy);
    if (kl > 0) { ix /= kl; iy /= kl; }

    if (!ix && !iy && pointer.active) {
      const wx = world.cam.x + (pointer.x - W / 2) / world.cam.z;
      const wy = world.cam.y + (pointer.y - H / 2) / world.cam.z - (pointer.touch ? 64 / world.cam.z : 0);
      const dx = wx - player.x, dy = wy - player.y;
      const dist = Math.hypot(dx, dy);
      const strength = clamp((dist - 12) / 150, 0, 1);
      if (strength > 0.02) { ix = dx / dist * strength; iy = dy / dist * strength; }
    }
    boost = keys.has('space') || keys.has('shift') || pointer.down;
  } else if (world.mode === 'menu') {
    // autopilot for the title screen
    const tx = Math.sin(world.time * 0.14) * 520;
    const ty = 780 + Math.sin(world.time * 0.09 + 1.2) * 300;
    const dx = tx - player.x, dy = ty - player.y;
    const dd = Math.hypot(dx, dy) || 1;
    const st = clamp(dd / 240, 0.25, 1);
    ix = dx / dd * st; iy = dy / dd * st;
    boost = Math.sin(world.time * 0.31) > 0.74;
  }

  const spdMax = (boost ? PLAYER.boostSpeed : PLAYER.speed) * (1 - Math.min(0.16, player.r / 720));
  const k = 1 - Math.exp(-(boost ? 7.5 : 5.5) * dt);
  player.vx += (ix * spdMax - player.vx) * k;
  player.vy += (iy * spdMax - player.vy) * k;

  if (!ix && !iy) {
    const f = Math.exp(-1.5 * dt);
    player.vx *= f; player.vy *= f;
  }

  // gentle current
  player.vx += Math.sin(world.time * 0.23 + 1.7) * 5 * dt;

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  if (player.y < 112) { player.y = 112; if (player.vy < 45) player.vy = 45; }

  const spd = Math.hypot(player.vx, player.vy);
  if (spd > 22) {
    player.dir = player.vx < 0 ? -1 : 1;
    player.pitch = clamp(Math.atan2(player.vy, Math.abs(player.vx) + 42), -1.05, 1.05);
  }
  player.phase += dt * (4.5 + spd * 0.036);
  if (player.invuln > 0) player.invuln -= dt;

  // bubble trail
  player.trail += dt;
  const rate = boost ? 0.055 : 0.17;
  if (spd > 90 && player.trail > rate) {
    player.trail = 0;
    addBubble(player.x - player.dir * player.r * 0.95 + rand(-3, 3), player.y + rand(-3, 3), rand(1.1, boost ? 3.4 : 2.6));
  }
}
