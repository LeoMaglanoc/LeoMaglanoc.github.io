import loadMujoco from '../../dexterous-rl/runtime/mujoco.js';
import { Controller } from './controller.js';
export class Simulation {
  async init() {
    this.mj = await loadMujoco();
    const read = async p => { const r = await fetch(new URL('../' + p, import.meta.url)); if (!r.ok) throw Error(`${p}: HTTP ${r.status}`); return r; };
    this.refs = {};
    for (const o of ['cube', 'cylinder']) this.refs[o] = await (await read(`references/${o}.json`)).json();
    const files = await (await read('asset-manifest.json')).json();
    this.mj.FS.mkdir('/yam'); this.mj.FS.mkdir('/yam/scene'); this.mj.FS.mkdir('/yam/scene/assets');
    await Promise.all(files.map(async p => this.mj.FS.writeFile('/yam/' + p, new Uint8Array(await (await read(p)).arrayBuffer()))));
    const bytes = this.mj.FS.readFile('/yam/scene/bimanual_scene.xml');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join('');
    if (Object.values(this.refs).some(r => r.scene_sha256 !== digest)) throw Error('Scene/reference hash mismatch');
    this.model = this.mj.MjModel.from_xml_path('/yam/scene/bimanual_scene.xml');
    this.data = new this.mj.MjData(this.model); this.dt = this.model.opt.timestep;
    if (this.model.nu !== 14 || this.model.ncam !== 5 || Math.abs(this.dt - .002) > 1e-10) throw Error('Model contract mismatch');
    this.bodyIds = Array.from(this.model.geom_bodyid);
    this.originalContactTypes = Array.from(this.model.geom_contype); this.originalAffinities = Array.from(this.model.geom_conaffinity);
    this.table = this.id('geom', 'tabletop'); this.reset('cube');
  }
  id(type, name) { const a = this.model[type](name); try { return a.id; } finally { a.delete(); } }
  reset(task = this.task, { offset = [0, 0], disableContacts = false } = {}) {
    this.controller = null; this.task = task; this.ref = this.refs[task];
    const m = this.model, d = this.data, side = this.ref.side;
    this.mj.mj_resetData(m, d);
    m.geom_contype.set(this.originalContactTypes); m.geom_conaffinity.set(this.originalAffinities);
    const joint = n => this.id('jnt', n), actuator = n => this.id('actuator', n);
    this.qa = []; this.va = []; this.ca = [];
    for (const arm of ['left', 'right']) {
      for (let i = 0; i < 6; i++) {
        const j = joint(`${arm}_joint${i + 1}`), a = actuator(`${arm}_joint${i + 1}`);
        d.qpos[m.jnt_qposadr[j]] = this.ref.home[i]; d.ctrl[a] = this.ref.home[i];
        if (arm === side) { this.qa.push(m.jnt_qposadr[j]); this.va.push(m.jnt_dofadr[j]); this.ca.push(a); }
      }
      d.qpos[m.jnt_qposadr[joint(arm + '_left_finger')]] = .0375;
      d.qpos[m.jnt_qposadr[joint(arm + '_right_finger')]] = -.0375;
      d.ctrl[actuator(arm + '_gripper')] = .0375;
    }
    this.ga = actuator(side + '_gripper'); this.gq = m.jnt_qposadr[joint(side + '_left_finger')];
    this.ob = this.id('body', task); const oj = joint(task + '_free'); this.oq = m.jnt_qposadr[oj]; this.ov = m.jnt_dofadr[oj];
    this.fingers = new Set(['lf_down', 'rf_down', 'lf_rot', 'rf_rot'].map(n => this.id('body', side + '_' + n)));
    d.qpos[this.oq] += offset[0]; d.qpos[this.oq + 1] += offset[1];
    if (disableContacts) this.bodyIds.forEach((b, i) => { if (b === this.ob) { m.geom_contype[i] = 0; m.geom_conaffinity[i] = 0; } });
    this.mj.mj_forward(m, d);
    for (let i = 0; i < 500; i++) this.mj.mj_step(m, d);
    this.base = d.qpos[this.oq + 2];
  }
  run() { if (!this.controller) this.controller = new Controller(this); }
  contacts() {
    let finger = 0, table = 0;
    const contacts = this.data.contact;
    try {
      for (let i = 0; i < this.data.ncon; i++) {
        const c = contacts.get(i);
        try {
          const a = c.geom1, b = c.geom2;
          if (this.bodyIds[a] === this.ob || this.bodyIds[b] === this.ob) {
            const other = this.bodyIds[a] === this.ob ? b : a;
            if (this.fingers.has(this.bodyIds[other])) finger++;
            if (other === this.table) table++;
          }
        } finally { c.delete(); }
      }
    } finally { contacts.delete(); }
    return [finger, table];
  }
  step() { if (this.controller) this.controller.tick(); }
  dispose() { this.data?.delete(); this.model?.delete(); }
}
