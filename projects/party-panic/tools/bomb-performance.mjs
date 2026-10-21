/* global window, performance, console */
// Reproducible isolated Chromium measurement; all gameplay uses the normal engine.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import process from 'node:process';
(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(process.env.PARTY_URL || 'http://localhost:5174/party-panic/?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo-mode').selectOption('bomb-arena');
    await page.locator('#bot-count').selectOption('7');
    await page.locator('#solo').click();
    await page.waitForFunction(() => window.partyDebug.getState().phase === 'racing');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const initial = await page.evaluate(() => ({
        diagnostics: window.partyDebug.getDiagnostics(),
        memory: performance.memory?.usedJSHeapSize
    }));
    const inputAt = Date.now();
    await page.keyboard.down('d');
    await page.waitForFunction(() => window.partyDebug.getState().players[0].x > 1);
    await page.keyboard.up('d');
    const inputResponseMs = Date.now() - inputAt;
    const samples = [];
    for (let n = 0; n < 5; n++) {
        if ((await page.evaluate(() => window.partyDebug.getState())).phase === 'results') {
            await page.locator('#rematch').click();
            await page.locator('#start').click();
            await page.waitForFunction(() => window.partyDebug.getState().phase === 'racing');
        }
        await page.evaluate(() => window.partyDebug.clearMeasurements());
        const beforeMetrics = await cdp.send('Performance.getMetrics');
        const sampledAt = Date.now();
        await page.waitForTimeout(2000);
        const afterMetrics = await cdp.send('Performance.getMetrics');
        const metric = (m) => m.metrics.find((x) => x.name === 'TaskDuration')?.value ?? 0;
        const mainThreadTaskPercent =
            ((metric(afterMetrics) - metric(beforeMetrics)) * 100000) / (Date.now() - sampledAt);
        samples.push(
            await page.evaluate(() => {
                const debug = window.partyDebug,
                    s = debug.getState(),
                    before = performance.now();
                debug.hostAdvance(1);
                const cpu = performance.now() - before;
                return {
                    phase: s.phase,
                    diagnostics: debug.getDiagnostics(),
                    simulationMsPerStep: cpu / 60,
                    snapshotBytes: JSON.stringify(s).length,
                    memory: performance.memory?.usedJSHeapSize
                };
            })
        );
        samples.at(-1).mainThreadTaskPercent = mainThreadTaskPercent;
    }
    const rounds = [];
    for (let n = 0; n < 5; n++) {
        await page.evaluate(() => window.partyDebug.hostAdvance(95));
        await page.locator('#rematch').click();
        await page.locator('#start').click();
        await page.evaluate(() => window.partyDebug.hostAdvance(4));
        rounds.push(
            await page.evaluate(() => ({
                memory: performance.memory?.usedJSHeapSize,
                diagnostics: window.partyDebug.getDiagnostics()
            }))
        );
    }
    const result = {
        environment: {
            browser: browser.version(),
            viewport: '844x390',
            renderer: 'Chrome headless SwiftShader',
            note: 'one browser, seven legal-input bots; five samples and five accelerated rematches, not physical-phone certification'
        },
        inputResponseMs,
        initial,
        samples,
        rounds
    };
    fs.writeFileSync('docs/evidence/bomb-arena/performance.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
