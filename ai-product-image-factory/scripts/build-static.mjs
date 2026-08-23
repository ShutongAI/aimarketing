/**
 * 把整个应用打包成一个自包含的 index.html：内联 CSS、JS 与示例图，
 * 不请求任何外部资源，可直接双击打开、静态托管或作为在线演示发布。
 *
 * 用法：node scripts/build-static.mjs [示例图片路径]
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const outDir = path.join(root, 'dist');
const samplePath = process.argv[2] ?? path.join(root, 'static', 'sample-product.jpg');

const result = await build({
  entryPoints: [path.join(root, 'static', 'entry.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  alias: { '@': root },
});

const js = result.outputFiles[0].text;
const css = await readFile(path.join(root, 'app', 'globals.css'), 'utf8');

let sample = '';
if (existsSync(samplePath)) {
  const bytes = await readFile(samplePath);
  const mime = samplePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  sample = `data:${mime};base64,${bytes.toString('base64')}`;
  console.log(`内置示例图：${path.relative(root, samplePath)}（${(bytes.length / 1024).toFixed(0)} KB）`);
}

const html = `<title>AI 商品图工厂</title>
<style>
${css}
#root { height: 100%; }
</style>
<div id="root"></div>
<script>
window.__AIPF_STATIC__ = true;
${sample ? `window.__AIPF_SAMPLE__ = ${JSON.stringify(sample)};` : ''}
</script>
<script>
${js}
</script>
`;

await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, 'index.html');
await writeFile(outFile, html, 'utf8');
console.log(`已生成 ${path.relative(root, outFile)}（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）`);
