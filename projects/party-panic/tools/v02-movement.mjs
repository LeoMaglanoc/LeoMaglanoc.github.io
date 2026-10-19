/* global window, process, console */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Runs genuine host Ammo steps; never modifies position, velocity or score.
// Start Vite separately, then run: node tools/v02-movement.mjs before
const label = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use an alphanumeric measurement label');
const output = 'docs/evidence/v02-movement';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const measurements = [];
for (const scenario of ['cardinal', 'diagonal', 'jump', 'buffered-landing', 'expired-air-jump']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto((process.env.PARTY_URL || 'http://127.0.0.1:5174/party-panic/') + '?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo').click();
    const result = await page.evaluate((scenario) => {
        const d = window.partyDebug;
        d.hostAdvance(4);
        const start = d.getState().players[0];
        const samples = [];
        let jumpSequence = 0;
        for (let tick = 1; tick <= 150; tick++) {
            const axes = scenario === 'diagonal' ? [Math.SQRT1_2, -Math.SQRT1_2] : [0, -1];
            if (scenario === 'cardinal' || scenario === 'diagonal') {
                d.setTestInput(tick <= 30 ? axes : [0, 0], 0);
            } else {
                if (tick === 1) jumpSequence++;
                // Before the first landing at ~0.833s; a midair press must expire.
                if (scenario === 'buffered-landing' && tick === 47) jumpSequence++;
                if (scenario === 'expired-air-jump' && tick === 15) jumpSequence++;
                d.setTestInput(axes, jumpSequence);
            }
            d.hostAdvance(1 / 60);
            const p = d.getState().players[0];
            samples.push({ tick, time: tick / 60, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz });
        }
        const topSpeed = Math.max(...samples.slice(0, 30).map((p) => Math.hypot(p.vx, p.vz)));
        const accelerated = samples.find((p) => Math.hypot(p.vx, p.vz) >= 2.799);
        const stopped = samples.find((p) => p.tick > 30 && Math.hypot(p.vx, p.vz) < 0.001);
        const firstLanding = samples.find((p) => p.tick > 10 && p.y <= start.y + 0.02);
        return {
            scenario,
            topSpeed,
            accelerationSeconds: accelerated?.time,
            brakingSeconds: stopped ? stopped.time - 0.5 : null,
            brakingDistance: stopped ? Math.hypot(stopped.x - samples[29].x, stopped.z - samples[29].z) : null,
            jumpApex: Math.max(...samples.slice(0, 45).map((p) => p.y)) - start.y,
            jumpInputToLift: samples.find((p) => p.y > start.y + 0.01)?.time,
            firstLandingSeconds: firstLanding?.time,
            jumpDistance: firstLanding ? Math.hypot(firstLanding.x - start.x, firstLanding.z - start.z) : null,
            jumpEvents: d.getLogs().filter((e) => e.type === 'jump').length,
            samples
        };
    }, scenario);
    measurements.push({ ...result, errors });
    await page.close();
}
writeFileSync(
    `${output}/${label}.json`,
    JSON.stringify(
        { renderer: 'Chromium SwiftShader, real Ammo, fixed 60 Hz; not physical-phone evidence', measurements },
        null,
        2
    )
);
console.log(
    JSON.stringify(
        measurements.map((measurement) => ({ ...measurement, samples: undefined })),
        null,
        2
    )
);
await browser.close();
