// 所有 DOM 引用的唯一来源。集中在此，避免各处散落 getElementById。

export const $ = id => document.getElementById(id);

// HUD
export const hudDepth = $('hudDepth'), hudScore = $('hudScore'), hudBest = $('hudBest');
export const hudZone = $('hudZone'), sizeFill = $('sizeFill'), sizeNum = $('sizeNum');
export const hintEl = $('hint'), toastEl = $('toast');
export const muteBtn = $('mute');

// 覆盖层
export const menuEl = $('menu'), overEl = $('over'), pauseEl = $('pause');
export const overDepth = $('overDepth'), overScore = $('overScore'), overBest = $('overBest');
