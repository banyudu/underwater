// 入口：装配所有系统，跑主循环。
// 这里是唯一知道"一帧要做什么"的地方。

import { clamp, rand } from './core/math.js';
import { installInput } from './core/input.js';
import { resize } from './core/viewport.js';
import { hudBest } from './core/dom.js';
import { world } from './world/world.js';
import { buildSnow, resetWorld } from './world/spawn.js';
import { updateAmbient } from './world/ambient.js';
import { addBubble, updateFx } from './world/fx.js';
import { audioInit, setMuted, muted } from './world/audio.js';
import { updatePlayer } from './systems/player.js';
import { updateFish } from './systems/fish.js';
import { updateJellies } from './systems/jelly.js';
import { updateFoods } from './systems/plankton.js';
import { updateCamera } from './systems/camera.js';
import { collide } from './systems/collision.js';
import { updateHUD, emitZone, useTouchUI } from './systems/hud.js';
import { die, showOver, bindUI, handleKey } from './game/flow.js';
import { render } from './render/scene.js';

export function update(dt) {
  const { player } = world;

  if (world.mode === 'paused') { updateHUD(); return; }

  world.time += dt;
  world.shake *= Math.exp(-5.2 * dt);
  world.flash *= Math.exp(-3.2 * dt);

  if (world.mode !== 'over') updatePlayer(dt);
  else { player.vx *= 0.98; player.vy *= 0.98; }

  if (world.mode === 'play') {
    collide();
    emitZone(false);
    if (player.r <= 9) die();
  }

  updateFish(dt);
  updateJellies(dt);
  updateFoods(dt);
  updateAmbient(dt);
  updateFx(dt);
  updateCamera(dt);

  if (world.mode === 'over') {
    if (world.deadT > 0) {
      world.deadT -= dt;
      if (world.deadT <= 0) showOver();
    }
  }

  if (world.mode === 'play') {
    // wake bubbles
    if (Math.random() < dt * 0.7 && player.y < 1500) {
      addBubble(player.x + rand(-player.r, player.r), player.y + rand(-player.r, player.r), rand(0.8, 2));
    }
  }

  updateHUD();
}

/* ---------- boot ---------- */

resize();
buildSnow();

if (window.matchMedia && matchMedia('(pointer: coarse)').matches) useTouchUI();

resetWorld();
world.cam.y = world.player.y;
hudBest.textContent = world.best;
setMuted(muted);
updateHUD();

bindUI();

installInput({
  onDown() { audioInit(); },
  onKeyDown(k) { handleKey(k); },
});

let lastT = performance.now();
function frame(now) {
  const dt = clamp((now - lastT) / 1000, 0.001, 0.05);
  lastT = now;
  update(dt);
  render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
