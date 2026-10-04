import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const manifestPath = new URL('../model-manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const root = new URL(`../public/models/${manifest.modelId.split('/').at(-1).toLowerCase()}/`, import.meta.url);
let failures = 0;
for (const file of manifest.files) {
  try {
    const contents = await readFile(join(root.pathname, file));
    const expected = manifest.checksums?.[file];
    const hash = createHash('sha256').update(contents).digest('hex');
    if (expected && (expected.bytes !== contents.length || expected.sha256 !== hash)) throw new Error('checksum mismatch');
    console.log(`ok ${file} (${(contents.length / 1024 / 1024).toFixed(1)} MB)`);
  } catch (error) { failures += 1; console.error(`FAIL ${file}: ${error instanceof Error ? error.message : error}`); }
}
if (failures) process.exitCode = 1;
