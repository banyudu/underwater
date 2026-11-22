// 原始输入状态 + 事件绑定。只管"按了什么"，不判断含义。
// 语义（开始游戏 / 暂停 / 静音）由 game/flow.js 通过 installInput 注入。

export const pointer = {
  x: innerWidth / 2, y: innerHeight / 2,
  down: false, active: false, touch: false,
};

export const keys = new Set();

let handlers = {};

/**
 * @param {{ onDown?: (x:number,y:number,touch:boolean)=>void,
 *           onUp?: ()=>void, onCancel?: ()=>void,
 *           onKeyDown?: (k:string)=>void }} h
 */
export function installInput(h) { handlers = h; }

window.addEventListener('pointermove', e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.active = true;
  pointer.touch = e.pointerType === 'touch';
}, { passive: true });

window.addEventListener('pointerdown', e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.active = true;
  pointer.down = true;
  pointer.touch = e.pointerType === 'touch';
  if (handlers.onDown) handlers.onDown(e.clientX, e.clientY, pointer.touch);
}, { passive: true });

window.addEventListener('pointerup', () => {
  pointer.down = false;
  if (pointer.touch) pointer.active = false;
  if (handlers.onUp) handlers.onUp();
}, { passive: true });

window.addEventListener('pointercancel', () => {
  pointer.down = false; pointer.active = false;
  if (handlers.onCancel) handlers.onCancel();
});

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if (k === ' ') keys.add('space');
  else if (k === 'shift') keys.add('shift');
  else keys.add(k);

  if (handlers.onKeyDown) handlers.onKeyDown(k);
}, { passive: false });

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === ' ') keys.delete('space');
  if (k === 'shift') keys.delete('shift');
});
