// 物种表：纯数据。h/s/l = HSL，fin = 鳍色，pat = 花纹类型，
// spd = 基准速度，teeth/lure/pred/glow = 特征开关。

export const SPECS = {
  clown:     { h: 24,  s: 88, l: 57, fin: [44, 96, 63],  pat: 1, spd: 152 },
  cyan:      { h: 186, s: 82, l: 61, fin: [188, 90, 72], pat: 0, spd: 168 },
  lemon:     { h: 48,  s: 92, l: 63, fin: [42, 96, 67],  pat: 2, spd: 158 },
  rose:      { h: 332, s: 72, l: 67, fin: [336, 82, 76], pat: 1, spd: 142 },
  jade:      { h: 152, s: 52, l: 57, fin: [150, 66, 68], pat: 2, spd: 150 },
  glow:      { h: 268, s: 64, l: 69, fin: [282, 84, 78], pat: 0, spd: 122, glow: [272, 90, 72] },
  barracuda: { h: 16,  s: 62, l: 48, fin: [18, 82, 56],  pat: 0, spd: 212, teeth: 1, pred: 1 },
  shark:     { h: 208, s: 26, l: 33, fin: [210, 30, 41], pat: 0, spd: 226, teeth: 1, pred: 1 },
  angler:    { h: 196, s: 40, l: 43, fin: [200, 60, 53], pat: 0, spd: 178, teeth: 1, pred: 1, lure: 1, glow: [194, 95, 74] },
};

export const PLAYER_SPEC = { h: 190, s: 36, l: 78, fin: [37, 96, 63], pat: 1, spd: 350, hero: 1 };

export const FOOD_KEYS = ['clown', 'cyan', 'lemon', 'rose', 'jade'];
export const DEEP_FOOD = ['cyan', 'glow', 'rose'];
export const PRED_KEYS = ['barracuda', 'shark'];
export const DEEP_PRED = ['angler', 'shark'];
