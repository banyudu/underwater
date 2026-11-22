// 世界与玩法规则测试。需要 DOM 桩，所以先装沙箱再动态 import 模块。
import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDOM, seedRandom } from '../tools/mock-dom.mjs';

installMockDOM({ width: 1440, height: 900, dpr: 2 });
seedRandom(12345);

const { world, depthM } = await import('../src/world/world.js');
const { resetWorld, fishTarget, foodTarget, jellyTarget } = await import('../src/world/spawn.js');
const { grow, collide } = await import('../src/systems/collision.js');
const { updateCamera } = await import('../src/systems/camera.js');
const { resize } = await import('../src/core/viewport.js');
const { SPECS } = await import('../src/config/species.js');

function makeFish(over = {}) {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 10, spec: SPECS.clown, key: 'clown',
    hue: 24, lit: 57, phase: 0, seed: 1,
    hunt: 0, giveup: 0, lunge: 0, lungeCd: 1, danger: 0, faceDir: 1, pitch: 0,
    ...over,
  };
}

function clearWorld() {
  world.fishes.length = 0;
  world.jellies.length = 0;
  world.foods.length = 0;
  world.parts.length = 0;
  world.texts.length = 0;
  world.rings.length = 0;
  world.bubbles.length = 0;
  world.score = 0;
}

test('resetWorld 把玩家与摄像机复位', () => {
  world.player.x = 999; world.player.y = 5000; world.player.r = 80;
  world.cam.x = 123; world.cam.z = 0.5;
  resetWorld();

  assert.equal(world.player.x, 0);
  assert.equal(world.player.y, 660);
  assert.equal(world.player.vx, 0);
  assert.equal(world.player.r, 24);
  assert.equal(world.player.alive, true);
  assert.equal(world.player.invuln, 2.4);
  assert.equal(world.cam.x, 0);
  assert.equal(world.cam.y, 660);
  assert.equal(world.cam.z, 1.5);
  assert.equal(world.zoneIdx, -1);
  assert.equal(world.maxDepth, 0);
});

test('resetWorld 清空所有特效数组', () => {
  world.parts.push({}); world.texts.push({}); world.rings.push({}); world.bubbles.push({});
  resetWorld();
  assert.equal(world.parts.length, 0);
  assert.equal(world.texts.length, 0);
  assert.equal(world.rings.length, 0);
  assert.equal(world.bubbles.length, 0);
});

test('初始实体数量落在自适应目标内', () => {
  resetWorld();
  assert.equal(world.fishes.length, fishTarget());
  assert.equal(world.jellies.length, jellyTarget());
  assert.equal(world.foods.length, foodTarget());
  assert.ok(world.fishes.length >= 10 && world.fishes.length <= 30);
  assert.ok(world.jellies.length >= 3 && world.jellies.length <= 5);
  assert.ok(world.foods.length >= 55 && world.foods.length <= 170);
});

test('视口变小则实体密度下降', () => {
  innerWidth = 420; innerHeight = 820;
  resize();
  const small = { fish: fishTarget(), food: foodTarget() };

  innerWidth = 2560; innerHeight = 1400;
  resize();
  const big = { fish: fishTarget(), food: foodTarget() };

  assert.ok(small.fish < big.fish, '小鱼缸的鱼应更少');
  assert.ok(small.food < big.food, '小鱼缸的浮游生物应更少');
  assert.ok(small.fish >= 10, '仍有下限');

  // 复原，避免影响后续测试
  innerWidth = 1440; innerHeight = 900;
  resize();
});

test('depthM 把世界坐标换算成米，且不为负', () => {
  world.player.y = 660;
  assert.equal(depthM(), 33);
  world.player.y = -500;
  assert.equal(depthM(), 0);
});

test('体型越大成长越慢（边际递减）', () => {
  world.player.r = 16;
  grow(1);
  const smallGain = world.player.r - 16;

  world.player.r = 100;
  grow(1);
  const bigGain = world.player.r - 100;

  assert.ok(smallGain > bigGain, `小体型应长得更快: ${smallGain} vs ${bigGain}`);
  assert.ok(smallGain <= 1.0000001);
});

test('grow 不会因为负数而缩小', () => {
  world.player.r = 50;
  grow(-10);
  assert.equal(world.player.r, 50);
});

test('collide：玩家吞掉更小的鱼，得分与体型增加', () => {
  resetWorld();
  clearWorld();
  world.mode = 'play';
  world.player.x = 0; world.player.y = 1000; world.player.r = 40; world.player.invuln = 0;

  world.fishes.push(makeFish({ x: 0, y: 1000, r: 10 }));

  collide();

  assert.equal(world.fishes.length, 0, '被吃的鱼应被移除');
  assert.ok(world.score > 0, '应得分');
  assert.ok(world.player.r > 40, '应变大');
});

test('collide：更大的猎人咬伤玩家，触发无敌与缩小', () => {
  resetWorld();
  clearWorld();
  world.mode = 'play';
  world.player.x = 0; world.player.y = 1000; world.player.r = 12; world.player.invuln = 0;

  world.fishes.push(makeFish({ x: 0, y: 1000, r: 30 }));

  collide();

  assert.equal(world.fishes.length, 1, '猎人不会被吃掉');
  assert.ok(world.player.r < 12, '应被咬小');
  assert.ok(Math.abs(world.player.invuln - 1.9) < 1e-9, '应进入无敌');
  assert.ok(world.shake > 0, '应有震屏');
  assert.ok(world.flash > 0, '应有红闪');
});

test('collide：无敌期内不会再被咬', () => {
  resetWorld();
  clearWorld();
  world.mode = 'play';
  world.player.x = 0; world.player.y = 1000; world.player.r = 12; world.player.invuln = 1.0;
  world.fishes.push(makeFish({ x: 0, y: 1000, r: 30 }));

  collide();
  assert.equal(world.player.r, 12, '无敌期内体型不变');
});

test('collide：吃到浮游生物加分并重投', () => {
  resetWorld();
  clearWorld();
  world.mode = 'play';
  world.player.x = 0; world.player.y = 1000; world.player.r = 30;
  world.foods.push({ x: 0, y: 1000, r: 2, big: false, hue: 180, ph: 0 });

  const before = { x: world.foods[0].x, y: world.foods[0].y };
  collide();

  assert.equal(world.foods.length, 1, '浮游生物是重投而非删除');
  assert.ok(world.score >= 1);
  assert.ok(world.foods[0].x !== before.x || world.foods[0].y !== before.y, '应被挪走');
});

test('摄像机随体型拉远，并被夹在 0.7~1.5', () => {
  world.cam.z = 1.5;
  world.player.r = 24;
  for (let i = 0; i < 400; i++) updateCamera(1 / 60);
  assert.ok(Math.abs(world.cam.z - 1.5) < 0.02, `初始应接近 1.5, 实际 ${world.cam.z}`);

  world.player.r = 200;
  for (let i = 0; i < 400; i++) updateCamera(1 / 60);
  assert.ok(world.cam.z <= 1.5 && world.cam.z >= 0.7, `应在夹取范围内, 实际 ${world.cam.z}`);
  assert.ok(world.cam.z < 1.5, '大体型应拉远');
});
