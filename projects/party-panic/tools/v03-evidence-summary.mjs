import { readFileSync, writeFileSync } from 'node:fs';
const directory = 'docs/evidence/v03-browser';
const summaries = [];
for (const label of ['before', 'after']) {
    const report = JSON.parse(readFileSync(`${directory}/${label}-report.json`, 'utf8'));
    for (const result of report.results) {
        const frames = (result.performanceSamples?.frameTimesMs ?? [])
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b);
        const percentile = (p) =>
            frames.length ? frames[Math.min(frames.length - 1, Math.floor(frames.length * p))] : null;
        summaries.push({
            label,
            mode: result.modeId,
            viewport: result.viewportName,
            passed: result.passed,
            samples: frames.length,
            medianFrameMs: percentile(0.5),
            p95FrameMs: percentile(0.95),
            p99FrameMs: percentile(0.99),
            minimumFrameMs: percentile(0),
            maximumFrameMs: percentile(1),
            approximateMedianFPS: frames.length ? 1000 / percentile(0.5) : null,
            loading: result.loading,
            jsHeap: result.performanceSamples?.jsHeap,
            diagnosticsFPS: result.diagnostics?.fps,
            video: result.video?.path,
            fullscreen: result.gameplay?.fullscreenObserved,
            displayStatus: result.gameplay?.displayStatus
        });
    }
}
writeFileSync(
    `${directory}/comparison.json`,
    JSON.stringify(
        {
            baseline: '43cb574b1fb3e6d55fe0187f90d03027cbaafdc5',
            implementation: '778bdb73ee81447251feb85cd8698c102454fd94',
            scope: 'Separate sequential Chromium/SwiftShader runs on localhost. Active interval includes screenshots; not phone hardware or steady-state performance certification. Heap is JavaScript-only and excludes native/GPU memory. No causal performance claim from a single run.',
            summaries
        },
        null,
        2
    ) + '\n'
);
