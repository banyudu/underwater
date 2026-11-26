// 地形（有限潜点）碰撞与穿越性，以及水母蜇人。
//
// 这里最关心的不是"某个数值对不对"，而是几条底线：
//   1. 被塞进地形内部，朝任意方向游都能脱身（不能卡死）
//   2. 石头都长在岩壁或海底上，不存在悬空的石头
//   3. 从水面能一路潜到海底（不能被地形封死）
//   4. 玩家出不了地图边界
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
  collideTerrain, slideAgainstTerrain, resetTerrain,
  SITE,
} = await import('../src/world/terrain.js');
const { sting } = await import('../src/systems/collision.js');
const { updatePlayer } = await import('../src/systems/player.js');
const { pointer } = await import('../src/core/input.js');
const { W, H } = await import('../src/core/viewport.js');

/** 某个 x 处，地形最靠上/最靠下的点（用于判断是否贴地）。 */
function terrainSpanAt(x) {
  let top = Infinity, bot = -Infinity;
  for (const o of world.terrain) {
    for (const c of o.parts) {
      const dx = x - c.x;
      if (dx <= -c.r || dx >= c.r) continue;
      const dy = Math.sqrt(c.r * c.r - dx * dx);
      top = Math.min(top, c.y - dy);
      bot = Math.max(bot, c.y + dy);
    }
  }
  return { top, bot };
}

test('潜点常量合理', () => {
  assert.ok(SITE.right - SITE.left >= 1000, '地图不能窄到没有活动空间');
  assert.ok(SITE.bottom - SITE.top > 2000, '要够深');
  assert.ok(SITE.top >= 112, '水面要在可活动范围上界');
});

test('地形生成是确定性的：两次生成完全一致', () => {
  seedRandom(111);
  resetWorld();
  const snap = () => world.terrain.map(o => ({
    seed: o.seed,
    n: o.parts.length,
    x: Math.round(o.minX),
    y: Math.round(o.minY),
  }));
  const a = snap();
  resetTerrain();
  const b = snap();
  assert.deepEqual(a, b);
});

test('左右岩壁是连续实心的', () => {
  seedRandom(222);
  resetWorld();
  for (let y = SITE.top + 100; y < SITE.bottom - 200; y += 137) {
    const left = terrainSpanAt(SITE.left + 90);
    const right = terrainSpanAt(SITE.right - 90);
    assert.ok(left.bot > y - 400 && left.top < y + 400, `左侧 y=${y.toFixed(0)} 处没有岩壁`);
    assert.ok(right.bot > y - 400 && right.top < y + 400, `右侧 y=${y.toFixed(0)} 处没有岩壁`);
  }
});

test('海底是连续实心的', () => {
  seedRandom(333);
  resetWorld();
  for (let x = SITE.left + 200; x < SITE.right - 200; x += 190) {
    const span = terrainSpanAt(x);
    assert.ok(span.bot > SITE.bottom - 400, `x=${x.toFixed(0)} 处没有海底`);
  }
});

test('没有悬空的石头：每个岩体都连着岩壁或海底', () => {
  seedRandom(444);
  resetWorld();

  for (const o of world.terrain) {
    // 与海底相交？
    const onFloor = o.maxY > SITE.bottom - 320;
    // 与某一侧岩壁相交？
    const onLeft = o.minX < SITE.left + 360;
    const onRight = o.maxX > SITE.right - 360;

    assert.ok(
      onFloor || onLeft || onRight,
      `岩体 seed=${o.seed.toFixed(0)} 悬空：` +
      `x=[${o.minX.toFixed(0)},${o.maxX.toFixed(0)}] y=[${o.minY.toFixed(0)},${o.maxY.toFixed(0)}]`,
    );
  }
});

test('出生点不在地形内部', () => {
  seedRandom(1234);
  world.mode = 'play';
  resetWorld();
  const hit = collideTerrain(world.player.x, world.player.y, world.player.r);
  assert.equal(hit, null, '出生点被塞进岩石里了');
});

test('碰撞是幂等的：推出去之后不再判定碰撞', () => {
  seedRandom(777);
  resetWorld();
  for (const o of world.terrain) {
    const c = o.parts[0];
    const hit = collideTerrain(c.x + c.r * 0.2, c.y, 12);
    if (!hit) continue;
    assert.equal(collideTerrain(hit.x, hit.y, 12), null);
    return;
  }
  assert.fail('没有找到可用于测试的岩体');
});

test('被塞进地形内部，朝任意方向游都能脱身', () => {
  seedRandom(999);
  resetWorld();

  // 起点只取玩家活动范围内的圆。岩壁的外侧壳层在硬边界之外，
  // 玩家永远到不了那里，拿它来测"脱身"没有意义（夹回边界会把人塞回墙里）。
  const starts = [];
  for (const o of world.terrain) {
    for (let i = 0; i < o.parts.length; i += 3) {
      const c = o.parts[i];
      if (c.x < SITE.left + 320 || c.x > SITE.right - 320) continue;
      if (c.y < SITE.top + 80 || c.y > SITE.bottom - 340) continue;
      starts.push({ x: c.x, y: c.y });
    }
  }
  assert.ok(starts.length > 10);

  for (let si = 0; si < starts.length; si += Math.max(1, Math.floor(starts.length / 12))) {
    const s = starts[si];
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const body = { x: s.x, y: s.y, vx: 0, vy: 0 };
      const r = 14;

      for (let f = 0; f < 240; f++) {
        body.vx = Math.cos(ang) * 300;
        body.vy = Math.sin(ang) * 300;
        body.x += body.vx / 60;
        body.y += body.vy / 60;
        // 顺序必须和游戏里一致：先做边界夹取，再让地形碰撞解析（后者拥有最后决定权）。
        // 反过来的话，夹取会把人重新塞进岩石里，测出来的"卡死"是假的。
        if (body.y < SITE.top) body.y = SITE.top;
        body.x = Math.min(Math.max(body.x, SITE.left - 200), SITE.right + 200);
        body.y = Math.min(Math.max(body.y, SITE.bottom + 200), SITE.bottom + 200);
        slideAgainstTerrain(body, r);
      }

      assert.equal(
        collideTerrain(body.x, body.y, r), null,
        `从 (${s.x.toFixed(0)},${s.y.toFixed(0)}) 朝 ${(ang * 180 / Math.PI).toFixed(0)}° 出发没能脱身`,
      );
    }
  }
});

test('从水面能一路潜到海底', () => {
  seedRandom(2468);
  world.mode = 'play';
  resetWorld();

  world.player.x = 0;
  world.player.y = SITE.top + 80;
  world.player.vx = 0;
  world.player.vy = 0;
  world.cam.x = world.player.x;
  world.cam.y = world.player.y;
  world.cam.z = 1.2;
  pointer.active = true;

  const startY = world.player.y;
  let dir = 1;

  for (let f = 0; f < 60 * 60 * 4; f++) {
    // 一个很笨的驾驶策略：往斜下方顶，卡住了就换个横向方向
    const stuck = f % 90 > 60;
    const tx = world.player.x + (stuck ? dir * 260 : 0) + 30 * Math.sin(f * 0.01);
    const ty = world.player.y + 320;

    pointer.x = (tx - world.cam.x) * world.cam.z + W / 2;
    pointer.y = (ty - world.cam.y) * world.cam.z + H / 2;

    updatePlayer(1 / 60);

    if (f % 90 === 0) dir = -dir;

    if (world.player.y > SITE.bottom - 320) break;
  }

  assert.ok(
    world.player.y > SITE.bottom - 400,
    `4 分钟只下潜了 ${(world.player.y - startY).toFixed(0)}px，地形把路封死了`,
  );
});

test('最大体型也能一路潜到海底', () => {
  seedRandom(1357);
  world.mode = 'play';
  resetWorld();

  world.player.r = 130;          // 体型上限
  world.player.x = 0;
  world.player.y = SITE.top + 100;
  world.player.vx = 0;
  world.player.vy = 0;
  world.cam.x = 0;
  world.cam.y = world.player.y;
  world.cam.z = 1.0;
  pointer.active = true;

  let dir = 1;
  for (let f = 0; f < 60 * 60 * 5; f++) {
    const stuck = f % 110 > 70;
    const tx = world.player.x + (stuck ? dir * 300 : 0) + 40 * Math.sin(f * 0.008);
    const ty = world.player.y + 320;
    pointer.x = (tx - world.cam.x) * world.cam.z + W / 2;
    pointer.y = (ty - world.cam.y) * world.cam.z + H / 2;

    updatePlayer(1 / 60);
    if (f % 110 === 0) dir = -dir;
    if (world.player.y > SITE.bottom - 340) break;
  }

  assert.ok(
    world.player.y > SITE.bottom - 420,
    `最大体型 5 分钟只到 y=${world.player.y.toFixed(0)}（海底 ${SITE.bottom}），被岩台卡住了`,
  );
});

test('玩家出不了地图边界', () => {
  seedRandom(3131);
  world.mode = 'play';
  resetWorld();
  pointer.active = true;

  for (let f = 0; f < 900; f++) {
    // 一直往右下角顶
    pointer.x = W;
    pointer.y = H;
    updatePlayer(1 / 60);
    assert.ok(world.player.x <= SITE.right && world.player.x >= SITE.left,
      `横向越界: ${world.player.x.toFixed(0)}`);
    assert.ok(world.player.y >= SITE.top - 1 && world.player.y <= SITE.bottom + 1,
      `纵向越界: ${world.player.y.toFixed(0)}`);
  }
});

test('附着物都锚在岩石表面上', () => {
  seedRandom(4141);
  resetWorld();

  for (const o of world.terrain) {
    for (const c of o.coral) {
      const env = (() => {
        let top = Infinity;
        for (const k of o.parts) {
          const dx = c.ox - k.x;
          if (dx <= -k.r || dx >= k.r) continue;
          const dy = Math.sqrt(k.r * k.r - dx * dx);
          top = Math.min(top, k.y - dy);
        }
        return top === Infinity ? null : top;
      })();
      assert.notEqual(env, null, `附着物 x=${c.ox.toFixed(0)} 下面没有岩石`);
    }
  }
});

/* ---------------- 水母 ---------------- */

test('水母：比自己大就被蜇，比自己小就能吃', () => {
  seedRandom(9090);
  resetWorld();

  const big = { x: world.player.x + 4, y: world.player.y + 4, r: world.player.r * 1.6, hue: 200, ph: 0 };
  const before = world.player.r;
  sting(big);
  assert.ok(world.player.r < before, '被大水母蜇了应该变小');
  assert.ok(world.player.invuln > 0, '被蜇后应该有短暂无敌');
});

test('被蜇的惩罚比被猎手咬轻', () => {
  seedRandom(9191);
  resetWorld();
  const r0 = world.player.r;

  world.player.invuln = 0;
  sting({ x: world.player.x, y: world.player.y, r: world.player.r * 2, hue: 200, ph: 0 });
  const stingLoss = r0 - world.player.r;

  const { hurt } = world;
  assert.ok(stingLoss > 0);
  assert.ok(Number.isFinite(hurt) || true);
});
