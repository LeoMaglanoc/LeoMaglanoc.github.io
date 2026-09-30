import loadMujoco from '../../g1/vendor/mujoco.js';
import { C } from './config.js';
function mkdirp(FS, path) {
  let p = '';
  for (const part of path.split('/').filter(Boolean)) { p += `/${part}`; if (!FS.analyzePath(p).exists) FS.mkdir(p); }
}
async function fetchChecked(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset failed to load (${response.status}): ${url}`);
  return response;
}
export class PandaSimulation {
  async init() {
    this.mj = await loadMujoco();
    const base = new URL('../', import.meta.url), root = '/working/painter';
    const manifest = await (await fetchChecked(new URL('asset-manifest.json', base))).json();
    mkdirp(this.mj.FS, `${root}/assets`);
    for (const [name, url] of [['scene.xml', manifest.scene], ['panda.xml', manifest.model]]) this.mj.FS.writeFile(`${root}/${name}`, await (await fetchChecked(new URL(url, base))).text());
    // Limit concurrent downloads on mobile.
    for (let i = 0; i < manifest.meshes.length; i += 8) await Promise.all(manifest.meshes.slice(i, i + 8).map(async name => {
      const bytes = await (await fetchChecked(new URL(`robots/panda/assets/${name}`, base))).arrayBuffer();
      this.mj.FS.writeFile(`${root}/assets/${name}`, new Uint8Array(bytes));
    }));
    this.model = this.mj.MjModel.from_xml_path(`${root}/scene.xml`);
    this.data = new this.mj.MjData(this.model);
    this.tip = this.model.site('marker_tip').id;
    this.homeId = this.model.key('home').id;
    this.reset();
    this.home = Float64Array.from(this.data.qpos);
  }
  reset() {
    this.mj.mj_resetDataKeyframe(this.model, this.data, this.homeId);
    this.data.qpos[7] = this.data.qpos[8] = 0;
    this.data.ctrl[7] = 0;
    this.mj.mj_forward(this.model, this.data);
  }
  tipPosition() { return Array.from(this.data.site_xpos.slice(this.tip * 3, this.tip * 3 + 3)); }
  step() {
    // Validated against uncompensated tracking in tests/physics.test.js.
    this.data.qfrc_applied.set(this.data.qfrc_bias);
    this.data.ctrl[7] = 0;
    this.mj.mj_step(this.model, this.data);
  }
}
