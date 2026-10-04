import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const manifestPath = new URL('../model-manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const safeName = manifest.modelId.split('/').at(-1).toLowerCase();
const root = new URL(`../public/models/${safeName}/`, import.meta.url);
const checksums = {};

for (const file of manifest.files) {
  if (file.includes('..') || file.startsWith('/')) throw new Error(`Unsafe model file: ${file}`);
  const destination = join(root.pathname, file);
  await mkdir(dirname(destination), { recursive: true });
  const url = `https://huggingface.co/${manifest.modelId}/resolve/${manifest.revision}/${file}`;
  process.stdout.write(`Downloading ${file}\n`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${response.status} fetching ${file}`);
  const chunks = [];
  for await (const chunk of response.body) chunks.push(chunk);
  const contents = Buffer.concat(chunks);
  await writeFile(destination, contents);
  checksums[file] = { bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') };
}
manifest.checksums = checksums;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Downloaded ${manifest.files.length} pinned files to public/models/${safeName}/`);
