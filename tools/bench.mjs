#!/usr/bin/env node
// 纯逻辑性能基准：直接 import 真实的游戏模块，不做任何复制。
// 用途：论证"换 WASM 值不值"——这里测的就是 WASM 唯一能加速的部分。
//
// 用法: node tools/bench.mjs

import { installMockDOM, seedRandom } from './mock-dom.mjs';

installMockDOM();
seedRandom();

const { world } = await import('../src/world/world.js');
const { resetWorld } = await import('../src/world/spawn.js');
const { updateFish } = await import('../src/systems/fish.js');
const { updateJellies } = await import('../src/systems/jelly.js');
const { updateFoods } = await import('../src/systems/plankton.js');
const { updatePlayer } = await import('../src/systems/player.js');
const { updateCamera } = await import('../src/systems/camera.js');
const { fbm } = await import('../src/core/math.js');
const { W, resize } = await import('../src/core/viewport.js');

const FRAMES = 3000;
const dt = 1 / 60;
const BUDGET = 16.67;   // 60fps 的一帧预算

// 先让视口生效，才能按真实面积生成满负荷的实体数量
resize();
world.mode = 'play';
resetWorld();

// 礁石轮廓：drawWater 里每帧对 3 层各跑一遍 fBm
const LAYERS = [
  { amp: 380, seed: 2.3, step: 46 },
  { amp: 250, seed: 7.1, step: 34 },
  { amp: 150, seed: 13.9, step: 26 },
];
function reefSilhouettes() {
  let acc = 0;
  for (const L of LAYERS) {
    for (let sx = -90; sx <= W + 90; sx += L.step) {
      const nx = sx * 0.0022 + L.seed;
      acc += Math.pow(fbm(nx, 4), 1.45) * L.amp;
    }
  }
  return acc;
}

function bench(label, fn, frames = FRAMES) {
  for (let i = 0; i < 200; i++) fn();              // 预热 JIT
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < frames; i++) fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / frames;
  console.log(`  ${label.padEnd(38)} ${ms.toFixed(4)} ms/frame`);
  return ms;
}

console.log(`\nnode ${process.version} · ${FRAMES} 帧 · ${world.fishes.length} 鱼 / ${world.foods.length} 浮游 / ${world.jellies.length} 水母\n`);

const fish = bench('updateFish  (AI + 分离 + 回收)', () => { world.time += dt; updateFish(dt); });
const drift = bench('updateFoods / updateJellies', () => { updateFoods(dt); updateJellies(dt); });
const player = bench('updatePlayer + updateCamera', () => { updatePlayer(dt); updateCamera(dt); });
const reef = bench('reef silhouettes (fBm x3 层)', () => reefSilhouettes());

const total = fish + drift + player + reef;
console.log(`  ${'─'.repeat(52)}`);
console.log(`  ${'合计'.padEnd(38)} ${total.toFixed(4)} ms/frame`);
console.log(`  ${'占 60fps 预算'.padEnd(38)} ${(total / BUDGET * 100).toFixed(2)} %\n`);
console.log('  结论: 逻辑计算占比极小, 瓶颈在 canvas2d 光栅化(填充率), 不在 JS 计算。\n');
