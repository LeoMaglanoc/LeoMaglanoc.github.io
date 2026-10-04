import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public/demos/freiburg3_long_office_household");
const required = ["demo.mp4", "depth.mp4", "scene.glb", "trajectory.json", "metadata.json", "thumbnail.webp", "attribution.txt"];
for (const name of required) {
  const info = await stat(path.join(root, name));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty demo asset: ${name}`);
}
const metadata = JSON.parse(await readFile(path.join(root, "metadata.json"), "utf8"));
const trajectory = JSON.parse(await readFile(path.join(root, "trajectory.json"), "utf8"));
if (trajectory.source !== "rtabmap_global_pose_graph_optimized") {
  throw new Error("Web trajectory must come from RTAB-Map global pose-graph optimization");
}
if (!Array.isArray(trajectory.samples) || trajectory.samples.length < 2) throw new Error("Invalid trajectory samples");
function finite(value) {
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === "object") return Object.values(value).every(finite);
  return typeof value !== "number" || Number.isFinite(value);
}
if (!finite(trajectory) || !finite(metadata)) throw new Error("Demo JSON has non-finite values");
if (metadata.reconstruction?.backend !== "rtabmap_textured_mesh") {
  throw new Error("Public scene must be RTAB-Map's native textured mesh");
}
if (!metadata.reconstruction.texture_count || !metadata.mesh.uv_count) {
  throw new Error("Public scene metadata does not describe UV textures");
}
for (const asset of Object.values(metadata.assets)) await stat(path.join(root, asset));
console.log(`Validated ${trajectory.samples.length} trajectory samples and browser assets.`);

const iclRoot = path.resolve('public/demos/icl_nuim');
const icl = JSON.parse(await readFile(path.join(iclRoot, 'metadata.json'), 'utf8'));
const summary = JSON.parse(await readFile(path.join(iclRoot, 'summary.json'), 'utf8'));
const sweep = JSON.parse(await readFile(path.join(iclRoot, 'sweep.json'), 'utf8'));
const selection = JSON.parse(await readFile(path.join(iclRoot, 'selection.json'), 'utf8'));
if (!icl.synthetic || !summary.complete || summary.sequences.length !== 4) throw new Error('ICL publication requires all four synthetic benchmark results');
if (!finite(icl) || !finite(summary) || !finite(sweep) || !finite(selection)) throw new Error('ICL result contains nonfinite values');
if (JSON.stringify(icl.tuning_selection) !== JSON.stringify(selection)) throw new Error('Viewer tuning selection differs from report');
if (sweep.results.length !== 15 || sweep.finalists.length !== 3) throw new Error('ICL controlled sweep is incomplete');
const representative = summary.sequences.find((s) => s.sequence === 'lr_kt0');
for (const name of ['tsdf_estimated', 'tsdf_gt', 'rtab_estimated', 'rtab_gt', 'tsdf_tuned_estimated', 'tsdf_tuned_gt']) {
  const variant = icl.variants[name];
  if (!name.startsWith('tsdf_tuned') && JSON.stringify(variant.metrics) !== JSON.stringify(representative.conditions[name])) throw new Error(`Viewer metrics differ from benchmark: ${name}`);
  if (name === 'tsdf_tuned_estimated' && JSON.stringify(variant.metrics) !== JSON.stringify(sweep.finalists.find((f) => f.name === selection.selected).metrics)) throw new Error('Selected TSDF metrics differ from frozen sweep');
  for (const key of ['mesh', 'geometry_mesh', 'error_mesh']) {
    const data = await readFile(path.join(iclRoot, variant[key]));
    if (data.toString('utf8', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw new Error(`Invalid GLB: ${variant[key]}`);
    const document = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)).trim());
    if (!document.meshes?.length || !document.accessors?.length) throw new Error(`Empty mesh: ${variant[key]}`);
    const triangles = document.meshes.flatMap((mesh) => mesh.primitives).reduce((count, primitive) => count + document.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3, 0);
    if (triangles !== variant[key === 'mesh' ? 'color_web_triangles' : 'web_triangles']) throw new Error(`Incorrect display triangle count: ${variant[key]}`);
  }
  const trajectory = JSON.parse(await readFile(path.join(iclRoot, variant.trajectory), 'utf8'));
  if (!finite(trajectory) || trajectory.samples.length < 2) throw new Error(`Invalid ICL trajectory: ${name}`);
}
for (const file of ['demo.mp4', 'depth.mp4', 'gt.glb', 'report.md', 'attribution.txt', 'native_source_cloud_validation.json']) {
  if ((await stat(path.join(iclRoot, file))).size === 0) throw new Error(`Empty ICL asset: ${file}`);
}
for (const result of summary.sequences.filter((s) => s.sequence !== 'lr_kt0')) {
  if (Object.keys(result.tuning_validation).length !== 3) throw new Error(`Held-out tuning validation missing: ${result.sequence}`);
}
console.log('Validated four ICL sequences, frozen metrics, 15 sweep results, three held-out finalists, and GLB assets.');
