// 鱼群 AI：捕食 / 逃跑 / 巡游 + 突袭 + 互相分离 + 离屏回收。

import { clamp, rand, noise1 } from '../core/math.js';
import { FISH, PREDATOR } from '../config/tuning.js';
import { world } from '../world/world.js';
import { addFish, fishTarget } from '../world/spawn.js';
import { viewHW, viewHH } from './view.js';

export function updateFish(dt) {
  const { fishes, player, cam } = world;
  const px = player.x, py = player.y, pr = player.r;
  const hunting = world.mode === 'play';
  let hunters = 0;

  for (const f of fishes) {
    const dx = px - f.x, dy = py - f.y;
    const dist = Math.hypot(dx, dy) || 1;
    const isPred = f.r > pr * 1.12;
    let ax = 0, ay = 0, spd = f.spec.spd;

    f.danger = Math.max(0, f.danger - dt * 1.8);
    const wasLunging = f.lunge > 0;
    f.lunge = Math.max(0, f.lunge - dt);
    f.lungeCd -= dt;
    if (f.calm > 0) f.calm -= dt;
    // 扑咬收尾：强制脱战，避免"咬完接着咬"
    if (wasLunging && f.lunge <= 0) {
      f.giveup = rand(PREDATOR.disengageMin, PREDATOR.disengageMax);
      f.hunt = 0;
    }

    if (hunting && isPred && f.calm <= 0 && hunters < PREDATOR.maxHunters
        && dist < PREDATOR.huntRadius && f.giveup <= 0) {
      hunters++;
      const lead = 0.16;
      const tx = px + player.vx * lead - f.x;
      const ty = py + player.vy * lead - f.y;
      const m = Math.hypot(tx, ty) || 1;
      ax = tx / m; ay = ty / m;
      spd *= PREDATOR.huntSpeedMul;
      f.danger = 1;
      f.hunt += dt;
      if (f.hunt > 6) { f.giveup = 5; f.hunt = 0; }
    } else if (hunting && pr > f.r * 1.12 && dist < 250) {
      ax = -dx / dist; ay = -dy / dist;
      spd *= 1.3;
      f.hunt = Math.max(0, f.hunt - dt * 2);
    } else {
      f.giveup = Math.max(0, f.giveup - dt);
      // 巡游：以水平直线为主 + 缓慢俯仰摆动，换向是"偶发决策"而非每帧重算。
      // 之前每帧用 noise 重算目标角（且乘以 TAU*2），噪声稍动就转几十度，
      // 鱼会不停画圈、来回掉头。现在转向是显式的、低频的。
      f.turnCd -= dt;
      if (f.turnCd <= 0) {
        f.turnCd = rand(FISH.turnEveryMin, FISH.turnEveryMax);
        if (Math.random() < FISH.turnChance) f.faceDir = -f.faceDir;
        f.cruise = rand(-FISH.cruisePitch, FISH.cruisePitch);
      }
      f.cruiseT += dt;
      const pitchOff = f.cruise
        + Math.sin(f.cruiseT * 0.8 + f.seed) * FISH.pitchWave
        + (noise1(f.seed + world.time * 0.3) - 0.5) * FISH.pitchNoise;
      ax = f.faceDir * Math.cos(pitchOff);
      ay = Math.sin(pitchOff) * 0.85;
      spd *= 0.52;
      f.hunt = Math.max(0, f.hunt - dt * 2);
    }

    // 扑咬：前摇（减速 + 红框提示）→ 冲刺 → 冷却
    if (f.windup > 0) {
      f.windup -= dt;
      spd *= PREDATOR.windupSpeedMul;
      if (f.windup <= 0) f.lunge = PREDATOR.lungeDur;
    } else if (f.lunge > 0) {
      spd *= PREDATOR.lungeSpeedMul;
    } else if (hunting && f.calm <= 0 && f.danger > 0.5 && dist < PREDATOR.lungeRadius && f.lungeCd <= 0) {
      f.windup = PREDATOR.windup;
      f.lungeCd = rand(PREDATOR.lungeCdMin, PREDATOR.lungeCdMax);
      f.danger = 1;
    }

    const k = 1 - Math.exp(-1.9 * dt);
    f.vx += (ax * spd - f.vx) * k;
    f.vy += (ay * spd - f.vy) * k;
    f.vy += Math.sin(world.time * 0.5 + f.seed) * 3 * dt;

    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.y < 128) f.vy += 200 * dt;

    const sp = Math.hypot(f.vx, f.vy);
    if (sp > 18) {
      f.pitch = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 30), -1.02, 1.02);
      // 朝向翻转加迟滞：vx 穿零时立刻镜像会让鱼左右抖动
      const want = f.vx < 0 ? -1 : 1;
      if (sp > FISH.flipMinSpeed && want !== f.faceDir) {
        f.flipT += dt;
        if (f.flipT >= FISH.flipHold) { f.faceDir = want; f.flipT = 0; }
      } else {
        f.flipT = 0;
      }
    }
    f.phase += dt * (4 + sp * 0.05);
  }

  // separation so they don't stack
  for (let i = 0; i < fishes.length; i++) {
    const a = fishes[i];
    for (let j = i + 1; j < fishes.length; j++) {
      const b = fishes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = (a.r + b.r) * 0.92;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / d * 0.42;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }
  }

  // recycle off-screen fish
  const hw = viewHW() * 1.9, hh = viewHH() * 1.9;
  for (let i = fishes.length - 1; i >= 0; i--) {
    const f = fishes[i];
    if (Math.abs(f.x - cam.x) > hw || Math.abs(f.y - cam.y) > hh || f.y < 60) {
      fishes.splice(i, 1);
    }
  }
  const ft = fishTarget();
  if (fishes.length < ft) {
    const want = fishes.length < ft * 0.5 ? 5 : 1;
    for (let i = 0; i < want; i++) addFish(false);
  }
}
