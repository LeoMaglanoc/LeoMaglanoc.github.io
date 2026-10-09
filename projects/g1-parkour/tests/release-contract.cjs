const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const bundle = esbuild.buildSync({ stdin: { contents: "export { PolicyController } from './src/policy/policyController.js'; export * from './src/policy/releaseContract.js'; export * from './src/utils/meshCoordinates.js';", resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false }).outputFiles[0].text;
const built = new Module(path.join(__dirname, 'contract-bundle.cjs'), module);
built.filename = path.join(__dirname, 'contract-bundle.cjs');
built.paths = Module._nodeModulePaths(__dirname);
built._compile(bundle, built.filename);
const { PolicyController, RELEASE_OBSERVATIONS, preprocessDepth, copyMuJoCoVectors } = built.exports;
const ort = require('onnxruntime-web');

async function main() {
  const physicsVertices = new Float32Array([1, 2, 3, 4, 5, 6]);
  const drawVertices = copyMuJoCoVectors(physicsVertices.subarray(0, 6));
  assert.deepEqual([...drawVertices], [1, 3, -2, 4, 6, -5]);
  assert.deepEqual([...physicsVertices], [1, 2, 3, 4, 5, 6]);
  drawVertices[0] = 99;
  assert.equal(physicsVertices[0], 1);
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'native-depth-fixtures.json')));
  let maxDepthError = 0;
  for (const c of fixture.cases) {
    const actual = preprocessDepth(Float32Array.from(c.input_bottom_up), c.width, c.height);
    assert.equal(actual.length, 58 * 87);
    const error = Math.max(...actual.map((v, i) => Math.abs(v - c.expected[i])));
    maxDepthError = Math.max(maxDepthError, error);
    assert.ok(error < 1e-5, `${c.name}: native depth mismatch ${error}`);
  }
  assert.ok(preprocessDepth(new Float32Array(106 * 60).fill(Infinity), 106, 60).every(x => x === 0.5));
  const mj = await (await import('mujoco-js')).default();
  mj.FS.mkdir('/working');
  function copyTree(from, to) {
    if (!mj.FS.analyzePath(to).exists) mj.FS.mkdir(to);
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copyTree(path.join(from, e.name), `${to}/${e.name}`);
      else if (/\.(xml|obj|stl|png)$/i.test(e.name)) mj.FS.writeFile(`${to}/${e.name}`, fs.readFileSync(path.join(from, e.name)));
    }
  }
  const scenes = path.join(root, 'public/scenes');
  copyTree(path.join(scenes, 'meshes'), '/working/meshes');
  copyTree(path.join(scenes, 'php-release'), '/working/php-release');
  mj.FS.writeFile('/working/g1_release_terrain.xml', fs.readFileSync(path.join(scenes, 'g1_release_terrain.xml')));
  const model = mj.MjModel.loadFromXML('/working/g1_release_terrain.xml');
  const data = new mj.MjData(model);
  assert.equal(model.nu, 29);
  ort.env.wasm.numThreads = 1;
  const policy = new PolicyController(mj);
  assert.equal(policy.highSpeedMode, true);
  // Native fixtures below use LOW speed explicitly.
  policy.highSpeedMode = false;
  const bytes = fs.readFileSync(path.join(root, 'public/php-release/student.onnx'));
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  policy.session = session; policy.modelBytes = bytes; policy.inputName = session.inputNames[0];
  policy.inputNames = session.inputNames; policy.outputName = 'actions';
  policy._readMetadata(); policy._buildMappings(model); policy.isReady = true;
  policy.applyInitialPose(model, data);
  assert.deepEqual(policy.observationNames, RELEASE_OBSERVATIONS);
  assert.equal(policy.obsSize, 108);
  assert.ok(policy.actionScale.every(x => x === 1));
  assert.equal(new Set(policy.jointInfo.map(x => x.ctrlIndex)).size, 29);
  for (let i = 0; i < 29; i++) {
    const info = policy.jointInfo[i];
    data.qpos[info.qposAdr] = policy.defaultJointPos[i] + .001 * (i + 1);
    data.qvel[info.qvelAdr] = .01 * (i + 1);
    policy.prevActions[i] = .02 * (i + 1);
  }
  data.qvel[policy.rootDofAdr + 3] = .11;
  data.qvel[policy.rootDofAdr + 4] = -.22;
  data.qvel[policy.rootDofAdr + 5] = .33;
  const quaternion = [0.92, 0.1, -0.2, 0.3];
  const norm = Math.hypot(...quaternion);
  for (let i = 0; i < 4; i++) data.qpos[3 + i] = quaternion[i] / norm;
  mj.mj_forward(model, data);
  const nameId = (prefix, name) => {
    const bytes = new Uint8Array(model.names);
    return model[`name_${prefix}adr`].findIndex(start => {
      let end = start; while (bytes[end]) end++;
      return new TextDecoder().decode(bytes.subarray(start, end)) === name;
    });
  };
  const manifest = JSON.parse(fs.readFileSync(path.join(scenes, 'php-release/terrain-manifest.json')));
  for (const part of manifest.components) {
    const geom = nameId('geom', part.name);
    assert.ok(geom >= 0);
    assert.equal(model.geom_type[geom], mj.mjtGeom.mjGEOM_MESH.value);
    const mesh = model.geom_dataid[geom];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let v = model.mesh_vertadr[mesh]; v < model.mesh_vertadr[mesh] + model.mesh_vertnum[mesh]; v++) {
      for (let axis = 0; axis < 3; axis++) {
        let value = data.geom_xpos[geom * 3 + axis];
        for (let j = 0; j < 3; j++) value += data.geom_xmat[geom * 9 + axis * 3 + j] * model.mesh_vert[v * 3 + j];
        lo[axis] = Math.min(lo[axis], value); hi[axis] = Math.max(hi[axis], value);
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(lo[axis] - part.minimum[axis]) < 1e-5, `${part.name}: min bounds`);
      assert.ok(Math.abs(hi[axis] - part.maximum[axis]) < 1e-5, `${part.name}: max bounds`);
    }
  }
  // The finish gate remains a visible marker, not a new collision obstacle.
  for (const gate of manifest.finish_gate.geoms) {
    const geom = nameId('geom', gate.name);
    assert.ok(geom >= 0, `Missing finish marker ${gate.name}`);
    assert.equal(model.geom_contype[geom], 0);
    assert.equal(model.geom_conaffinity[geom], 0);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(data.geom_xpos[geom * 3 + axis] - gate.position[axis]) < 1e-9);
      assert.ok(Math.abs(model.geom_size[geom * 3 + axis] - gate.half_extents[axis]) < 1e-9);
    }
  }
  for (const side of ['left', 'right']) assert.ok(Math.abs(model.body_mass[nameId('body', `${side}_sphere_hand_link`)] - .124) < 1e-9);
  policy.pressedKeys.add('w'); policy._updateCommandState();
  const obs = policy._buildObservation(model, data);
  const latent = Float32Array.from({ length: 32 }, (_, i) => i * 0.001);
  const state = [...data.qpos.slice(0, 7), ...policy.jointInfo.map(j => data.qpos[j.qposAdr]),
    ...data.qvel.slice(0, 6), ...policy.jointInfo.map(j => data.qvel[j.qvelAdr])];
  if (process.env.WRITE_NATIVE_INPUT) fs.writeFileSync(process.env.WRITE_NATIVE_INPUT,
    JSON.stringify({state, previousActions: [...policy.prevActions], command: [...policy.joystickState], latent: [...latent]}));

  const close = (a, b) => assert.ok(Math.abs(a - b) < 2e-6, `${a} != ${b}`);
  for (let i = 0; i < 29; i++) {
    close(obs[i], .02 * (i + 1)); close(obs[32 + i], .001 * (i + 1)); close(obs[61 + i], .01 * (i + 1));
  }
  close(obs[29], .11); close(obs[30], -.22); close(obs[31], .33);
  assert.equal(obs[94], 1);
  assert.ok(Math.abs(Math.hypot(...obs.slice(90, 93)) - 1) < 1e-6);
  policy.pressedKeys.clear(); policy.pressedKeys.add('a'); policy._updateCommandState(); assert.equal(policy.joystickState[2], 1);
  policy.pressedKeys.add('q'); policy._updateCommandState(); assert.equal(policy.joystickState[3], 1);
  policy.pressedKeys.delete('q'); policy._updateCommandState(); assert.equal(policy.joystickState[2], 1);
  policy.pressedKeys.clear(); policy._updateCommandState(); assert.equal(policy.joystickState[0], 1);
  policy.latestTarget.set(policy.defaultJointPos); policy.applyControl(model, data);
  for (let i = 0; i < 29; i++) {
    const j = policy.jointInfo[i];
    const torque = policy.kp[i] * (policy.latestTarget[i] - data.qpos[j.qposAdr]) - policy.kd[i] * data.qvel[j.qvelAdr];
    const lo = model.actuator_ctrlrange[j.ctrlIndex * 2], hi = model.actuator_ctrlrange[j.ctrlIndex * 2 + 1];
    close(data.ctrl[j.ctrlIndex], Math.max(lo, Math.min(hi, torque)));
  }
  const input = new Float32Array(140); input.set(obs); input.set(latent, 108);
  const output = await session.run({ obs: new ort.Tensor('float32', input, [1, 140]), time_step: new ort.Tensor('float32', new Float32Array(1), [1, 1]) });
  assert.equal(output.actions.data.length, 29); assert.ok(output.actions.data.every(Number.isFinite));
  const nativeFile = path.join(__dirname, 'native-policy-fixture.json');
  if (fs.existsSync(nativeFile)) {
    const native = JSON.parse(fs.readFileSync(nativeFile));
    input.forEach((value, i) => close(value, native.observation[i]));
    const actionError = Math.max(...output.actions.data.map((value, i) => Math.abs(value - native.actions[i])));
    assert.ok(actionError < 2e-5, `Native action mismatch ${actionError}`);
    console.log('Native observation/action parity', { actionError });
  }
  // Reset during async inference must discard the result from the old state.
  let complete;
  policy._runDepthBackbone = async () => new Float32Array(32);
  policy.session = { run: () => new Promise(resolve => { complete = resolve; }) };
  const pending = policy.requestAction(model, data);
  await new Promise(setImmediate);
  assert.equal(typeof complete, 'function');
  policy.reset();
  complete({ actions: { data: new Float32Array(29).fill(1) } });
  await pending;
  assert.ok(policy.prevActions.every(x => x === 0));
  await session.release(); data.delete(); model.delete();
  console.log(JSON.stringify({ status: 'passed', nativeDepthCases: fixture.cases.length, maxDepthError, observationDimension: 140, mappedJoints: 29, mappedActuators: 29, mujocoVersion: mj.mj_versionString() }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
