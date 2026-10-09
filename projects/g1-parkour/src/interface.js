// Presentation/input adapter. Released policy, sensor and physics stay upstream.
export function mountInterface(demo) {
  const $ = (id) => document.getElementById(id);
  const policy = demo.policyController;
  const buttons = [...document.querySelectorAll('[data-key]')];
  let frames = 0, start = performance.now(), lastTime = demo.data.time, fps = 0, rtf = 0, inferenceMs = 0;
  const request = policy.requestAction.bind(policy);
  policy.requestAction = async (...args) => {
    const before = performance.now();
    await request(...args);
    inferenceMs = performance.now() - before;
  };
  const clear = () => { policy.pressedKeys.clear(); policy._updateCommandState(); buttons.forEach(b => b.classList.remove('active')); };
  const pointers = new Map();
  for (const button of buttons) {
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, button.dataset.key);
      policy.pressedKeys.add(button.dataset.key); policy._updateCommandState();
      button.classList.add('active');
    });
    const release = (event) => {
      const key = pointers.get(event.pointerId); pointers.delete(event.pointerId);
      if (key && ![...pointers.values()].includes(key)) policy.pressedKeys.delete(key);
      policy._updateCommandState(); button.classList.remove('active');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
  }
  const pause = () => { demo.params.paused = !demo.params.paused; demo.mujoco_time = performance.now(); clear(); };
  const reset = () => { clear(); demo.resetRequested = true; };
  $('pause').onclick = pause; $('reset').onclick = reset;
  $('low').onclick = () => { policy.highSpeedMode = false; policy._updateCommandState(); };
  $('high').onclick = () => { policy.highSpeedMode = true; policy._updateCommandState(); };
  window.addEventListener('keydown', (event) => {
    if ($('details').open) return;
    if (['Space','Backspace'].includes(event.code)) {
      event.preventDefault(); if (!event.repeat) (event.code === 'Space' ? pause : reset)();
    }
  });
  window.addEventListener('blur', () => { pointers.clear(); clear(); demo.dragStateManager.end(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clear(); demo.params.paused = true; } });
  const details = $('details'); let wasPaused = false;
  $('about').onclick = () => { wasPaused = demo.params.paused; demo.params.paused = true; clear(); details.showModal(); };
  $('close').onclick = () => details.close();
  details.addEventListener('close', () => { demo.params.paused = wasPaused; demo.mujoco_time = performance.now(); });
  $('depth').onchange = () => { demo.showDepthPreview = $('depth').checked; };
  demo.onError = (error) => { $('state').textContent = 'Error'; $('loading').hidden = false; $('loading').textContent = `Simulation stopped: ${error.message}. Reload to retry.`; };
  demo.renderer.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); demo.params.paused = true; demo.onError(new Error('Graphics context lost')); });
  demo.updateInterface = () => {
    frames++;
    const now = performance.now();
    if (now - start < 250) return;
    fps = frames * 1000 / (now - start); rtf = (demo.data.time - lastTime) * 1000 / (now - start);
    frames = 0; start = now; lastTime = demo.data.time;
    const fallen = demo.data.qpos[2] < .35;
    $('state').textContent = demo.params.paused ? 'Paused' : fallen ? 'Fallen' : demo.data.qpos[0] >= 65.5 && Math.abs(demo.data.qpos[1]) < 1.5 ? 'Finished' : demo.data.time < .2 ? 'Ready' : 'Running';
    $('pause').textContent = demo.params.paused ? 'Resume' : 'Pause';
    $('low').setAttribute('aria-pressed', String(!policy.highSpeedMode)); $('high').setAttribute('aria-pressed', String(policy.highSpeedMode));
    const held = [...policy.pressedKeys].filter(k => 'wasdqe'.includes(k));
    $('command').textContent = held.length ? held.at(-1).toUpperCase() : 'IDLE';
    buttons.forEach(b => b.classList.toggle('active', policy.pressedKeys.has(b.dataset.key)));
    $('time').textContent = `${demo.data.time.toFixed(1)} s`;
    $('distance').textContent = `${Math.max(0,demo.data.qpos[0]).toFixed(1)} / 66 m`;
    $('performance').textContent = `${fps.toFixed(fps < 10 ? 1 : 0)} render FPS · ${inferenceMs.toFixed(1)} ms policy + encoder · ${Math.max(0,rtf).toFixed(2)}× realtime\n500 Hz physics · 50 Hz policy · 10 Hz depth (simulated)`;
  };
}
