// HUD 与提示。所有写 DOM 的操作集中在这里，且带脏值缓存，不做无用赋值。

import { clamp } from '../core/math.js';
import {
  hudDepth, hudScore, hudBest, hudZone, sizeFill, sizeNum, hintEl, toastEl,
} from '../core/dom.js';
import { ZONES, zoneAt } from '../config/zones.js';
import { world, depthM } from '../world/world.js';
import { sfxChime } from '../world/audio.js';

let hudScoreCache = -1, hudDepthCache = -1, hudSizeCache = -1, hudZoneCache = -1, hudBestCache = -1;

export function updateHUD() {
  const { player } = world;
  const d = Math.round(depthM());
  if (d !== hudDepthCache) { hudDepth.textContent = d; hudDepthCache = d; }
  if (world.score !== hudScoreCache) { hudScore.textContent = world.score; hudScoreCache = world.score; }
  const bestNow = Math.max(world.best, world.score);
  if (bestNow !== hudBestCache) { hudBest.textContent = bestNow; hudBestCache = bestNow; }
  const sr = Math.round(player.r);
  if (sr !== hudSizeCache) {
    sizeNum.textContent = sr;
    sizeFill.style.transform = `scaleX(${clamp((player.r - 8) / 112, 0.05, 1)})`;
    hudSizeCache = sr;
  }
  if (world.zoneIdx !== hudZoneCache) {
    hudZoneCache = world.zoneIdx;
    const z = ZONES[world.zoneIdx] || ZONES[0];
    hudZone.querySelector('span').textContent = z.name;
    hudZone.style.setProperty('--zc', z.color);
  }
  if (d > world.maxDepth) world.maxDepth = d;
}

export function emitZone(silent) {
  const d = depthM();
  const zi = zoneAt(d);
  if (zi === world.zoneIdx) return;
  world.zoneIdx = zi;
  const z = ZONES[zi];
  hudZone.style.setProperty('--zc', z.color);
  hudZone.querySelector('span').textContent = z.name;
  if (!silent && world.mode === 'play') {
    toast(z.name);
    sfxChime();
  }
}

export function toast(txt) {
  toastEl.textContent = txt;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
}

export function useTouchUI() {
  if (world.touchUI) return;
  world.touchUI = true;
  hintEl.textContent = '拖拽引导 · 按住加速 · 吞食更小的生物';
  const spans = document.querySelectorAll('.key span');
  if (spans[0]) spans[0].textContent = '手指滑动';
  if (spans[1]) spans[1].textContent = '按住 屏幕';
}
