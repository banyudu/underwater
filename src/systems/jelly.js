// 水母：缓慢漂移 + 离屏回收。

import { world } from '../world/world.js';
import { addJelly, jellyTarget } from '../world/spawn.js';
import { viewHW, viewHH } from './view.js';

export function updateJellies(dt) {
  const { jellies, cam } = world;
  const hw = viewHW() * 1.8, hh = viewHH() * 1.8;

  for (let i = jellies.length - 1; i >= 0; i--) {
    const j = jellies[i];
    j.ph += dt;
    j.x += (Math.sin(world.time * 0.7 + j.ph) * 13 + j.vx) * dt;
    j.y += (Math.cos(world.time * 0.55 + j.ph * 0.7) * 9 + j.vy) * dt;
    if (Math.abs(j.x - cam.x) > hw || Math.abs(j.y - cam.y) > hh) {
      jellies.splice(i, 1);
      if (jellies.length < jellyTarget()) addJelly(false);
    }
  }
}
