import fs from 'node:fs';
import loadMujoco from '../../g1/vendor/mujoco.js';
import { PandaSimulation } from '../src/simulation.js';
export async function loadSimulation() {
  const sim = new PandaSimulation();
  sim.mj = await loadMujoco();
  const dir = new URL('../robots/panda/', import.meta.url);
  sim.mj.FS.mkdir('/painter'); sim.mj.FS.mkdir('/painter/assets');
  for (const name of ['scene.xml', 'panda.xml']) sim.mj.FS.writeFile(`/painter/${name}`, fs.readFileSync(new URL(name, dir)));
  const manifest = JSON.parse(fs.readFileSync(new URL('../asset-manifest.json', import.meta.url)));
  for (const name of manifest.meshes) sim.mj.FS.writeFile(`/painter/assets/${name}`, fs.readFileSync(new URL(`assets/${name}`, dir)));
  sim.model = sim.mj.MjModel.from_xml_path('/painter/scene.xml');
  sim.data = new sim.mj.MjData(sim.model);
  sim.tip = sim.model.site('marker_tip').id; sim.homeId = sim.model.key('home').id;
  sim.reset(); sim.home = Float64Array.from(sim.data.qpos);
  return sim;
}
