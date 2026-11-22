// 实时合成音频：没有音频采样文件，全部由 WebAudio 现场生成。

import { store } from '../core/storage.js';
import { rand } from '../core/math.js';
import { muteBtn } from '../core/dom.js';
import { world } from './world.js';

let AC = null, master = null;
export let muted = store.get('abyss.muted', false);
let lastEatSound = 0;

function noiseBuffer(sec) {
  const n = Math.floor(AC.sampleRate * sec);
  const b = AC.createBuffer(1, n, AC.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.4;
  }
  return b;
}

export function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  master = AC.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(AC.destination);

  // ambient underwater rumble
  const src = AC.createBufferSource();
  src.buffer = noiseBuffer(4);
  src.loop = true;
  const lp = AC.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 330; lp.Q.value = 0.7;
  const ag = AC.createGain(); ag.gain.value = 0.32;
  src.connect(lp); lp.connect(ag); ag.connect(master);
  const lfo = AC.createOscillator(); lfo.frequency.value = 0.07;
  const lg = AC.createGain(); lg.gain.value = 120;
  lfo.connect(lg); lg.connect(lp.frequency);
  src.start(); lfo.start();

  // deep drone
  const o1 = AC.createOscillator(); o1.type = 'sine'; o1.frequency.value = 47;
  const o2 = AC.createOscillator(); o2.type = 'sine'; o2.frequency.value = 47.6;
  const dg = AC.createGain(); dg.gain.value = 0.035;
  o1.connect(dg); o2.connect(dg); dg.connect(master);
  o1.start(); o2.start();
}

function blip(freq, dur, type, vol, slide) {
  if (!AC || muted) return;
  const t0 = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.03);
}

function noiseHit(dur, vol, f0, f1) {
  if (!AC || muted) return;
  const t0 = AC.currentTime;
  const src = AC.createBufferSource();
  src.buffer = noiseBuffer(Math.max(0.2, dur));
  const bp = AC.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(f0, t0);
  bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

export function sfxEat(big) {
  if (!AC) return;
  const now = performance.now();
  if (now - lastEatSound < 55) return;
  lastEatSound = now;
  blip(460 + rand(0, 120) + Math.min(380, world.player.r * 7), big ? 0.16 : 0.08, 'triangle', big ? 0.16 : 0.09, big ? 320 : 150);
  if (big) blip(880 + rand(0, 200), 0.14, 'sine', 0.07, 120);
}

export function sfxHurt() {
  if (!AC) return;
  blip(150, 0.4, 'sawtooth', 0.18, -105);
  noiseHit(0.3, 0.22, 420, 90);
}

export function sfxChime() {
  if (!AC) return;
  blip(523, 0.5, 'sine', 0.06, 0);
  setTimeout(() => blip(784, 0.7, 'sine', 0.05, 0), 130);
}

export function sfxDeath() {
  if (!AC) return;
  blip(190, 1.2, 'sawtooth', 0.16, -150);
  noiseHit(0.9, 0.24, 300, 40);
}

export function sfxStart() {
  if (!AC) return;
  blip(160, 0.9, 'sine', 0.1, 220);
  noiseHit(0.7, 0.08, 200, 900);
}

export function setMuted(m) {
  muted = m;
  store.set('abyss.muted', m);
  if (master && AC) master.gain.setTargetAtTime(m ? 0 : 0.5, AC.currentTime, 0.05);
  muteBtn.classList.toggle('off', m);
  muteBtn.textContent = m ? '∿' : '∿';
  muteBtn.title = m ? '开启声音 (M)' : '静音 (M)';
}
