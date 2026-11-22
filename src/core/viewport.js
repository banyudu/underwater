// 画布与窗口尺寸。W/H/DPR 是 live binding：import 方看到的是最新值。

export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d', { alpha: false });

export let W = 0, H = 0, DPR = 1;

const resizeListeners = [];

/** 注册尺寸变化回调（例如重铺海雪）。 */
export function onResize(fn) { resizeListeners.push(fn); }

export function resize() {
  DPR = Math.min(1.5, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  for (const fn of resizeListeners) fn();
}

window.addEventListener('resize', resize);
