// 单帧合成：背景 → 世界空间（食物/生物/玩家/特效）→ 屏幕层。
// 生物按半径排序，小的先画，制造前景遮挡关系。

import { ctx, W, H, DPR } from '../core/viewport.js';
import { world } from '../world/world.js';
import { drawWater } from './background.js';
import { drawKelp, drawMantas, drawShoals, drawVents } from './ambient.js';
import { drawTerrain } from './terrain.js';
import { drawCrabs, drawTurtles } from './benthos.js';
import { drawFood, drawFish, drawJelly, drawPlayer } from './creatures.js';
import { drawFx } from './fx.js';
import { drawOverlay } from './overlay.js';

const drawList = [];

export function render(dt) {
  const { cam, player } = world;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawWater(dt);
  drawKelp();          // 屏幕空间视差层

  const sx = (Math.random() - 0.5) * world.shake;
  const sy = (Math.random() - 0.5) * world.shake;

  ctx.save();
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);

  drawVents();
  drawTerrain();
  drawCrabs();
  drawTurtles();
  drawMantas();
  drawShoals();
  drawFood();

  // depth-sorted creatures
  drawList.length = 0;
  for (const j of world.jellies) drawList.push(j);
  for (const f of world.fishes) drawList.push(f);
  drawList.sort((a, b) => a.r - b.r);
  for (const o of drawList) {
    if (o.spec) drawFish(o);
    else drawJelly(o);
  }

  if (world.mode !== 'over' && player.alive) drawPlayer();
  drawFx();

  ctx.restore();

  drawOverlay();
}
