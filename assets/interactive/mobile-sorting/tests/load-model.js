import fs from "node:fs";
import loadMujoco from "../../g1/vendor/mujoco.js";
import { SortingSimulation } from "../src/simulation.js";
export async function loadSimulation() {
  const s = new SortingSimulation();
  s.mj = await loadMujoco();
  const F = s.mj.FS;
  F.mkdir("/sorting");
  F.mkdir("/sorting/assets");
  const root = new URL("../robots/tiago/", import.meta.url);
  for (const name of ["scene.xml", "tiago.xml"]) F.writeFile("/sorting/" + name, fs.readFileSync(new URL(name, root)));
  const manifest = JSON.parse(fs.readFileSync(new URL("../asset-manifest.json", import.meta.url)));
  for (const name of manifest.meshes) {
    let p = "/sorting/assets";
    for (const part of name.split("/").slice(0, -1)) {
      p += "/" + part;
      if (!F.analyzePath(p).exists) F.mkdir(p);
    }
    F.writeFile("/sorting/assets/" + name, fs.readFileSync(new URL("assets/" + name, root)));
  }
  s.model = s.mj.MjModel.from_xml_path("/sorting/scene.xml");
  s.data = new s.mj.MjData(s.model);
  s.bind();
  s.reset();
  return s;
}
