// 玩法手感的不变量测试。
// 这些断言对应的是"实测出来的问题"，不是假想的需求——调参调过头会在这里报错。
import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDOM, seedRandom } from '../tools/mock-dom.mjs';

installMockDOM({ width: 1440, height: 900, dpr: 2 });
seedRandom(4242);

const { resize } = await import('../src/core/viewport.js');
resize();   // 必须先建立视口尺寸：W/H 为 0 时所有鱼都会被判为离屏回收

const { world } = await import('../src/world/world.js');
const { resetWorld, addFish } = await import('../src/world/spawn.js');
const { updateFish } = await import('../src/systems/fish.js');
const { FISH, PREDATOR, PLAYER } = await import('../src/config/tuning.js');
const { terrainBlocksLine } = await import('../src/world/terrain.js');
const { SPECS } = await import('../src/config/species.js');

function makeFish(over = {}) {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 10, spec: SPECS.clown, key: 'clown',
    hue: 24, lit: 57, phase: 0, seed: 1,
    hunt: 0, giveup: 0, lunge: 0, lungeCd: 1, danger: 0,
    faceDir: 1, pitch: 0, flipT: 0, windup: 0, calm: 0,
    turnCd: 1, cruise: 0, cruiseT: 0,
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
  // 视线遮挡会挡掉追击，这些用例要单独测扑咬/围攻，先把地形清掉
  world.terrain.length = 0;
}

test('巡游的鱼不会来回摆动（朝向翻转率有上界）', () => {
  seedRandom(11);
  resetWorld();
  clearWorld();
  world.mode = 'menu';        // menu 下所有鱼都走巡游分支，不受玩家影响
  world.player.x = 0;
  world.player.y = 660;

  for (let i = 0; i < 40; i++) {
    world.fishes.push(makeFish({
      x: (i % 8) * 130 - 400, y: Math.floor(i / 8) * 150 - 300,
      r: 12, seed: i * 3.7, phase: i,
    }));
  }

  const flips = new Map();
  const seconds = 30;
  for (let i = 0; i < seconds * 60; i++) {
    const before = new Map();
    for (const f of world.fishes) before.set(f, f.faceDir);
    updateFish(1 / 60);
    for (const f of world.fishes) {
      const was = before.get(f);
      if (was !== undefined && was !== f.faceDir) flips.set(f, (flips.get(f) || 0) + 1);
    }
  }

  const total = [...flips.values()].reduce((a, b) => a + b, 0);
  const perFishPerSecond = total / world.fishes.length / seconds;

  assert.ok(
    perFishPerSecond < 0.15,
    `平均每条鱼每秒掉头 ${perFishPerSecond.toFixed(2)} 次，摆动太频繁（应 < 0.15）`,
  );
});

test('朝向翻转有迟滞：速度过慢时不会因 vx 穿零而抖动', () => {
  world.mode = 'menu';
  clearWorld();
  const f = makeFish({ x: 0, y: 0, r: 12, vx: 0, vy: 0, faceDir: 1, flipT: 0 });
  world.fishes.push(f);

  // 构造"几乎静止、vx 在零附近抖动"的状态
  for (let i = 0; i < 120; i++) {
    f.vx = (i % 2 === 0 ? -1 : 1) * (FISH.flipMinSpeed - 4);
    f.vy = 0;
    updateFish(1 / 60);
  }
  assert.equal(f.faceDir, 1, '低速时不应翻转朝向');
});

test('猎手生成时保持安全距离（含贴水面的边界情况）', () => {
  seedRandom(7);
  world.mode = 'play';
  world.player.x = 0;
  world.player.r = 24;

  for (const playerY of [112, 300, 660, 2000]) {
    world.player.y = playerY;
    for (let i = 0; i < 600; i++) {
      world.fishes.length = 0;
      addFish(false);
      const f = world.fishes[0];
      if (!f.spec.pred) continue;
      const d = Math.hypot(f.x - world.player.x, f.y - world.player.y);
      assert.ok(
        d >= PREDATOR.spawnSafeDist - 1,
        `玩家在 y=${playerY} 时猎手生成距离 ${d.toFixed(1)} < ${PREDATOR.spawnSafeDist}`,
      );
    }
  }
});

test('刚出生的猎手有冷静期，不会立刻追击', () => {
  seedRandom(3);
  world.mode = 'play';
  resetWorld();
  clearWorld();
  world.player.x = 0;
  world.player.y = 660;
  world.player.r = 24;

  const hunter = makeFish({
    x: 120, y: 660, r: 40, spec: SPECS.shark, key: 'shark',
    calm: PREDATOR.spawnGrace, danger: 0, giveup: 0,
  });
  world.fishes.push(hunter);

  updateFish(1 / 60);
  assert.equal(hunter.danger, 0, '冷静期内不应标记为追击状态');

  // 冷静期过后才允许追击
  for (let i = 0; i < Math.ceil(PREDATOR.spawnGrace * 60) + 5; i++) updateFish(1 / 60);
  assert.equal(hunter.danger, 1, '冷静期结束后应开始追击');
});

test('同时追击的猎手数量有上限（避免围殴）', () => {
  seedRandom(5);
  world.mode = 'play';
  resetWorld();
  clearWorld();
  world.player.x = 0;
  world.player.y = 660;
  world.player.r = 20;

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    world.fishes.push(makeFish({
      x: Math.cos(a) * 200, y: 660 + Math.sin(a) * 200,
      r: 45, spec: SPECS.shark, key: 'shark', calm: 0,
    }));
  }

  updateFish(1 / 60);
  const hunters = world.fishes.filter(f => f.danger > 0.5).length;
  assert.ok(
    hunters <= PREDATOR.maxHunters,
    `同时追击的猎手 ${hunters} 只，超过上限 ${PREDATOR.maxHunters}`,
  );
});

test('扑咬有前摇：先减速蓄力，再冲刺', () => {
  seedRandom(13);
  world.mode = 'play';
  resetWorld();
  clearWorld();
  world.player.x = 0;
  world.player.y = 660;
  world.player.r = 24;

  const hunter = makeFish({
    x: 150, y: 660, r: 40, spec: SPECS.shark, key: 'shark',
    calm: 0, lungeCd: 0, danger: 1, giveup: 0,
  });
  world.fishes.push(hunter);

  // 第一帧应该进入前摇，而不是直接进入冲刺
  updateFish(1 / 60);
  assert.ok(hunter.windup > 0, '应先进入前摇');
  assert.equal(hunter.lunge, 0, '前摇期间不应已经开始冲刺');

  // 前摇结束后进入冲刺
  for (let i = 0; i < Math.ceil(PREDATOR.windup * 60) + 2; i++) updateFish(1 / 60);
  assert.ok(hunter.lunge > 0 || hunter.giveup > 0, '前摇结束后应进入冲刺或已脱战');
});

test('玩家不加速也跑得掉：扑咬的实际峰值速度低于玩家常态', () => {
  // 注意：名义目标速度 = 基准 × 追击 × 冲刺 会超过玩家常态，
  // 但因为速度是指数平滑逼近的，冲刺只有 0.34s，实际达不到目标值。
  // 所以这里断言的是"实测峰值"，不是标称倍率。
  seedRandom(21);
  world.mode = 'play';
  resetWorld();
  clearWorld();
  world.player.x = 0;
  world.player.y = 660;
  world.player.r = 120;          // 大体型：玩家速度最慢的情况

  world.fishes.push(makeFish({
    x: 150, y: 660, r: 200, spec: SPECS.shark, key: 'shark',
    calm: 0, danger: 0, lungeCd: 0, giveup: 0,
  }));

  let peak = 0;
  let lunged = false;
  for (let i = 0; i < 20 * 60; i++) {
    updateFish(1 / 60);
    const f = world.fishes[0];
    if (!f) break;
    if (f.lunge > 0) {
      lunged = true;
      peak = Math.max(peak, Math.hypot(f.vx, f.vy));
    }
  }

  const slowestPlayer = PLAYER.speed * (1 - 0.16);
  assert.ok(lunged, '这段时间内应该至少扑咬一次');
  assert.ok(
    peak < slowestPlayer,
    `扑咬实测峰值 ${peak.toFixed(0)} px/s 不应超过玩家常态 ${slowestPlayer.toFixed(0)} px/s`,
  );
});

test('一次扑咬结束后会脱战，不会咬完接着咬', () => {
  seedRandom(17);
  world.mode = 'play';
  resetWorld();
  clearWorld();
  world.player.x = 0;
  world.player.y = 660;
  world.player.r = 24;

  const hunter = makeFish({
    x: 120, y: 660, r: 40, spec: SPECS.shark, key: 'shark',
    calm: 0, danger: 1, lunge: 0.05, lungeCd: 0, giveup: 0,
  });
  world.fishes.push(hunter);

  for (let i = 0; i < 30; i++) updateFish(1 / 60);
  assert.ok(hunter.giveup > 0, '扑咬结束后应进入脱战状态');
});

/* ---------------- 视线遮挡 ---------------- */

function aabbOf(parts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of parts) {
    minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r);
    minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r);
  }
  return { minX, minY, maxX, maxY };
}

function addWall(x, y, r) {
  const parts = [{ x, y, r }];
  world.terrain.push({ kind: 'rock', x, y, r, parts, ...aabbOf(parts) });
}

test('地形会挡住两点之间的视线', () => {
  world.terrain.length = 0;
  // 石头正好卡在 (0,0) 与 (400,0) 之间
  addWall(200, 0, 60);

  assert.equal(terrainBlocksLine(0, 0, 400, 0), true, '石头在中间应挡住');
  assert.equal(terrainBlocksLine(0, 0, 120, 0), false, '石头在更远处不该挡住');
  assert.equal(terrainBlocksLine(0, 200, 400, 200), false, '平行错开的视线不该被挡');
});

test('躲到石头后面，猎手感知不到玩家', () => {
  seedRandom(4040);
  world.mode = 'play';
  resetWorld();
  clearWorld();

  world.player.x = 0;
  world.player.y = 660;
  world.player.r = 24;

  // 玩家与猎手之间摆一块大石头
  addWall(160, 660, 90);

  const hunter = makeFish({
    x: 320, y: 660, r: 45, spec: SPECS.shark, key: 'shark',
    calm: 0, danger: 0, giveup: 0, hunt: 0,
  });
  world.fishes.push(hunter);

  for (let i = 0; i < 120; i++) {
    updateFish(1 / 60);
    assert.equal(hunter.danger, 0, `第 ${i} 帧不该进入追击（视线被挡）`);
  }
});

test('视线通畅时猎手会进入追击并拉近距离', () => {
  seedRandom(4141);
  world.mode = 'play';
  resetWorld();
  clearWorld();

  world.player.x = 0;
  world.player.y = 660;
  world.player.r = 24;

  const hunter = makeFish({
    x: 320, y: 660, r: 45, spec: SPECS.shark, key: 'shark',
    calm: 0, danger: 0, giveup: 0, hunt: 0,
  });
  world.fishes.push(hunter);

  const d0 = Math.hypot(hunter.x - world.player.x, hunter.y - world.player.y);
  for (let i = 0; i < 60; i++) updateFish(1 / 60);
  const d1 = Math.hypot(hunter.x - world.player.x, hunter.y - world.player.y);

  assert.equal(hunter.danger, 1, '视线通畅应进入追击');
  assert.ok(d1 < d0 - 20, `追击一秒内应明显拉近: ${d0.toFixed(0)} -> ${d1.toFixed(0)}`);
});

test('追击转向足够灵敏：不会绕着玩家兜大圈', () => {
  seedRandom(5151);
  world.mode = 'play';
  resetWorld();
  clearWorld();

  world.player.x = 0;
  world.player.y = 660;
  world.player.r = 24;

  // 猎手横向掠过，需要快速转向才能咬到
  const hunter = makeFish({
    x: -120, y: 660, vx: 260, vy: 0, r: 45, spec: SPECS.shark, key: 'shark',
    calm: 0, danger: 0, giveup: 0, hunt: 0, lungeCd: 99,
  });
  world.fishes.push(hunter);

  let minDist = Infinity;
  for (let i = 0; i < 90; i++) {
    updateFish(1 / 60);
    minDist = Math.min(minDist, Math.hypot(hunter.x - world.player.x, hunter.y - world.player.y));
  }

  // 1.5 秒内应该能压到很近（否则就是"灵敏度不足"）
  assert.ok(minDist < 90, `追击 1.5 秒最近只到 ${minDist.toFixed(0)}px，转向太钝`);
});
