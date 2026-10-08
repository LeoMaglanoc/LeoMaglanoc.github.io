import assert from 'node:assert/strict';
import { test } from 'node:test';
import { G1Simulation } from '../src/simulation.js';
import { BrowserPolicy } from '../src/policy.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const pending = [];
  const policy = { act() { const task = deferred(); pending.push(task); return task.promise; }, reset() {} };
  const simulation = new G1Simulation(policy, { update: () => [0, 0, 0] }, () => {});
  simulation.data = { qpos: new Float64Array(19), qvel: new Float64Array(18), ctrl: new Float64Array(12), qfrc_applied: new Float64Array(18) };
  simulation.mujoco = { mj_step() {}, mj_resetData() {}, mj_forward() {} };
  return { simulation, pending };
}

test('slow frames wait at every policy boundary without skipping an action', async () => {
  const { simulation: s, pending } = fixture();
  s.advance(0);
  s.advance(50);
  assert.equal(s.stepCount, 10);
  s.advance(100);
  assert.equal(s.stepCount, 10);
  pending[0].resolve(new Float32Array(12)); await flush();
  s.advance(150);
  assert.equal(s.stepCount, 20);
  assert.equal(pending.length, 2);
  assert.ok(s.accumulator <= 0.05);
});

test('reset rejects stale actions and stale inference errors, then runs again', async () => {
  for (const reject of [false, true]) {
    const { simulation: s, pending } = fixture();
    s.advance(0); s.advance(50); s.reset();
    if (reject) pending[0].reject(Error('old run')); else pending[0].resolve(new Float32Array(12).fill(9));
    await flush();
    assert.equal(s.inferenceBusy, false);
    assert.equal(s.paused, false);
    assert.ok(s.action.every(x => x === 0));
    assert.equal(s.lastFrame, null);
    s.advance(200); s.advance(250);
    pending[1].resolve(new Float32Array(12).fill(1)); await flush();
    assert.ok(s.action.every(x => x === 1));
  }
});

test('policy reset during inference preserves cleared recurrent state and disposes tensors', async () => {
  const tensors = [];
  globalThis.window = { ort: { Tensor: class {
    constructor(type, data) { this.data = data; this.disposed = false; tensors.push(this); }
    dispose() { this.disposed = true; }
  } } };
  const task = deferred(); let feeds;
  const p = new BrowserPolicy('unused');
  p.inputName = 'obs'; p.outputName = 'action';
  p.hidden.fill(3); p.cell.fill(4);
  p.session = { run(input) { feeds = input; return task.promise; } };
  const action = p.act(new Float32Array(47));
  p.reset();
  assert.equal(feeds.hidden.data[0], 3);
  assert.equal(feeds.cell.data[0], 4);
  const output = data => new window.ort.Tensor('float32', data);
  task.resolve({ action: output(new Float32Array(12)), next_hidden: output(new Float32Array(64).fill(5)), next_cell: output(new Float32Array(64).fill(6)) });
  await action;
  assert.ok(p.hidden.every(x => x === 0));
  assert.ok(p.cell.every(x => x === 0));
  assert.ok(tensors.every(t => t.disposed));
  // Also dispose inputs on failure.
  p.session.run = () => Promise.reject(Error('inference failed'));
  await assert.rejects(p.act(new Float32Array(47)), /inference failed/);
  assert.ok(tensors.every(t => t.disposed));
});

test('an active inference failure pauses physics and reset recovers', async () => {
  const { simulation: s, pending } = fixture();
  s.advance(0); s.advance(50);
  pending[0].reject(Error('active run failure')); await flush();
  assert.equal(s.paused, true);
  s.advance(100);
  assert.equal(s.stepCount, 10);
  s.reset();
  assert.equal(s.paused, false);
  s.advance(200); s.advance(250);
  assert.equal(s.stepCount, 10);
  pending[1].resolve(new Float32Array(12)); await flush();
});
