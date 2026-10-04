import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('public/demos/icl_nuim');
const metadata = JSON.parse(await readFile(path.join(root, 'metadata.json'), 'utf8'));
async function triangleCount(file) {
  const data = await readFile(path.join(root, file));
  if (data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(8) !== data.length) throw new Error(`Invalid GLB: ${file}`);
  const document = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)).trim());
  let count = 0;
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? 4) !== 4) throw new Error(`Expected triangles in ${file}`);
    count += document.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
  }
  if (!Number.isInteger(count) || count < 1) throw new Error(`Empty or malformed mesh: ${file}`);
  return count;
}
for (const variant of Object.values(metadata.variants)) {
  variant.web_triangles = await triangleCount(variant.geometry_mesh);
  variant.color_web_triangles = await triangleCount(variant.mesh);
  if (await triangleCount(variant.error_mesh) !== variant.web_triangles) throw new Error('Geometry and heatmap topology differ');
}
await writeFile(path.join(root, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log('Finalized triangle counts from the actual display assets.');
