// 手感调参：数值集中在这里，改参数不用翻逻辑代码。
// 每一项都对应一次实测（诊断脚本 + 单测里的不变量）。

export const PLAYER = {
  speed: 352,          // 常态最高速
  boostSpeed: 560,     // 加速最高速
};

export const FISH = {
  // 巡游：直线为主 + 缓慢俯仰摆动，换向是低频的显式决策。
  // 原来每帧用 noise 重算目标角（还乘了 TAU*2），噪声稍动就转几十度，
  // 鱼会不停画圈、来回掉头。
  turnEveryMin: 5,     // 两次换向决策之间的最短间隔（秒）
  turnEveryMax: 11,
  turnChance: 0.35,    // 到点时真的掉头的概率，其余只调整俯仰基准
  cruisePitch: 0.45,   // 俯仰基准的随机范围（弧度）
  pitchWave: 0.22,     // 叠加的正弦摆动幅度
  pitchNoise: 0.3,     // 叠加的噪声摆动幅度

  // 朝向翻转迟滞：vx 穿零时立刻镜像会让鱼左右抖动
  flipHold: 0.22,      // 需要持续这么久才真的翻
  flipMinSpeed: 26,    // 低于这个速度不翻朝向（悬停时不抖）
};

export const PREDATOR = {
  share: 0.12,             // 新生成鱼中捕食者占比（原为 0.20）
  midShare: 0.28,          // 与玩家体型相仿的比例

  huntRadius: 460,
  huntSpeedMul: 1.2,       // 追击速度倍率：仍低于玩家常态，跑得掉

  // 扑咬拆成"前摇 → 冲刺 → 冷却"，给玩家反应窗口
  windup: 0.28,            // 前摇时长，此时减速并亮红框作为提示
  windupSpeedMul: 0.45,
  lungeDur: 0.34,
  lungeSpeedMul: 1.3,      // 冲刺速度：低于玩家常态，不加速也逃得掉
  lungeCdMin: 3.5,
  lungeCdMax: 6.0,         // 原为 2.4~4，拉开间隔以减少连续压迫

  // 同时处于"追击"状态的猎手上限。不设上限时会出现被一圈猎手围殴，
  // 无论怎么操作都在挨咬。
  maxHunters: 2,

  // 一次扑咬结束后强制脱战几秒，给玩家喘息和反击窗口。
  disengageMin: 2.5,
  disengageMax: 4.5,

  spawnSafeDist: 320,      // 生成时离玩家至少这么远
  spawnGrace: 1.6,         // 刚出生的捕食者先"没看见"玩家

  lungeRadius: 250,
};
