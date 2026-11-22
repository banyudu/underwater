// 流程：菜单 / 游戏中 / 暂停 / 结束，以及键盘语义与 UI 绑定。
// 这是唯一允许修改 world.mode 的模块。

import { keys, pointer } from '../core/input.js';
import { store } from '../core/storage.js';
import {
  $, menuEl, overEl, pauseEl, muteBtn, hintEl, hudBest, hudScore, hudDepth,
  overDepth, overScore, overBest,
} from '../core/dom.js';
import { world } from '../world/world.js';
import { resetWorld } from '../world/spawn.js';
import { burst, ring } from '../world/fx.js';
import { audioInit, setMuted, muted, sfxStart, sfxDeath } from '../world/audio.js';
import { emitZone, toast } from '../systems/hud.js';

export function startGame() {
  audioInit();
  sfxStart();
  resetWorld();
  world.score = 0;
  world.shake = 0; world.flash = 0; world.deadT = 0; world.overShown = false;
  world.mode = 'play';
  pointer.down = false;
  pointer.active = false;
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  document.body.classList.add('playing');
  hudBest.textContent = world.best;
  hudScore.textContent = '0';
  hudDepth.textContent = '33';
  hintEl.classList.remove('gone');
  setTimeout(() => { hintEl.classList.add('gone'); }, 9000);
  emitZone(true);
  toast('阳光带');
}

export function die() {
  if (world.mode !== 'play') return;
  const { player } = world;
  world.mode = 'over';
  player.alive = false;
  world.deadT = 0.95;
  world.shake = 30; world.flash = 1;
  burst(player.x, player.y, 44, 190, false);
  burst(player.x, player.y, 26, 28, false);
  ring(player.x, player.y, player.r, player.r * 7, 1.1, 'rgba(190,255,250,.6)');
  sfxDeath();
  if (world.score > world.best) { world.best = world.score; store.set('abyss.best', world.best); }
  document.body.classList.remove('playing');
}

export function showOver() {
  if (world.overShown) return;
  world.overShown = true;
  overDepth.textContent = Math.round(world.maxDepth);
  overScore.textContent = world.score;
  overBest.textContent = world.best;
  overEl.classList.remove('hidden');
}

export function togglePause(force) {
  if (world.mode === 'play') {
    world.mode = 'paused';
    pauseEl.classList.remove('hidden');
    keys.clear();
  } else if (world.mode === 'paused' && !force) {
    world.mode = 'play';
    pauseEl.classList.add('hidden');
    audioInit();
  }
}

export function toMenu() {
  world.mode = 'menu';
  resetWorld();
  overEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  document.body.classList.remove('playing');
}

/** 键盘语义。原始按键记录已在 core/input.js 完成。 */
export function handleKey(k) {
  if (world.mode === 'menu' && (k === 'enter' || k === ' ')) { startGame(); return; }
  if ((k === 'escape' || k === 'p') && (world.mode === 'play' || world.mode === 'paused')) { togglePause(); return; }
  if (k === 'm') { setMuted(!muted); return; }
  if (world.mode === 'over' && k === 'enter' && world.overShown) startGame();
}

/** 绑定按钮与生命周期事件。 */
export function bindUI() {
  $('go').addEventListener('click', startGame);
  menuEl.addEventListener('click', () => { if (world.mode === 'menu') startGame(); });
  $('restart').addEventListener('click', startGame);
  $('toMenu').addEventListener('click', toMenu);
  $('resume').addEventListener('click', () => togglePause());
  muteBtn.addEventListener('click', e => {
    e.stopPropagation();
    audioInit();
    setMuted(!muted);
  });

  window.addEventListener('blur', () => {
    keys.clear();
    pointer.down = false;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.mode === 'play') togglePause();
  });
  window.addEventListener('contextmenu', e => e.preventDefault());
}
