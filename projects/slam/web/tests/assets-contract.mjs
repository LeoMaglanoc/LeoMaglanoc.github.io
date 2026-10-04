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
