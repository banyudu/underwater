// 海层与深度色板。深度色在多个停靠点之间做 HSL 插值，避免换层时颜色跳变。

import { lerp, clamp } from '../core/math.js';

export const ZONES = [
  { name: '阳光带', en: 'SUNLIGHT', max: 40,  color: '#8ff6dc' },
  { name: '暮光带', en: 'TWILIGHT', max: 120, color: '#8fb6ff' },
  { name: '午夜带', en: 'MIDNIGHT', max: 220, color: '#b596ff' },
  { name: '深渊带', en: 'ABYSS',    max: 1e9, color: '#ff91a6' },
];

export const PAL = [
  { d: 0,   a: [187, 82, 55], b: [203, 92, 27] },
  { d: 40,  a: [196, 82, 43], b: [211, 90, 18] },
  { d: 120, a: [211, 78, 24], b: [225, 86, 9] },
  { d: 220, a: [228, 74, 12], b: [241, 80, 4] },
  { d: 420, a: [248, 68, 7],  b: [261, 72, 2] },
];

export function palAt(d) {
  let i = 0;
  while (i < PAL.length - 2 && d > PAL[i + 1].d) i++;
  const p = PAL[i], q = PAL[i + 1];
  const t = clamp((d - p.d) / (q.d - p.d), 0, 1);
  return {
    a: [lerp(p.a[0], q.a[0], t), lerp(p.a[1], q.a[1], t), lerp(p.a[2], q.a[2], t)],
    b: [lerp(p.b[0], q.b[0], t), lerp(p.b[1], q.b[1], t), lerp(p.b[2], q.b[2], t)],
  };
}

export function zoneAt(d) {
  for (let i = 0; i < ZONES.length; i++) if (d < ZONES[i].max) return i;
  return 3;
}
