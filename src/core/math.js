// 纯数学工具。无 DOM、无状态，可直接单测。

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export const hsl = (h, s, l, a = 1) => `hsla(${h | 0},${s | 0}%,${l | 0}%,${a})`;

export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const smoothstep = x => x * x * (3 - 2 * x);

export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  return lerp(hash(i), hash(i + 1), smoothstep(f));
}

export function fbm(x, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += noise1(x * f + i * 31.7) * a; a *= 0.5; f *= 2.03; }
  return v;
}
