/* global window */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir = 'docs/evidence/v02-baseline';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const reports = [];
for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['phone-landscape', 844, 390],
    ['phone-portrait', 390, 844]
]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5174/party-panic/?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.screenshot({ path: `${dir}/${name}-home.png` });
    await page.locator('#bot-count').selectOption('0');
    await page.locator('#solo').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(4));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/${name}-race.png` });
    const motion = await page.evaluate(() => {
        const d = window.partyDebug;
        const start = d.getState().players[0];
        let maxY = start.y,
            apexAt = 0,
            flight = 0,
            firstLift = 0,
            topSpeed = 0;
        d.setTestInput([0, -1], 1);
        for (let i = 1; i <= 65; i++) {
            d.hostAdvance(1 / 60);
            const p = d.getState().players[0];
            topSpeed = Math.max(topSpeed, Math.hypot(p.vx, p.vz));
            if (!firstLift && p.y > start.y + 0.01) firstLift = i / 60;
            if (p.y > maxY) {
                maxY = p.y;
                apexAt = i / 60;
            }
            if (firstLift && !flight && i > 10 && p.y < start.y + 0.02) flight = i / 60;
        }
        return {
            start,
            final: d.getState().players[0],
            topSpeed,
            maxY,
            apexAt,
            firstLift,
            flight,
            diagnostics: d.getDiagnostics()
        };
    });
    reports.push({ name, width, height, errors, motion });
    await page.close();
}
writeFileSync(
    `${dir}/report.json`,
    JSON.stringify(
        { at: new Date().toISOString(), renderer: 'Chromium SwiftShader; emulation, not phones', reports },
        null,
        2
    )
);
await browser.close();
