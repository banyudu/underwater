#!/usr/bin/env node
// 把 src/ 的 ES 模块打包并内联进 HTML，产出一个可直接双击运行的单文件 index.html。
//
// 用法:
//   node tools/build.mjs            产出未压缩的单文件
//   node tools/build.mjs --minify   压缩
//   node tools/build.mjs --watch    监听 src/ 变化并自动重建

import { build } from 'esbuild';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const minify = process.argv.includes('--minify');
const watchMode = process.argv.includes('--watch');

const kb = n => (n / 1024).toFixed(1) + ' KB';

async function buildOnce() {
  const result = await build({
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true,
    format: 'iife',            // 单文件、无 import/export 残留，file:// 可直接跑
    target: ['chrome100', 'safari15', 'firefox100'],
    minify,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    logLevel: 'warning',
  });

  const js = result.outputFiles[0].text;
  const shell = await readFile(path.join(root, 'src/index.html'), 'utf8');

  if (!shell.includes('/*__BUNDLE__*/')) {
    throw new Error('src/index.html 缺少 /*__BUNDLE__*/ 占位符');
  }

  // 用函数替换，避免 $& 之类的替换语义吃掉代码
  const html = shell.replace('/*__BUNDLE__*/', () => js.trim());
  const out = path.join(root, 'index.html');
  await writeFile(out, html);

  const raw = (await stat(out)).size;
  const gz = gzipSync(Buffer.from(html)).length;
  const stamp = new Date().toTimeString().slice(0, 8);
  console.log(`[${stamp}] built index.html  ${kb(raw)}  gzip ${kb(gz)}${minify ? '  (minified)' : ''}`);
}

await buildOnce();

if (watchMode) {
  console.log('watching src/ …');
  let timer = null;
  watch(path.join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      buildOnce().catch(err => console.error('build failed:', err.message));
    }, 60);
  });
}
