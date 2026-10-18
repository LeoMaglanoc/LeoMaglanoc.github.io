import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replay, summarize } from '../src/replay.js';
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../results');
const { fixtures, config } = JSON.parse(fs.readFileSync(path.join(out, 'fixtures.json')));
const modelFile = path.join(out, 'timestral-predictions.json.gz');
const ml = fs.existsSync(modelFile)
  ? JSON.parse(zlib.gunzipSync(fs.readFileSync(modelFile)))
  : null;
const results = [],
  baselinePredictions = [];
for (const f of fixtures)
  for (const protocol of ['algorithm', 'deployment'])
    for (const mode of ['reactive', 'velocity', ...(ml ? ['timestral'] : [])]) {
      const options = { protocol };
      if (mode === 'timestral')
        options.suppliedPredictions = ml.records.filter((p) => p.fixture === f.id);
      const r = replay(f.events, mode, options);
      const { positions, predictions, ...metrics } = r;
      results.push({ fixture: f.id, kind: f.kind, ...metrics });
      if (mode !== 'timestral' && protocol === 'algorithm')
        baselinePredictions.push({ fixture: f.id, model: mode, predictions });
    }
const grouped = [];
for (const protocol of ['algorithm', 'deployment'])
  for (const mode of ['reactive', 'velocity', ...(ml ? ['timestral'] : [])]) {
    const runs = results.filter((r) => r.protocol === protocol && r.model === mode);
    grouped.push({
      protocol,
      model: mode,
      independentTrajectories: runs.length,
      interceptions: runs.reduce((s, r) => s + r.interceptions, 0),
      meanFirstInterception: summarize(
        runs.map((r) => r.firstInterception).filter((x) => x !== null),
      ).mean,
      meanDistance: summarize(runs.map((r) => r.meanDistance)).mean,
      meanProximitySeconds: summarize(runs.map((r) => r.proximitySeconds)).mean,
      trajectoryMeanError: summarize(runs.map((r) => r.errorAt300ms.mean)),
      pooledErrorAt300ms: summarize(runs.flatMap((r) => r.forecastErrors)),
      latencyP50Ms: summarize(runs.map((r) => r.latencyMs.median)).median,
      latencyP95Ms: Math.max(...runs.map((r) => r.latencyMs.p95)),
      staleResponses: runs.reduce((s, r) => s + r.staleResponses, 0),
      missedRequests: runs.reduce((s, r) => s + r.missedRequests, 0),
      expiredSteps: runs.reduce((s, r) => s + r.expiredSteps, 0),
      unavailableSteps: runs.reduce((s, r) => s + r.unavailableSteps, 0),
      fallbackRate: 0,
    });
  }
const coverage = [];
if (ml)
  for (const kind of [...new Set(fixtures.map((f) => f.kind))]) {
    let n = 0,
      inside = [0, 0];
    for (const f of fixtures.filter((f) => f.kind === kind))
      for (const p of ml.records.filter((p) => p.fixture === f.id)) {
        if (p.targetTime > f.events.at(-1).t + 1e-9) continue;
        const truth =
          f.events[Math.min(f.events.length - 1, Math.floor((p.targetTime + 1e-8) * 30))];
        ['x', 'y'].forEach((key, j) => {
          if (
            truth[key] >= p.rawQuantiles[j][8][ml.quantileLevels.indexOf(0.05)] &&
            truth[key] <= p.rawQuantiles[j][8][ml.quantileLevels.indexOf(0.95)]
          )
            inside[j]++;
        });
        n++;
      }
    coverage.push({
      kind,
      forecastWindows: n,
      marginal90CoverageX: inside[0] / n,
      marginal90CoverageY: inside[1] / n,
    });
  }
fs.writeFileSync(
  path.join(out, 'baseline-predictions.json.gz'),
  zlib.gzipSync(JSON.stringify(baselinePredictions)),
);
fs.writeFileSync(
  path.join(out, 'evaluation.json'),
  JSON.stringify(
    {
      config,
      units: 'world units; seconds; milliseconds for inference',
      protocols: {
        algorithm:
          'Zero equal computation latency. Same delayed cutoff, 2.4s warmup, robot and fixed 300ms horizon.',
        deployment:
          'Measured per-call CPU latency, one inference lane; busy requests skipped and counted. Result applied on first 60Hz control tick after completion. Missed deadlines hold, never substitute another predictor.',
      },
      interceptionRule:
        'Count entry into capture radius; rearm only after separation > captureRadius + 0.04. Continue after catches.',
      humanTrajectories: 0,
      results,
      grouped,
      coverage,
    },
    null,
    2,
  ) + '\n',
);
console.table(
  grouped.map(
    ({
      protocol,
      model,
      interceptions,
      meanDistance,
      trajectoryMeanError,
      latencyP50Ms,
      latencyP95Ms,
    }) => ({
      protocol,
      model,
      interceptions,
      meanDistance,
      error: trajectoryMeanError.mean,
      latencyP50Ms,
      latencyP95Ms,
    }),
  ),
);
