#!/usr/bin/env node
// 等价性验证：让「重构前的旧版」和「构建出的新版」在同一个沙箱里跑同一段剧本，
// 用假 canvas / 假 DOM 录下每一次绘图调用和每一次 DOM 写入，逐帧比对哈希。
//
// 只要每帧的绘图指令（含所有坐标、颜色、混合模式）和 HUD 写入完全一致，
// 就说明这次拆分没有改变任何一帧画面、也没有改变任何一次 DOM 更新。
//
// 用法: node tools/verify-equivalence.mjs [帧数] [--verbose]

import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAMES = Number(process.argv.find(a => /^\d+$/.test(a)) || 240);
const VERBOSE = process.argv.includes('--verbose');

/* ---------------- 假 canvas ---------------- */

const CTX_METHODS = [
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo',
  'arc', 'ellipse', 'rect', 'fill', 'stroke', 'clip',
  'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'setLineDash',
  'save', 'restore', 'translate', 'scale', 'rotate', 'setTransform', 'transform',
];

const CTX_PROPS = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'globalCompositeOperation',
  'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin', 'shadowBlur',
  'shadowColor', 'filter', 'imageSmoothingEnabled',
];

const fmt = v => {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(17);
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === undefined) return 'undef';
  if (v === null) return 'null';
  if (v && v.__gradient) return `grad#${v.__gradient}`;
  return String(v);
};

function makeGradient(id, log) {
  return {
    __gradient: id,
    addColorStop(offset, color) {
      log.push(`stop#${id}(${fmt(offset)},${fmt(color)})`);
    },
  };
}

function makeContext(log) {
  let gradId = 0;
  const props = {};
  const target = {};

  for (const m of CTX_METHODS) {
    target[m] = (...args) => { log.push(`${m}(${args.map(fmt).join(',')})`); };
  }
  target.createLinearGradient = (...args) => {
    const id = ++gradId;
    log.push(`createLinearGradient(${args.map(fmt).join(',')})#${id}`);
    return makeGradient(id, log);
  };
  target.createRadialGradient = (...args) => {
    const id = ++gradId;
    log.push(`createRadialGradient(${args.map(fmt).join(',')})#${id}`);
    return makeGradient(id, log);
  };
  target.measureText = () => ({ width: 10 });
  target.getImageData = () => ({ data: new Uint8ClampedArray(4) });

  for (const p of CTX_PROPS) props[p] = undefined;

  return new Proxy(target, {
    get(t, prop) { return prop in props ? props[prop] : t[prop]; },
    set(t, prop, value) {
      props[prop] = value;
      log.push(`set:${String(prop)}=${fmt(value)}`);
      return true;
    },
  });
}

/* ---------------- 假 WebAudio ---------------- */

function makeAudioNode(kind, push) {
  const target = { __kind: kind };
  target.connect = () => { push(`audio.${kind}.connect`); return proxy; };
  target.disconnect = () => { push(`audio.${kind}.disconnect`); };
  target.start = (...a) => { push(`audio.${kind}.start(${a.map(fmt).join(',')})`); };
  target.stop = (...a) => { push(`audio.${kind}.stop(${a.map(fmt).join(',')})`); };
  target.setValueAtTime = (v, t) => { push(`audio.${kind}.setValueAtTime(${fmt(v)},${fmt(t)})`); };
  target.exponentialRampToValueAtTime = (v, t) => { push(`audio.${kind}.rampExp(${fmt(v)},${fmt(t)})`); };
  target.setTargetAtTime = (v, t, c) => { push(`audio.${kind}.setTarget(${fmt(v)},${fmt(t)},${fmt(c)})`); };

  const proxy = new Proxy(target, {
    set(t, prop, value) {
      t[prop] = value;
      push(`audio.${kind}.${String(prop)}=${typeof value === 'object' ? '<obj>' : fmt(value)}`);
      return true;
    },
  });
  return proxy;
}

function makeAudioContext(push) {
  const makeParam = owner => makeAudioNode(owner, push);
  return {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: makeAudioNode('destination', push),
    createGain() {
      const n = makeAudioNode('gain', push);
      n.gain = makeParam('gainParam');
      return n;
    },
    createOscillator() {
      const n = makeAudioNode('osc', push);
      n.frequency = makeParam('oscFreq');
      return n;
    },
    createBufferSource() {
      const n = makeAudioNode('bufferSource', push);
      n.buffer = null;
      return n;
    },
    createBiquadFilter() {
      const n = makeAudioNode('biquad', push);
      n.frequency = makeParam('filterFreq');
      n.Q = makeParam('filterQ');
      return n;
    },
    createBuffer(channels, len) {
      push(`audio.createBuffer(${channels},${len})`);
      return { getChannelData: () => new Float32Array(len) };
    },
    resume() { push('audio.resume'); },
  };
}

/* ---------------- 假 DOM（记录写入 + 可触发事件） ---------------- */

function makeStyle(id, push) {
  const raw = { transform: '', width: '', height: '' };
  return new Proxy(raw, {
    set(t, prop, value) {
      t[prop] = value;
      push(`style#${id}.${String(prop)}=${fmt(value)}`);
      return true;
    },
    get(t, prop) {
      if (prop === 'setProperty') {
        return (k, v) => { push(`style#${id}.setProperty(${k},${fmt(v)})`); };
      }
      return t[prop];
    },
  });
}

function makeElement(id, push) {
  const listeners = Object.create(null);
  const classes = new Set();
  const state = { textContent: '', title: '', className: '' };

  const classList = {
    add: (...c) => { c.forEach(x => classes.add(x)); push(`class#${id}.add(${c.join(',')})`); },
    remove: (...c) => { c.forEach(x => classes.delete(x)); push(`class#${id}.remove(${c.join(',')})`); },
    toggle: (c, force) => {
      const on = force === undefined ? !classes.has(c) : !!force;
      if (on) classes.add(c); else classes.delete(c);
      push(`class#${id}.toggle(${c},${on})`);
      return on;
    },
    contains: c => classes.has(c),
  };

  const el = {
    id,
    offsetWidth: 0,
    style: makeStyle(id, push),
    classList,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      const arr = listeners[type];
      if (arr) { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); }
    },
    querySelector(sel) { return makeElement(`${id}${sel}`, push); },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
    __fire(type, ev) {
      for (const fn of listeners[type] || []) fn(ev);
    },
    __listeners: listeners,
  };

  Object.defineProperty(el, 'textContent', {
    get: () => state.textContent,
    set: v => { state.textContent = v; push(`text#${id}=${fmt(v)}`); },
  });
  Object.defineProperty(el, 'title', {
    get: () => state.title,
    set: v => { state.title = v; push(`title#${id}=${fmt(v)}`); },
  });
  el.__classes = classes;
  return el;
}

/* ---------------- 跑一个版本 ---------------- */

function runScenario(scriptSource, frames, { touch = false } = {}) {
  const framesCtx = [];   // 每帧的绘图日志
  const framesDom = [];   // 每帧的 DOM 日志
  const framesAudio = []; // 每帧的音频指令
  let ctxLog = [];
  let domLog = [];
  let audioLog = [];

  const ctx = makeContext({ push: line => ctxLog.push(line) });
  const domPush = line => domLog.push(line);   // 闭包，调用时才取当前 domLog
  const audioPush = line => audioLog.push(line);

  const elements = new Map();
  const getEl = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id, domPush));
    return elements.get(id);
  };

  const canvas = getEl('c');
  canvas.getContext = () => ctx;

  const winListeners = Object.create(null);
  const docListeners = Object.create(null);
  const on = store => (type, fn) => { (store[type] ||= []).push(fn); };

  const body = getEl('body');

  let rafCb = null;
  const sandbox = {
    console,
    document: {
      hidden: false,
      body,
      documentElement: getEl('html'),
      getElementById: getEl,
      querySelectorAll: () => [],
      addEventListener: on(docListeners),
      removeEventListener() {},
    },
    performance: { now: () => fakeNow },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: touch, addEventListener() {} }),
    requestAnimationFrame: cb => { rafCb = cb; return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    addEventListener: on(winListeners),
    removeEventListener() {},
    navigator: { userAgent: 'verify' },
  };
  sandbox.AudioContext = function AudioContext() { return makeAudioContext(audioPush); };
  let fakeNow = 0;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(
    `Math.random = (() => { let s = 0x9e3779b9; return () => {
       s |= 0; s = s + 0x6D2B79F5 | 0;
       let t = Math.imul(s ^ s >>> 15, 1 | s);
       t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
       return ((t ^ t >>> 14) >>> 0) / 4294967296;
     }; })();`,
    context,
  );

  const bootStart = Date.now();
  vm.runInContext(scriptSource, context, { filename: 'game.js' });
  const bootMs = Date.now() - bootStart;

  if (typeof rafCb !== 'function') throw new Error('游戏没有启动 requestAnimationFrame 循环');

  const fireWin = (type, ev = {}) => {
    for (const fn of winListeners[type] || []) fn(ev);
  };
  const key = k => ({
    key: k, preventDefault() {}, stopPropagation() {},
  });
  const ptr = (x, y, pointerType = 'mouse') => ({
    clientX: x, clientY: y, pointerType, preventDefault() {}, stopPropagation() {},
  });

  // 同一段剧本：开始游戏 → 指针操控 → 暂停 → 恢复 → 静音 → 继续游
  const actions = {
    1: () => fireWin('pointerdown', ptr(720, 430)),
    2: () => getEl('go').__fire('click', {}),
    10: () => fireWin('pointermove', ptr(900, 380)),
    40: () => fireWin('pointermove', ptr(620, 560)),
    80: () => fireWin('pointermove', ptr(1030, 300)),
    120: () => fireWin('keydown', key('p')),
    140: () => fireWin('keydown', key('p')),
    170: () => fireWin('keydown', key('m')),
    240: () => fireWin('pointermove', ptr(700, 240)),
    320: () => fireWin('keydown', key('ArrowDown')),
    360: () => fireWin('keyup', key('ArrowDown')),
    1900: () => getEl('toMenu').__fire('click', {}),   // 结算 → 回海面
    1950: () => getEl('go').__fire('click', {}),       // 再潜入
  };

  const hashes = [];
  const step = 1000 / 60;

  const pushHash = () => {
    hashes.push(createHash('sha1')
      .update(ctxLog.join('\n'))
      .update('\u0000')
      .update(domLog.join('\n'))
      .update('\u0000')
      .update(audioLog.join('\n'))
      .digest('hex'));
  };

  // 第 0 帧 = 启动阶段（初始世界生成、HUD 初值、静音状态），同样纳入比对
  framesCtx.push(ctxLog);
  framesDom.push(domLog);
  framesAudio.push(audioLog);
  pushHash();

  for (let i = 1; i <= frames; i++) {
    ctxLog = [];
    domLog = [];
    audioLog = [];
    framesCtx.push(ctxLog);
    framesDom.push(domLog);
    framesAudio.push(audioLog);

    const cb = rafCb;
    rafCb = null;
    fakeNow = i * step;
    cb(i * step);
    if (typeof rafCb !== 'function') throw new Error(`第 ${i} 帧后主循环没有继续`);

    if (actions[i]) actions[i]();

    pushHash();
  }

  // 观察覆盖到的状态
  const sawClasses = new Set();
  for (const log of framesDom) {
    for (const line of log) {
      const m = line.match(/^class#([^.]+)\.(add|remove)\((.*)\)$/);
      if (m) sawClasses.add(`${m[1]}:${m[2]}:${m[3]}`);
    }
  }

  return { hashes, framesCtx, framesDom, framesAudio, bootMs, states: [...sawClasses], hint: getEl('hint').textContent, touchUI: !!sandbox.document };
}

function extractScript(html, label) {
  const m = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);
  if (!m) throw new Error(`${label}: 找不到内联脚本`);
  return m[1];
}

/* ---------------- 主流程 ---------------- */

const oldHtml = execFileSync('git', ['show', 'HEAD:index.html'], { cwd: root, encoding: 'utf8' });
const newHtml = await readFile(path.join(root, 'index.html'), 'utf8');

const oldSrc = extractScript(oldHtml, '旧版 index.html');
const newSrc = extractScript(newHtml, '新版 index.html');

console.log(`对比 ${FRAMES} 帧 · 视口 1440x900 @dpr2 · 固定随机种子 · 含 HUD/DOM 写入\n`);

const scenarios = [
  { name: '桌面 · 鼠标/键盘', opts: { touch: false } },
  { name: '移动 · 触屏', opts: { touch: true } },
];

let failed = false;

for (const sc of scenarios) {
  const a = runScenario(oldSrc, FRAMES, sc.opts);
  const b = runScenario(newSrc, FRAMES, sc.opts);

  let firstBad = -1;
  for (let i = 0; i <= FRAMES; i++) {
    if (a.hashes[i] !== b.hashes[i]) { firstBad = i; break; }
  }

  const opsPerFrame = Math.round(a.framesCtx.slice(1).reduce((s, l) => s + l.length, 0) / FRAMES);
  const audioOps = a.framesAudio.reduce((s, l) => s + l.length, 0);
  const domOps = a.framesDom.reduce((s, l) => s + l.length, 0);

  if (firstBad === -1) {
    console.log(`✅ [${sc.name}] 启动阶段 + ${FRAMES}/${FRAMES} 帧完全一致`);
    console.log(`   canvas ${opsPerFrame} 次/帧 · DOM 写入 ${domOps} 次 · 音频指令 ${audioOps} 次`);
    console.log(`   状态切换: ${a.states.join('  ') || '(无)'}`);
    if (VERBOSE) console.log(`   旧版启动 ${a.bootMs}ms / 新版启动 ${b.bootMs}ms · hint="${a.hint}"`);
    continue;
  }

  failed = true;
  console.log(`❌ [${sc.name}] 第 ${firstBad + 1} 帧出现差异（旧 ${a.hashes[firstBad].slice(0, 8)} ≠ 新 ${b.hashes[firstBad].slice(0, 8)}）\n`);

  const show = (label, oldLines, newLines) => {
    console.log(`  ${label}: 旧 ${oldLines.length} / 新 ${newLines.length}`);
    let shown = 0;
    for (let i = 0; i < Math.max(oldLines.length, newLines.length) && shown < 8; i++) {
      if (oldLines[i] !== newLines[i]) {
        console.log(`    行 ${i}:\n      old: ${oldLines[i] ?? '(缺失)'}\n      new: ${newLines[i] ?? '(缺失)'}`);
        shown++;
      }
    }
  };

  show('canvas 指令', a.framesCtx[firstBad], b.framesCtx[firstBad]);
  show('DOM 写入', a.framesDom[firstBad], b.framesDom[firstBad]);
  show('音频指令', a.framesAudio[firstBad], b.framesAudio[firstBad]);
}

process.exit(failed ? 1 : 0);
