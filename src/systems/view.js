// 视野尺寸：依赖摄像机缩放，按需计算的纯函数。

import { W, H } from '../core/viewport.js';
import { world } from '../world/world.js';

export const viewHW = () => W / (2 * world.cam.z);
export const viewHH = () => H / (2 * world.cam.z);
export const viewArea = () => (W / world.cam.z) * (H / world.cam.z);
