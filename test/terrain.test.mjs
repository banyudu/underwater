// 地形（海底岩台）碰撞与穿越性，以及水母蜇人。
//
// 这里最关心的不是"某个数值对不对"，而是两条可玩性底线：
//   1. 被塞进地形内部，朝任意方向游都能脱身（不能卡死）
//   2. 沿着岩台往下潜，总能找到缺口继续下潜（不能被封死）
import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDOM, seedRandom } from '../tools/mock-dom.mjs';

installMockDOM({ width: 1440, height: 900, dpr: 2 });
seedRandom(6161);

const { resize } = await import('../src/core/viewport.js');
resize();

const { world } = await import('../src/world/world.js');
const { resetWorld } = await import('../src/world/spawn.js');
const {
  collideTerrain, slideAgainstTerrain, resetTerrain, updateTerrain,
  shelfAt, SHELF_STEP, SHELF_BASE, CREVICE_GAP,
} = await import('../src/world/terrain.js');
const { collide, sting } = await import('../src/systems/collision.js');
const { updatePlayer } = await import('../src/systems/player.js');
const { pointer } = await import('../src/core/input.js');
const { W, H } = await import('../src/core/viewport.js');

function aabb(parts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of parts) {
    minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
    minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r);
  }
  return { minX, minY, maxX, maxY };
}

/** 手工造一道裂缝：两块巨石，中间 gap 宽。 */
function makeCrevice(gap, cr) {
  const parts = [];
  for (const side of [-1, 1]) {
    const innerX = side * (gap / 2 + cr);
    parts.push({ x: innerX, y: 0, r: cr });
  }
  return { kind: 'cave', x: 0, y: 0, r: cr * 2, parts, gap, ...aabb(parts) };
}

/* ---------------- 基础碰撞 ---------------- */

test('物体被推出地形之外', () => {
  world.terrain.length = 0;
  const parts = [{ x: 0, y: 0, r: 80 }];
  world.terrain.push({ kind: 'rock', x: 0, y: 0, r: 80, parts, ...aabb(parts) });

  const hit = collideTerrain(0, 0, 20);
  assert.ok(hit, '石心必然碰撞');
  const dist = Math.hypot(hit.x, hit.y);
  assert.ok(dist >= 99, `应被推到 100 外，实际 ${dist.toFixed(1)}`);

  assert.equal(collideTerrain(400, 400, 20), null);
});

test('碰撞是幂等的：推出去之后不再判定碰撞', () => {
  world.terrain.length = 0;
  const parts = [{ x: 0, y: 0, r: 80 }, { x: 70, y: 0, r: 60 }];
  world.terrain.push({ kind: 'rock', x: 0, y: 0, r: 120, parts, ...aabb(parts) });

  let x = 20, y = 20;
  for (let i = 0; i < 8; i++) {
    const hit = collideTerrain(x, y, 20);
    if (!hit) break;
    x = hit.x; y = hit.y;
  }
  assert.equal(collideTerrain(x, y, 20), null, '多次迭代后应稳定在表面外');
});

/* ---------------- 裂缝：小的能钻，大的进不来 ---------------- */

test('缝隙放得过小体型、挡得住大体型', () => {
  const gap = 76, cr = 60;
  world.terrain.length = 0;
  world.terrain.push(makeCrevice(gap, cr));

  assert.equal(collideTerrain(0, 0, 20), null, 'r=20 应能站在缝里');
  assert.ok(collideTerrain(0, 0, 45), 'r=45 挤不进 76 宽的缝');
});

test('缝宽由 gap 字段决定，不是碰巧', () => {
  const gap = 76, cr = 60;
  world.terrain.length = 0;
  world.terrain.push(makeCrevice(gap, cr));

  assert.equal(collideTerrain(0, 0, gap / 2 - 3), null);
  assert.ok(collideTerrain(0, 0, gap / 2 + 6));
});

/* ---------------- 岩台结构 ---------------- */

test('岩台是横向延伸的海底，不是悬在水里的石头', () => {
  const data = shelfAt(3);
  assert.ok(data, '第 3 层应该有岩台');

  const { shelf, boulders } = data;
  assert.ok(shelf.solids.length >= 1, '应该有实心段');
  assert.ok(shelf.gaps.length >= 2, '每层都要留出下潜缺口');

  // 岩台是一整段横跨的岩体：单段宽度应有相当的跨度
  const widest = Math.max(...shelf.solids.map(([a, b]) => b - a));
  assert.ok(widest > 300, `最宽实心段只有 ${widest.toFixed(0)}px，不像海底`);

  // 石头必须坐在岩台顶面上（圆心不高于顶面），不能悬空
  for (const b of boulders) {
    assert.ok(
      b.y + b.r * 0.5 >= shelf.y - shelf.cr,
      `石头悬空了: 石心 ${b.y.toFixed(0)} vs 台面 ${(shelf.y - shelf.cr).toFixed(0)}`,
    );
  }
});

test('缺口足够宽，且横向分布得开', () => {
  for (let n = 0; n < 40; n++) {
    const data = shelfAt(n);
    if (!data) continue;
    const { gaps } = data.shelf;
    assert.ok(gaps.length >= 2, `第 ${n} 层缺口太少`);

    const total = gaps.reduce((s, g) => s + g.w, 0);
    for (const g of gaps) {
      assert.ok(g.w >= 190, `第 ${n} 层有 ${g.w.toFixed(0)}px 的窄缺口`);
    }
    // 缺口不能全挤在一侧，否则下潜要横穿整屏
    const xs = gaps.map(g => g.x).sort((a, b) => a - b);
    assert.ok(
      xs[xs.length - 1] - xs[0] > 600 || gaps.length >= 3,
      `第 ${n} 层缺口过于集中 (跨度 ${(xs[xs.length - 1] - xs[0]).toFixed(0)}px)`,
    );
    void total;
  }
});

test('岩台生成是确定性的：同一层每次拿到同一份几何', () => {
  const a = shelfAt(7);
  const b = shelfAt(7);
  assert.equal(a, b, '应命中缓存，返回同一对象');

  // 换一个进程内没生成过的层，检查数值稳定
  const c = shelfAt(999);
  const d = shelfAt(999);
  assert.equal(c, d);
});

test('出生点不在地形内部', () => {
  seedRandom(31);
  world.mode = 'play';
  resetWorld();
  const hit = collideTerrain(world.player.x, world.player.y, world.player.r * 0.72);
  assert.equal(hit, null, '开局就卡在岩台里');
});

/* ---------------- 可玩性底线 ---------------- */

test('被塞进地形内部，朝任意方向游都能脱身', () => {
  seedRandom(99);
  world.mode = 'play';
  world.player.x = 0;
  world.player.y = 900;
  resetWorld();

  // 收集所有实心圆作为"最坏情况"的起点
  const spots = [];
  for (const o of world.terrain) {
    for (const c of o.parts) spots.push(c);
  }
  assert.ok(spots.length > 0, '应该有地形');

  const dt = 1 / 60;
  let checked = 0;

  for (let i = 0; i < spots.length; i += Math.max(1, Math.floor(spots.length / 24))) {
    const c = spots[i];
    checked++;
    const obj = { x: c.x, y: c.y, vx: 0, vy: 0 };
    const angle = (i / spots.length) * Math.PI * 2;

    for (let f = 0; f < 240; f++) {
      obj.vx = Math.cos(angle) * 300;
      obj.vy = Math.sin(angle) * 300;
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      slideAgainstTerrain(obj, 20);
    }

    assert.equal(
      collideTerrain(obj.x, obj.y, 20), null,
      `从 (${c.x.toFixed(0)},${c.y.toFixed(0)}) 出发没能脱身`,
    );
  }
  assert.ok(checked >= 8, `只检查了 ${checked} 个位置`);
});

test('沿着岩台往下潜，总能穿过缺口继续下潜', () => {
  seedRandom(2024);
  world.mode = 'play';
  resetWorld();

  world.player.x = 0;
  world.player.y = 660;
  world.player.vx = 0;
  world.player.vy = 0;
  world.player.r = 24;
  world.cam.x = 0;
  world.cam.y = 660;
  world.cam.z = 1.5;

  pointer.active = true;
  pointer.down = true;
  pointer.touch = false;

  const startY = world.player.y;

  for (let i = 0; i < 60 * 40; i++) {
    // 简单的驾驶策略：正下方有岩台就先横向找最近缺口，否则一路向下
    let tx = world.player.x;
    let ty = world.player.y + 300;

    let shelfInWay = null;
    for (const o of world.terrain) {
      if (o.kind !== 'shelf') continue;
      const dy = o.y - world.player.y;
      if (dy > 0 && dy < 520) { shelfInWay = o; break; }
    }

    if (shelfInWay) {
      let bestGap = null, bestD = Infinity;
      for (const g of shelfInWay.gaps) {
        const d = Math.abs(g.x - world.player.x);
        if (d < bestD) { bestD = d; bestGap = g; }
      }
      if (bestGap && bestD > 40) {
        tx = bestGap.x;
        ty = world.player.y + 60;
      } else {
        ty = shelfInWay.y + 260;
      }
    }

    world.cam.y = Math.max(world.cam.y, world.player.y - 200);
    pointer.x = (tx - world.cam.x) * world.cam.z + W / 2;
    pointer.y = (ty - world.cam.y) * world.cam.z + H / 2;

    updatePlayer(1 / 60);
    updateTerrain();

    if (world.player.y - startY > 2000) break;
  }

  assert.ok(
    world.player.y - startY > 1200,
    `40 秒只下潜了 ${(world.player.y - startY).toFixed(0)}px，缺口可能走不通`,
  );
});

test('长时间下潜后地形数量保持有界', () => {
  seedRandom(555);
  world.mode = 'play';
  resetWorld();

  for (let i = 0; i < 300; i++) {
    world.cam.y = 660 + i * 40;
    updateTerrain();
    assert.ok(world.terrain.length < 60, `地形对象过多: ${world.terrain.length}`);
    for (const o of world.terrain) {
      assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y));
      for (const c of o.parts) {
        assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && c.r > 0);
      }
    }
  }
});

test('岩台间距与基准深度是常量，便于调参', () => {
  assert.ok(SHELF_STEP > 400);
  assert.ok(SHELF_BASE > 112, '第一条岩台要在水面之下');
  assert.equal(CREVICE_GAP, 76);
});

/* ---------------- 水母蜇人 ---------------- */

test('水母：比自己大就被蜇，比自己小就能吃', () => {
  resetWorld();
  world.fishes.length = 0;
  world.foods.length = 0;
  world.jellies.length = 0;
  world.terrain.length = 0;
  world.mode = 'play';

  world.player.x = 0; world.player.y = 1000; world.player.r = 12;
  world.player.invuln = 0;
  world.jellies.push({ x: 0, y: 1000, r: 40, hue: 200, ph: 0, vx: 0, vy: 0 });
  collide();
  assert.ok(world.player.r < 12, '被蜇应缩小');
  assert.ok(world.player.invuln > 0, '被蜇应进入无敌');
  assert.equal(world.jellies.length, 1, '大的水母不该被吃掉');

  world.player.r = 60;
  world.player.invuln = 0;
  world.jellies.length = 0;
  world.jellies.push({ x: 0, y: 1000, r: 12, hue: 200, ph: 0, vx: 0, vy: 0 });
  const before = world.score;
  collide();
  assert.ok(world.score > before, '小吃大应该得分');
});

test('被蜇的惩罚比被猎手咬轻', () => {
  resetWorld();
  world.mode = 'play';
  world.player.x = 0; world.player.y = 1000;
  world.player.invuln = 0;

  world.player.r = 50;
  sting({ x: 0, y: 1010 });
  const stingLoss = 50 - world.player.r;

  assert.ok(stingLoss < 50 * (1 - 0.855), `蜇的损失 ${stingLoss.toFixed(2)} 应小于咬`);
});
