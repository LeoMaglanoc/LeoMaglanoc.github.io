import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const files = ['index.html', 'styles/main.css', 'src/main.js', 'src/camera.js', 'src/slam.js', 'src/visualization.js'];

for (const file of files) {
  const contents = await readFile(resolve(root, file), 'utf8');
  assert(contents.length > 0, `${file} must not be empty`);
  assert(!contents.match(/(?:src|href)=["']\//), `${file} contains an absolute root asset path`);
}

const html = await readFile(resolve(root, 'index.html'), 'utf8');
assert(html.includes('./src/main.js'));
assert(html.includes('Start SLAM'));
assert(html.includes('Processing runs locally'));
assert(html.includes('sequence-files'));
assert(html.includes('export-trace-button'));

const runtime = await readFile(resolve(root, 'assets/alva_ar.js'), 'utf8');
assert(runtime.includes('getMapPoints'), 'the checked-in runtime must expose getMapPoints');
await readFile(resolve(root, 'vendor/three/three.core.js'));
await readFile(resolve(root, 'vendor/three/three.module.js'));
await readFile(resolve(root, 'vendor/three/OrbitControls.js'));
console.log(`SLAM static contract passed (${files.length} source files checked).`);
