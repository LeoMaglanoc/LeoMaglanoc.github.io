import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
const $ = id => document.getElementById(id);
const sim = new Simulation(); let view, running = false, paused = false, accumulator = 0, previous, frames = 0, raf, disposed = false;
const metrics = { frameTimes: [], steps: 0, loadedMs: 0 }, started = performance.now();
const names = { APPROACH: 'Approaching', DESCEND: 'Aligning grasp', CLOSE: 'Closing gripper', LIFT: 'Lifting · verifying grasp', TRANSFER: 'Carrying to target', LOWER: 'Lowering', RELEASE: 'Releasing', RETREAT: 'Retreating', VERIFY_PLACE: 'Checking placement' };
function updateUI() {
  const c = sim.controller, terminal = c?.terminal;
  $('run').disabled = running || !!c;
  $('pause').disabled = !running || terminal;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('status').textContent = c ? terminal ? c.phase === 'DONE' ? 'Placement verified' : 'Task failed' : `${paused ? 'Paused · ' : ''}${names[c.phase]}` : 'Ready · choose an object';
  $('result').className = terminal ? c.phase === 'DONE' ? 'success' : 'failed' : '';
  $('result').textContent = terminal ? c.phase === 'DONE' ? 'Success · contact verified' : c.reason : c?.grasped ? 'Grasp verified · ≥ 5 cm lift' : 'Real contacts. Real gravity.';
}
function reset() { running = paused = false; accumulator = 0; sim.reset($('task').value); view.update(); updateUI(); }
function camera() {
  const portrait = innerWidth < innerHeight;
  const landscapePhone = !portrait && innerHeight < 480;
  view.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 900 ? .85 : 1));
  view.setCameraPreset({ position: portrait ? [1.5, -2.5, 1.95] : landscapePhone ? [.85, -1.25, 1.55] : [1.35, -1.95, 1.75], target: [0, -.02, landscapePhone ? 1.0 : .96], fov: portrait ? 48 : landscapePhone ? 30 : 42, minDistance: .6, maxDistance: 5 });
}
function animate(now) {
  if (disposed) return;
  const elapsed = previous == null ? 0 : (now - previous) / 1000; previous = now;
  if (elapsed > 0) { metrics.frameTimes.push(elapsed * 1000); if (metrics.frameTimes.length > 600) metrics.frameTimes.shift(); }
  if (running && !paused && !sim.controller.terminal && !document.hidden) {
    accumulator += Math.min(elapsed, .1); // Bound work after tab suspension; never change the physics timestep.
    let budget = 50;
    while (accumulator >= sim.dt && budget-- > 0 && !sim.controller.terminal) { sim.step(); accumulator -= sim.dt; metrics.steps++; }
    if (sim.controller.terminal) running = false;
  } else accumulator = 0;
  view.update(); if (++frames % 6 === 0) updateUI(); raf = requestAnimationFrame(animate);
}
$('about').onclick = () => { $('details').hidden = !$('details').hidden; $('about').setAttribute('aria-expanded', String(!$('details').hidden)); };
async function bootstrap() {
try {
  await sim.init();
  view = new Renderer({ canvas: $('scene'), mujoco: sim.mj, model: sim.model, data: sim.data, geomGroups: [0, 2], shadows: false, maxGeoms: 1000 });
  const displayResponse = await fetch(new URL('../display-meshes.json', import.meta.url));
  if (!displayResponse.ok) throw Error('Display meshes failed to load');
  view.displayMeshes = await displayResponse.json();
  if (view.displayMeshes.scene_sha256 !== sim.ref.scene_sha256) throw Error('Display/scene hash mismatch');
  view.initialize();
  view.setBackground('#111b21'); camera();
  $('loading').hidden = true; for (const id of ['task', 'run', 'reset']) $(id).disabled = false;
  $('run').onclick = () => { sim.run(); running = true; paused = false; accumulator = 0; updateUI(); };
  $('pause').onclick = () => { paused = !paused; accumulator = 0; updateUI(); };
  $('reset').onclick = reset; $('task').onchange = reset;
  window.addEventListener('resize', camera);
  document.addEventListener('visibilitychange', () => { previous = undefined; accumulator = 0; });
  window.addEventListener('pagehide', event => {
    previous = undefined; accumulator = 0;
    if (!event.persisted) { disposed = true; cancelAnimationFrame(raf); view.dispose(); sim.dispose(); }
  });
  metrics.loadedMs = performance.now() - started;
  // Inspection hook for repeatable QA and future controller/model work.
  window.yam = { sim, view, metrics, get running() { return running; }, get paused() { return paused; } };
  updateUI(); raf = requestAnimationFrame(animate);
} catch (error) {
  console.error(error); $('loading').hidden = false;
  $('loading').textContent = `Could not start the sandbox: ${error.message}. Please reload in a browser with WebAssembly and WebGL support.`;
  $('status').textContent = 'Loading failed';
}

}
bootstrap();
