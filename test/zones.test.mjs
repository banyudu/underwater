// 深度色板与海层边界。
import test from 'node:test';
import assert from 'node:assert/strict';

import { PAL, ZONES, palAt, zoneAt } from '../src/config/zones.js';

test('zoneAt 边界归属正确', () => {
  assert.equal(zoneAt(0), 0);
  assert.equal(zoneAt(39.9), 0);
  assert.equal(zoneAt(40), 1);
  assert.equal(zoneAt(119.9), 1);
  assert.equal(zoneAt(120), 2);
  assert.equal(zoneAt(219.9), 2);
  assert.equal(zoneAt(220), 3);
  assert.equal(zoneAt(1e9), 3);
});

test('ZONES 是单调递增的深度带', () => {
  for (let i = 1; i < ZONES.length; i++) {
    assert.ok(ZONES[i].max > ZONES[i - 1].max);
  }
  assert.equal(ZONES.length, 4);
});

test('palAt 在每个停靠点命中原始色值', () => {
  for (const stop of PAL) {
    const { a, b } = palAt(stop.d);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(a[i] - stop.a[i]) < 1e-9, `d=${stop.d} a[${i}]`);
      assert.ok(Math.abs(b[i] - stop.b[i]) < 1e-9, `d=${stop.d} b[${i}]`);
    }
  }
});

test('palAt 在停靠点之间做线性插值', () => {
  const mid = palAt(20); // PAL[0].d=0 与 PAL[1].d=40 的中点
  for (let i = 0; i < 3; i++) {
    const expect = (PAL[0].a[i] + PAL[1].a[i]) / 2;
    assert.ok(Math.abs(mid.a[i] - expect) < 1e-9, `a[${i}]`);
  }
});

test('palAt 超出范围时被夹住，不会外推', () => {
  const deep = palAt(1e6);
  const last = PAL[PAL.length - 1];
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(deep.a[i] - last.a[i]) < 1e-9);
  }
});

test('palAt 结果连续：深度微小变化不产生色跳变', () => {
  let prev = palAt(0);
  for (let d = 1; d <= 500; d += 1) {
    const cur = palAt(d);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(cur.a[i] - prev.a[i]) < 12, `d=${d} 颜色跳变过大`);
    }
    prev = cur;
  }
});
