// 世界状态：整个游戏唯一的可变状态容器。
// 之前散在模块顶层的 ~30 个 let 全部收在这里，任何系统都通过 world 读写。

import { store } from '../core/storage.js';

export const world = {
  // 摄像机与玩家
  cam: { x: 0, y: 660, z: 1.5 },
  player: {
    x: 0, y: 660, vx: 0, vy: 0, r: 24,
    dir: 1, pitch: 0, phase: 0, invuln: 0, alive: true, trail: 0,
  },

  // 流程
  mode: 'menu',        // menu | play | paused | over
  time: 0,

  // 计分与反馈
  score: 0,
  best: store.get('abyss.best', 0),
  shake: 0,
  flash: 0,
  deadT: 0,
  overShown: false,
  zoneIdx: -1,
  maxDepth: 0,

  // 实体与特效
  fishes: [],
  jellies: [],
  foods: [],
  parts: [],
  bubbles: [],
  rings: [],
  texts: [],
  snow: [],

  // 环境元素（不参与吃/被吃）
  shoals: [],
  mantas: [],
  vents: [],

  // 触屏标记
  touchUI: false,
};

/** 玩家当前深度（米）。 */
export const depthM = () => Math.max(0, world.player.y / 20);
