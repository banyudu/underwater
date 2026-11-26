// 吞噬 / 被咬 / 成长。碰撞判定一律用平方距离，避免开方。

import { clamp } from '../core/math.js';
import { world, depthM } from '../world/world.js';
import { addJelly, relocateFood } from '../world/spawn.js';
import { burst, addText, ring } from '../world/fx.js';
import { sfxEat, sfxHurt, sfxSting } from '../world/audio.js';

export function grow(amount) {
  const player = world.player;
  const damp = 1 - clamp((player.r - 16) / 140, 0, 0.9);
  player.r += Math.max(0, amount) * damp;
  // 有限峡谷宽约 1200，玩家不该长到半屏大——否则会被岩台夹死。
  player.r = Math.min(player.r, 130);
}

export function eatFish(f) {
  const { player } = world;
  const pts = Math.max(3, Math.round((5 + f.r * 1.55) * (1 + depthM() / 170)));
  world.score += pts;
  grow(0.45 + f.r * 0.125);
  addText(f.x, f.y - f.r * 0.9, '+' + pts, '#b8ffee');
  burst(f.x, f.y, 13, f.hue, false);
  burst(f.x, f.y, 5, f.spec.fin[0], true);
  ring(player.x, player.y, player.r * 0.8, player.r * 3.1, 0.5);
  world.shake = Math.max(world.shake, 3.5);
  sfxEat(f.r > 20);
}

export function eatJelly(j) {
  const pts = Math.round(6 + j.r * 1.2);
  world.score += pts;
  grow(0.3 + j.r * 0.06);
  addText(j.x, j.y - j.r, '+' + pts, '#d4c8ff');
  burst(j.x, j.y, 12, j.hue, true);
  ring(j.x, j.y, j.r, j.r * 2.6, 0.6, 'rgba(200,180,255,.5)');
  sfxEat(true);
}

export function collide() {
  const { player, foods, fishes, jellies } = world;
  const pr = player.r;

  // plankton
  const eatR = pr * 0.95 + 7;
  for (const p of foods) {
    const dx = p.x - player.x, dy = p.y - player.y;
    const rr = eatR + p.r;
    if (dx * dx + dy * dy < rr * rr) {
      world.score += p.big ? 2 : 1;
      grow(p.big ? 0.36 : 0.115);
      if (p.big) {
        addText(p.x, p.y - 6, '+2', '#d9ffe2');
        burst(p.x, p.y, 7, p.hue, true);
        sfxEat(false);
      }
      // 出屏重投，不新增对象
      relocateFood(p);
    }
  }

  for (let i = fishes.length - 1; i >= 0; i--) {
    const f = fishes[i];
    const dx = f.x - player.x, dy = f.y - player.y;
    const d2 = dx * dx + dy * dy;
    const reach = pr * 1.02 + f.r * 0.62;
    if (d2 > reach * reach) continue;

    if (pr > f.r * 1.12) {
      eatFish(f);
      fishes.splice(i, 1);
    } else if (f.r > pr * 1.1 && player.invuln <= 0) {
      hurt(f);
    }
  }

  for (let i = jellies.length - 1; i >= 0; i--) {
    const j = jellies[i];
    const dx = j.x - player.x, dy = j.y - player.y;
    const reach = pr + j.r * 0.55;
    if (dx * dx + dy * dy >= reach * reach) continue;

    if (pr > j.r * 0.72) {
      // 够大就能吃：水母是"风险/收益"型食物
      eatJelly(j);
      jellies.splice(i, 1);
      addJelly(false);
    } else if (player.invuln <= 0) {
      // 比它小还去碰，就被蜇——扣得比被咬少，但会有击退
      sting(j);
    }
  }
}

/** 被水母蜇到：伤害比被猎手咬小，但有击退，手感上更像"烫了一下"。 */
export function sting(j) {
  const { player } = world;
  player.invuln = 1.2;
  player.r = Math.max(8.5, player.r * 0.94);
  const a = Math.atan2(player.y - j.y, player.x - j.x);
  player.vx += Math.cos(a) * 190;
  player.vy += Math.sin(a) * 190;
  world.shake = Math.max(world.shake, 6);
  world.flash = Math.max(world.flash, 0.45);
  burst(player.x, player.y, 9, 300, true);
  addText(player.x, player.y - player.r * 1.3, '被蜇了', '#d9c6ff');
  sfxSting();
}

export function hurt(f) {
  const { player } = world;
  player.invuln = 1.9;
  player.r = Math.max(8.5, player.r * 0.855);
  const a = Math.atan2(player.y - f.y, player.x - f.x);
  player.vx += Math.cos(a) * 300;
  player.vy += Math.sin(a) * 300;
  world.shake = 22;
  world.flash = 1;
  burst(player.x, player.y, 22, 2, false);
  addText(player.x, player.y - player.r * 1.4, '被咬了', '#ffb0ba');
  ring(player.x, player.y, player.r, player.r * 3.4, 0.55, 'rgba(255,120,140,.5)');
  sfxHurt();
}
