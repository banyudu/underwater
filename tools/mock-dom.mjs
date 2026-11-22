// 最小 DOM 沙箱：给 Node 里的 bench / 单测提供 canvas 与元素桩。
// 只实现游戏真正用到的接口，不是通用浏览器模拟。

export function installMockDOM({ width = 1440, height = 900, dpr = 2 } = {}) {
  const makeElement = id => {
    const el = {
      id,
      textContent: '',
      title: '',
      offsetWidth: 0,
      style: { setProperty() {}, transform: '', width: '', height: '' },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => makeElement(id + '>child'),
      querySelectorAll: () => [],
      setAttribute() {},
      getAttribute: () => null,
    };
    return el;
  };

  const ctxStub = new Proxy({}, {
    get(_, prop) {
      const noop = () => {};
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return noop;
    },
    set: () => true,
  });

  const elements = new Map();
  const getEl = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  getEl('c').getContext = () => ctxStub;

  const g = globalThis;
  g.window = g;
  g.document = {
    hidden: false,
    body: makeElement('body'),
    getElementById: getEl,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  g.performance = g.performance || { now: () => 0 };
  g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  g.matchMedia = () => ({ matches: false, addEventListener() {} });
  g.requestAnimationFrame = () => 1;
  g.cancelAnimationFrame = () => {};
  g.setTimeout = () => 0;
  g.clearTimeout = () => {};
  g.innerWidth = width;
  g.innerHeight = height;
  g.devicePixelRatio = dpr;
  g.addEventListener = () => {};
  g.removeEventListener = () => {};

  return { getEl };
}

/** 可复现的伪随机源。 */
export function seedRandom(seed = 0x9e3779b9) {
  let s = seed | 0;
  Math.random = () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
