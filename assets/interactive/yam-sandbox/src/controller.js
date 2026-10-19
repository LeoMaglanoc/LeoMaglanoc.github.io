// Reference targets only: all robot/object motion is produced by mj_step.
export const DURATIONS = { APPROACH: 3, DESCEND: 3, CLOSE: 1.5, LIFT: 3, TRANSFER: 5, LOWER: 3, RELEASE: 1.5, RETREAT: 3 };
const norm = a => Math.hypot(...a);
export class Controller {
  constructor(sim) {
    this.sim = sim; this.ref = sim.ref; this.index = 0; this.phase = 'HOME';
    this.liftDwell = 0; this.placeDwell = 0; this.lost = 0; this.grasped = false; this.maxLift = 0; this.reason = ''; this.trace = []; this.samples = []; this.enter(0);
  }
  get terminal() { return ['DONE', 'FAILED'].includes(this.phase); }
  state() {
    const s = this.sim, d = s.data, [finger, table] = s.contacts();
    const q = s.qa.map(a => d.qpos[a]);
    return { time: d.time, phase: this.phase, pos: Array.from(d.qpos.slice(s.oq, s.oq + 3)), velocity: Array.from(d.qvel.slice(s.ov, s.ov + 3)), finger_contacts: finger, table_contacts: table, joint_error: Math.max(...q.map((v, i) => Math.abs(v - this.ref.waypoints[Math.min(this.index, 7)].q[i]))), qpos: q, ctrl: s.ca.map(a => d.ctrl[a]), grip: d.qpos[s.gq] };
  }
  enter(index) {
    this.index = index; this.phase = index < 8 ? this.ref.waypoints[index].phase : 'VERIFY_PLACE';
    this.start = this.sim.data.time; this.fromg = this.sim.data.ctrl[this.sim.ga]; this.trace.push(this.state());
  }
  fail(reason) { this.reason = reason; this.phase = 'FAILED'; this.trace.push(this.state()); }
  tick() {
    if (this.terminal) return;
    const s = this.sim, d = s.data, dt = s.dt, elapsed = d.time - this.start;
    const w = this.ref.waypoints[this.index], duration = DURATIONS[this.phase];
    if (this.index < 8) {
      const u = Math.min(1, elapsed / duration), smooth = u * u * (3 - 2 * u);
      const v = smooth * (w.qs.length - 1), k = Math.min(Math.floor(v), w.qs.length - 2);
      s.ca.forEach((a, i) => { d.ctrl[a] = w.qs[k][i] + (v - k) * (w.qs[k + 1][i] - w.qs[k][i]); });
      d.ctrl[s.ga] = this.fromg + smooth * (w.grip - this.fromg);
    }
    s.mj.mj_step(s.model, d);
    const [finger, table] = s.contacts(), p = Array.from(d.qpos.slice(s.oq, s.oq + 3));
    const speed = norm(d.qvel.slice(s.ov, s.ov + 3)), height = p[2] - s.base;
    this.maxLift = Math.max(this.maxLift, height);
    this.liftDwell = finger > 0 && height >= .05 ? this.liftDwell + dt : 0;
    if (this.liftDwell >= .2) this.grasped = true;
    const retain = this.grasped && (['LIFT', 'TRANSFER'].includes(this.phase) || (this.phase === 'LOWER' && table === 0));
    this.lost = retain && finger === 0 ? this.lost + dt : 0;
    if (this.lost > .15) { this.fail('Lost finger contact during transport'); return; }
    if (this.index < 8) {
      const err = Math.max(...s.qa.map((a, i) => Math.abs(d.qpos[a] - w.q[i])));
      const vel = Math.max(...s.va.map(a => Math.abs(d.qvel[a])));
      let ready = elapsed >= duration + .3 && err < .02 && vel < .15;
      if (this.phase === 'CLOSE') ready &&= finger > 0;
      if (this.phase === 'LIFT') ready &&= this.grasped && finger > 0;
      if (ready) this.enter(this.index + 1);
      else if (elapsed > duration + 4) this.fail(`${this.phase} timeout: joint error ${err.toFixed(4)}, contacts ${finger}, lift ${height.toFixed(4)}`);
    } else {
      const placed = this.grasped && table > 0 && finger === 0 && norm([p[0] - this.ref.goal[0], p[1] - this.ref.goal[1]]) < .05 && speed < .05 && Math.abs(height) < .015;
      this.placeDwell = placed ? this.placeDwell + dt : 0;
      if (this.placeDwell >= .5) { this.phase = 'DONE'; this.trace.push(this.state()); }
      else if (elapsed > 4) this.fail('Placement oracle timeout');
    }
    if (Math.round(d.time / dt) % 50 === 0) this.samples.push(this.state());
  }
  result() { return { object: this.sim.task, success: this.phase === 'DONE', reason: this.reason, grasped: this.grasped, max_lift: this.maxLift, trace: this.trace, samples: this.samples }; }
}
