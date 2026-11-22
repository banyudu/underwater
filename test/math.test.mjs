// 纯函数单测：不碰 DOM，直接跑。
import test from 'node:test';
import assert from 'node:assert/strict';

import { TAU, clamp, lerp, hash, noise1, fbm, smoothstep, hsl } from '../src/core/math.js';

test('clamp 按上下界夹取', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test('lerp 端点与中点', () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
});

test('smoothstep 端点固定', () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
});

test('hash 恒定且落在 [0,1)', () => {
  for (const n of [0, 1, 2.5, -3.75, 1000.125]) {
    const v = hash(n);
    assert.equal(v, hash(n), '同输入必须同输出');
    assert.ok(v >= 0 && v < 1, `${n} -> ${v}`);
  }
});

test('noise1 连续：相邻采样差值有界', () => {
  let prev = noise1(0);
  for (let x = 0.01; x < 20; x += 0.01) {
    const v = noise1(x);
    assert.ok(v >= 0 && v <= 1, `noise1(${x}) = ${v}`);
    assert.ok(Math.abs(v - prev) < 0.2, `在 ${x} 处发生跳变`);
    prev = v;
  }
});

test('noise1 在整数点收敛到 hash', () => {
  // 整数处 f=0, smoothstep(0)=0, 结果应为 hash(i)
  assert.ok(Math.abs(noise1(3) - hash(3)) < 1e-12);
});

test('fbm 值域与确定性', () => {
  for (let x = -5; x < 5; x += 0.37) {
    const v = fbm(x);
    assert.equal(v, fbm(x));
    assert.ok(v > 0 && v < 1, `fbm(${x}) = ${v}`);
  }
});

test('fbm 八度数越多越接近细节', () => {
  const a = fbm(1.234, 2);
  const b = fbm(1.234, 6);
  assert.notEqual(a, b);
});

test('hsl 输出合法 hsla 字符串，且小数被截断', () => {
  assert.equal(hsl(190.7, 80.2, 55.9), 'hsla(190,80%,55%,1)');
  assert.equal(hsl(10, 20, 30, 0.5), 'hsla(10,20%,30%,0.5)');
});

test('TAU 是 2π', () => {
  assert.equal(TAU, Math.PI * 2);
});
