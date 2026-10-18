import { CONFIG as C, distance } from './config.js';
import { Game, FixedClock } from './game.js';
import { Renderer } from './renderer.js';
import { attachInput } from './input.js';
import { replay, traceSegments } from './replay.js';
import { fk } from './robot.js';
const $ = (id) => document.getElementById(id);
const game = new Game(),
  clock = new FixedClock(),
  renderer = new Renderer($('field'));
const input = attachInput($('field'), game, renderer, clock);
let lastPhase = '',
  lastCue = '',
  lastRound = null;
const frameTimes = [];
let lastFrame = null;
function start() {
  input.release();
  game.start();
  clock.reset();
  lastRound = null;
  lastPhase = '';
}
$('start').onclick = start;
$('restart').onclick = start;
$('mode').onchange = () => {
  input.release();
  game.reset($('mode').value);
  clock.reset();
  lastPhase = '';
};
new ResizeObserver(() => renderer.resize()).observe($('field'));
function showInfo(html) {
  $('info-content').innerHTML = html;
  $('info').showModal();
  input.release();
}
$('about').onclick = () =>
  showInfo(
    `<h2>Can prediction beat reaction?</h2><p>Hold the green ring and keep moving. Release to pause. Survive 20 seconds of pursuit after a short warm-up.</p><p><b>Reactive:</b> aims at the last observed position.<br><b>Predictive:</b> uses a robust 200 ms velocity estimate to forecast 300 ms from its observation cutoff.</p><p>Both robots see the same 100 ms delayed measurements and have identical joint speed limits. The forecast is about 200 ms ahead of the present. The cross marks the commanded point, not where the hand already is.</p><p>This is a kinematic two-joint simulation, not torque dynamics. Timestral-5M is an offline research experiment; it does not control this game.</p><p>“Compare trace” replays each uninterrupted segment against both controllers from identical initial conditions. It does not predict how you would adapt to another robot. Movement stays on your device. Save JSON only if you choose.</p><p><a href="https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/tree/main/projects/catchbot" target="_blank" rel="noopener">Algorithms, measured results & reproduction</a></p>`,
  );
$('info').querySelector('.close').onclick = () => $('info').close();
$('info').addEventListener('click', (e) => {
  if (e.target === $('info')) $('info').close();
});
$('export').onclick = () => {
  const trace = lastRound || game.exportTrace();
  const blob = new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = 'catchbot-trace.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('compare').onclick = () => {
  const trace = lastRound || game.exportTrace();
  input.release();
  const segments = traceSegments(trace).filter((s) => s.at(-1).t - s[0].t > C.warmup);
  const results = ['reactive', 'velocity'].map((mode) => {
    const runs = segments.map((s) => replay(s, mode));
    const steps = runs.reduce((s, r) => s + r.scoredSteps, 0);
    return {
      mode,
      n: runs.length,
      catches: runs.reduce((s, r) => s + r.interceptions, 0),
      distance: runs.reduce((s, r) => s + r.meanDistance * r.scoredSteps, 0) / steps,
    };
  });
  showInfo(
    `<h2>Your trace, two strategies</h2><div class="comparison">${results
      .map(
        (r) =>
          `<div>${r.mode === 'reactive' ? 'Reactive' : 'Predictive'}<strong>${
            r.catches
          }</strong><small>interceptions</small><strong>${
            Number.isFinite(r.distance) ? r.distance.toFixed(3) : '—'
          }</strong><small>mean distance · world units</small></div>`,
      )
      .join('')}</div><p>${
      segments.length
    } uninterrupted segment(s), fixed 60 Hz replay, identical robot and information cutoff. Each segment starts with the same robot pose and 2.4 s warm-up. Repeated contact counts again only after separation exceeds the capture radius by 0.04 units.</p><p>This measures pursuit of the same recorded path. You might move differently against another strategy. Short traces are illustrative, not scientific evidence.</p>`,
  );
};
function ui() {
  $('time').textContent = game.score.toFixed(1).padStart(4, '0');
  $('export').disabled = game.trace.length < 2;
  $('compare').disabled = !traceSegments(game.exportTrace()).some(
    (s) => s.at(-1).t - s[0].t > C.warmup,
  );
  let cue = '';
  if (game.phase === 'paused') cue = 'Hold the green ring to move · release to pause';
  if (game.phase === 'warmup') {
    const remaining = Math.max(0, C.warmup - (game.time - game.segmentStart));
    cue =
      remaining > 0
        ? `Keep moving · starting in ${remaining.toFixed(1)}s`
        : distance(fk(game.q).tip, game.target) <= C.captureRadius + 0.1
          ? 'Move away from the hand to begin'
          : 'Getting ready…';
  }
  if (game.phase === 'playing') cue = 'Keep it moving';
  if (cue !== lastCue) {
    $('cue').textContent = cue;
    lastCue = cue;
  }
  if (game.phase !== lastPhase) {
    const ended = ['caught', 'won'].includes(game.phase),
      overlay = game.phase === 'ready' || ended;
    $('overlay').hidden = !overlay;
    if (ended) {
      lastRound = game.exportTrace();
      $('headline').textContent = game.phase === 'won' ? 'You outran it.' : 'Caught you.';
      $('description').textContent = `${game.score.toFixed(1)} seconds survived with ${
        game.mode === 'velocity' ? 'predictive' : 'reactive'
      } pursuit.`;
      $('start').innerHTML = 'Play again <span>&gt;</span>';
      $('hint').textContent = 'Try the other strategy, or compare your trace.';
    } else if (game.phase === 'ready') {
      $('headline').innerHTML = 'Can it catch<br>your next move?';
      $('description').textContent = 'Drag the green target. Outrun the arm for 20 seconds.';
      $('start').innerHTML = 'Let’s play <span>&gt;</span>';
      $('hint').textContent = 'Mouse or touch · no downloads';
    }
    $('status').textContent =
      game.phase === 'playing'
        ? `${
            game.mode === 'velocity' ? '300 ms forecast' : 'Last observed position'
          } · 100 ms delayed vision`
        : '100 ms delayed vision · real joint limits';
    lastPhase = game.phase;
  }
}
function frame(now) {
  if (lastFrame !== null && game.active) {
    frameTimes.push(now - lastFrame);
    if (frameTimes.length > 1800) frameTimes.shift();
  }
  lastFrame = now;
  clock.advance(now, game);
  renderer.draw(game);
  ui();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Read-only diagnostics for reproducible browser validation; no alternate controller.
window.catchbot = {
  snapshot: () => ({
    phase: game.phase,
    time: game.time,
    score: game.score,
    q: [...game.q],
    target: { ...game.target },
    tip: fk(game.q).tip,
    diagnostics: structuredClone(game.diagnostics),
    rejected: game.gate.rejected,
    config: C,
  }),
  targetScreen: () => {
    const p = renderer.toScreen(game.target),
      r = $('field').getBoundingClientRect();
    return { x: p.x + r.left, y: p.y + r.top };
  },
  performance: () => [...frameTimes],
  exportTrace: () => game.exportTrace(),
};
