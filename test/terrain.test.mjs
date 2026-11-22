// 地形碰撞与水母蜇人。
import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDOM, seedRandom } from '../tools/mock-dom.mjs';

installMockDOM({ width: 1440, height: 900, dpr: 2 });
seedRandom(6161);

const { resize } = await import('../src/core/viewport.js');
resize();

const { world } = await import('../src/world/world.js');
const { resetWorld, addJelly } = await import('../src/world/spawn.js');
const { collideTerrain, slideAgainstTerrain, resetTerrain, makeRock, makeCave } = await import('../src/world/terrain.js');
const { collide, sting } = await import('../src/systems/collision.js');
const { updatePlayer } = await import('../src/systems/player.js');
const { pointer } = await import('../src/core/input.js');
const { W, H } = await import('../src/core/viewport.js');
const { SPECS } = await import('../src/config/species.js');

function aabb(parts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of parts) {
    minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
    minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r);
  }
  return { minX, minY, maxX, maxY };
}

/** 造一道固定尺寸的裂缝：两块巨石，中间 gap 宽。 */
function makeCrevice(gap, cr) {
  const parts = [];
  for (const side of [-1, 1]) {
    const innerX = side * (gap / 2 + cr);
    parts.push({ x: innerX, y: 0, r: cr });
  }
  return { kind: 'cave', x: 0, y: 0, r: cr * 2, parts, gap, ...aabb(parts) };
}

test('角色会被礁石推到表面之外', () => {
  world.terrain.length = 0;
  const parts = [{ x: 0, y: 0, r: 80 }];
  world.terrain.push({ kind: 'rock', x: 0, y: 0, r: 80, parts, ...aabb(parts) });

  const hit = collideTerrain(0, 0, 20);
  assert.ok(hit, '石心必然碰撞');
  const dist = Math.hypot(hit.x, hit.y);
  assert.ok(dist >= 99, `应被推到 100 外，实际 ${dist.toFixed(1)}`);

  // 离得远则不碰撞
  assert.equal(collideTerrain(400, 400, 20), null);
});

test('缝隙放得过小体型、挡得住大体型（洞穴是保命机制）', () => {
  const gap = 76, cr = 60;
  world.terrain.length = 0;
  world.terrain.push(makeCrevice(gap, cr));

  // 玩家小的时候：缝中心是空的
  assert.equal(collideTerrain(0, 0, 20), null, 'r=20 应能站在缝里');

  // 长大了：缝就挤不进去了
  const big = collideTerrain(0, 0, 45);
  assert.ok(big, 'r=45 挤不进 76 宽的缝');
});

test('洞穴的缝宽确实来自 gap 字段，而不是碰巧', () => {
  const gap = 76, cr = 60;
  world.terrain.length = 0;
  const cave = makeCrevice(gap, cr);
  world.terrain.push(cave);

  // 刚好能过与刚好过不去，中间应以 gap/2 为界
  assert.equal(collideTerrain(0, 0, gap / 2 - 3), null);
  assert.ok(collideTerrain(0, 0, gap / 2 + 6));
});

test('resetTerrain 不会把石头压在玩家身上', () => {
  seedRandom(31);
  world.mode = 'play';
  resetWorld();
  for (const o of world.terrain) {
    const d = Math.hypot(o.x - world.player.x, o.y - world.player.y);
    assert.ok(
      d > world.player.r * 8,
      `石头离玩家太近: ${d.toFixed(1)}px (kind=${o.kind})`,
    );
  }
});

test('地形数量有界，坐标有限', () => {
  seedRandom(77);
  world.mode = 'play';
  for (let i = 0; i < 400; i++) {
    resetWorld();
    assert.ok(world.terrain.length <= 9, `地形过多: ${world.terrain.length}`);
    for (const o of world.terrain) {
      assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y));
      for (const c of o.parts) {
        assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && c.r > 0);
      }
    }
  }
});

test('碰撞是幂等的：推出去之后再检测就不该再碰撞', () => {
  world.terrain.length = 0;
  const parts = [{ x: 0, y: 0, r: 80 }, { x: 70, y: 0, r: 60 }];
  world.terrain.push({ kind: 'rock', x: 0, y: 0, r: 120, parts, ...aabb(parts) });

  // 从两圆夹角里往外挤，两轮迭代后应稳定
  let x = 20, y = 20;
  for (let i = 0; i < 8; i++) {
    const hit = collideTerrain(x, y, 20);
    if (!hit) break;
    x = hit.x; y = hit.y;
  }
  assert.equal(collideTerrain(x, y, 20), null, '多次迭代后应稳定在表面外');
});

test('水母：比自己大就被蜇，比自己小就能吃', () => {
  resetWorld();
  world.fishes.length = 0;
  world.foods.length = 0;
  world.jellies.length = 0;
  world.terrain.length = 0;
  world.mode = 'play';

  // 玩家很小，水母很大 → 被蜇
  world.player.x = 0; world.player.y = 1000; world.player.r = 12;
  world.player.invuln = 0;
  world.jellies.push({ x: 0, y: 1000, r: 40, hue: 200, ph: 0, vx: 0, vy: 0 });
  collide();
  assert.ok(world.player.r < 12, '被蜇应缩小');
  assert.ok(world.player.invuln > 0, '被蜇应进入无敌');
  assert.equal(world.jellies.length, 1, '大的水母不该被吃掉');

  // 玩家很大，水母很小 → 吃掉
  world.player.r = 60;
  world.player.invuln = 0;
  world.jellies.length = 0;
  world.jellies.push({ x: 0, y: 1000, r: 12, hue: 200, ph: 0, vx: 0, vy: 0 });
  const before = world.score;
  collide();
  assert.ok(world.score > before, '小吃大应该得分');
  assert.equal(world.jellies.length, 1, '吃掉后会补一只');
});

test('被蜇的惩罚比被猎手咬轻', () => {
  resetWorld();
  world.mode = 'play';
  world.player.x = 0; world.player.y = 1000;
  world.player.invuln = 0;

  world.player.r = 50;
  sting({ x: 0, y: 1010 });
  const afterSting = world.player.r;

  world.player.r = 50;
  world.player.invuln = 0;
  sting({ x: 0, y: 1010 });
  const stingLoss = 50 - afterSting;

  // 咬是 *0.855，蜇是 *0.94
  assert.ok(stingLoss < 50 * (1 - 0.855), `蜇的损失 ${stingLoss.toFixed(2)} 应小于咬`);
  void SPECS;
});

test('被塞进地形内部，朝任意方向游都能脱身', () => {
  seedRandom(99);
  world.mode = 'play';
  world.player.x = 0;
  world.player.y = 800;
  resetWorld();

  const dt = 1 / 60;
  let checked = 0;

  for (let trial = 0; trial < 40; trial++) {
    const o = world.terrain[trial % world.terrain.length];
    if (!o) continue;
    checked++;

    // 直接把物体放到地形中心（最坏情况），朝某个方向持续游 4 秒
    const obj = { x: o.x, y: o.y, vx: 0, vy: 0 };
    const angle = (trial / 40) * Math.PI * 2;

    for (let i = 0; i < 240; i++) {
      obj.vx = Math.cos(angle) * 300;
      obj.vy = Math.sin(angle) * 300;
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      slideAgainstTerrain(obj, 20);
    }

    assert.equal(
      collideTerrain(obj.x, obj.y, 20), null,
      `第 ${trial} 次没能从 ${o.kind} 里游出来`,
    );
  }

  assert.ok(checked > 0, '应该至少检查到一个地形');
});

test('从水面出发一定能潜下去，不会被困在水面', () => {
  seedRandom(123);
  world.mode = 'play';
  resetWorld();

  world.player.x = 0;
  world.player.y = 112;
  world.player.vx = 0;
  world.player.vy = 0;
  world.player.r = 24;
  world.cam.x = 0;
  world.cam.y = 112;
  world.cam.z = 1.5;

  pointer.active = true;
  pointer.down = true;
  pointer.touch = false;

  const start = world.player.y;
  for (let i = 0; i < 60 * 20; i++) {
    // 指针锁定在屏幕底部中央 = 一直往下游
    pointer.x = W / 2;
    pointer.y = H - 40;
    world.cam.y = Math.max(world.cam.y, world.player.y);
    updatePlayer(1 / 60);
    if (world.player.y - start > 700) break;
  }

  assert.ok(
    world.player.y - start > 300,
    `20 秒只下潜了 ${(world.player.y - start).toFixed(0)}px，疑似被地形困在水面`,
  );
});
