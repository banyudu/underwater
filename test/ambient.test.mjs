// 环境元素（鱼群/蝠鲼/热泉）与气泡回收的测试。
import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDOM, seedRandom } from '../tools/mock-dom.mjs';

installMockDOM({ width: 1440, height: 900, dpr: 2 });
seedRandom(8080);

const { resize } = await import('../src/core/viewport.js');
resize();

const { world } = await import('../src/world/world.js');
const { resetWorld } = await import('../src/world/spawn.js');
const { updateAmbient, resetAmbient, shoalTarget, ventTarget } = await import('../src/world/ambient.js');
const { updateFx, addBubble } = await import('../src/world/fx.js');
const { viewHH } = await import('../src/systems/view.js');

const finite = v => Number.isFinite(v);

test('resetAmbient 按目标数量铺满，且坐标都是有限值', () => {
  world.mode = 'play';
  world.player.y = 660;       // 33m
  resetWorld();

  assert.equal(world.shoals.length, shoalTarget());
  assert.ok(world.shoals.length >= 1);
  assert.equal(world.vents.length, ventTarget());

  for (const s of world.shoals) {
    assert.ok(finite(s.x) && finite(s.y));
    assert.ok(s.members.length >= 9 && s.members.length <= 22);
  }
  for (const m of world.mantas) {
    assert.ok(finite(m.x) && finite(m.y) && m.r > 0);
  }
});

test('热泉只在 55m 以下出现', () => {
  world.player.y = 40 * 20;    // 40m：不应有热泉
  resetAmbient();
  assert.equal(ventTarget(), 0);
  assert.equal(world.vents.length, 0);

  world.player.y = 120 * 20;   // 120m：应该有
  resetAmbient();
  assert.ok(ventTarget() >= 1);
  assert.equal(world.vents.length, ventTarget());
});

test('长时间运行后环境元素数量不会失控', () => {
  world.mode = 'play';
  world.player.y = 660;
  resetWorld();

  for (let i = 0; i < 5000; i++) {
    updateAmbient(1 / 60);
    for (const s of world.shoals) {
      assert.ok(finite(s.x) && finite(s.y), `第 ${i} 帧鱼群坐标异常`);
    }
  }

  assert.ok(world.shoals.length <= 3, `鱼群数量失控: ${world.shoals.length}`);
  assert.ok(world.mantas.length <= 2, `蝠鲼数量失控: ${world.mantas.length}`);
  assert.ok(world.vents.length <= 4, `热泉数量失控: ${world.vents.length}`);
});

test('深水区气泡会被回收，不会无限累积', () => {
  world.mode = 'play';
  world.player.y = 4000;       // 200m
  world.cam.y = world.player.y;
  world.bubbles.length = 0;

  // 模拟热泉持续吐泡 60 秒
  for (let i = 0; i < 60 * 60; i++) {
    addBubble(world.player.x + (i % 7) - 3, world.player.y + 40, 2);
    updateFx(1 / 60);
  }

  const cap = world.bubbles.length;
  assert.ok(cap <= 160, `气泡数量 ${cap} 超过上限 160`);

  // 停掉新增后，气泡应能在有限时间内清空（说明回收条件真的成立）
  for (let i = 0; i < 60 * 30; i++) updateFx(1 / 60);
  assert.ok(
    world.bubbles.length < cap * 0.5,
    `停止生成后气泡没有减少: ${cap} -> ${world.bubbles.length}`,
  );
});

test('气泡飘出视野上方就会被回收', () => {
  world.player.y = 4000;
  world.cam.y = 4000;
  world.bubbles.length = 0;

  // 放到视野上方外侧
  const farAbove = world.cam.y - viewHH() * 1.3;
  addBubble(0, farAbove, 2);
  updateFx(1 / 60);
  assert.equal(world.bubbles.length, 0, '视野外上方气泡应被回收');
});
