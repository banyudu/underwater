// 浮游生物：随水漂动，出屏后重新投放，数量随视口面积浮动。

import { world } from '../world/world.js';
import { makeFood, relocateFood, foodTarget } from '../world/spawn.js';
import { viewHW, viewHH } from './view.js';

export function updateFoods(dt) {
  const { foods, cam } = world;
  const hw = viewHW() * 1.5, hh = viewHH() * 1.5;

  for (const p of foods) {
    p.x += Math.sin(world.time * 0.75 + p.ph) * 5 * dt;
    p.y += Math.cos(world.time * 0.55 + p.ph) * 4 * dt - 1.5 * dt;
    if (Math.abs(p.x - cam.x) > hw || Math.abs(p.y - cam.y) > hh) relocateFood(p);
  }
  const ft = foodTarget();
  if (foods.length < ft) foods.push(makeFood(false));
  else if (foods.length > ft + 12) foods.pop();
}
