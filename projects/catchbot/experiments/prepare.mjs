import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG as C, boundTarget } from '../src/config.js';
import { historyAt } from '../src/predictors.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2] || path.join(root, 'results');
fs.mkdirSync(output, { recursive: true });
const fixtures = [];
const triangle = (u) => (2 / Math.PI) * Math.asin(Math.sin(u));
for (const kind of ['straight', 'circle', 'figure-eight', 'reversal', 'stop-go'])
  for (let seed = 0; seed < 3; seed++) {
    const events = [],
      phase = seed * 0.7,
      speed = 0.7 + seed * 0.15;
    for (let i = 0; i <= 360; i++) {
      const t = i / 30;
      let p;
      if (kind === 'straight')
        p = { x: 0.65 * triangle(speed * t + phase), y: 0.2 * Math.sin(phase) };
      if (kind === 'circle')
        p = { x: 0.62 * Math.cos(speed * t + phase), y: 0.62 * Math.sin(speed * t + phase) };
      if (kind === 'figure-eight')
        p = { x: 0.66 * Math.sin(speed * t + phase), y: 0.38 * Math.sin(2 * speed * t + phase) };
      if (kind === 'reversal')
        p = {
          x: 0.65 * triangle(1.6 * speed * t + phase),
          y: 0.35 * triangle(0.9 * speed * t + phase),
        };
      if (kind === 'stop-go') {
        const cycle = t % 3,
          progress = Math.floor(t / 3) * 1.2 + Math.min(cycle, 1.2);
        p = {
          x: 0.65 * Math.sin(speed * progress + phase),
          y: 0.35 * Math.cos(0.8 * speed * progress + phase),
        };
      }
      events.push({ t, ...boundTarget(p) });
    }
    fixtures.push({ id: `${kind}-${seed}`, kind, seed, events });
  }
const windows = [];
for (const f of fixtures)
  for (let k = 0; k <= 720; k += 6) {
    const t = k * C.dt,
      h = historyAt(f.events, t - C.delay);
    if (!h) continue;
    windows.push({
      fixture: f.id,
      generatedAt: t,
      sourceObservationTime: h.at(-1).t,
      targetTime: h.at(-1).t + C.horizon,
      sampleTimes: h.map((p) => p.t),
      context: [h.map((p) => p.x), h.map((p) => p.y)],
    });
  }
fs.writeFileSync(
  path.join(output, 'fixtures.json'),
  JSON.stringify({ schema: 'catchbot-fixtures-v1', config: C, fixtures }),
);
fs.writeFileSync(path.join(output, 'windows.json'), JSON.stringify({ config: C, windows }));
console.log(`Saved ${fixtures.length} synthetic trajectories and ${windows.length} causal windows`);
