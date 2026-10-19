import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';

// Run from the project directory: PARTY_URL=https://... node tools/production-qa.ts
const url = process.env.PARTY_URL || 'http://127.0.0.1:8080/party-panic/';
const label = process.env.PARTY_QA_LABEL || 'production';
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const results = [];
await mkdir('docs/evidence', { recursive: true });
try {
    for (const [name, width, height] of [
        ['desktop', 1440, 900],
        ['phone-portrait', 390, 844],
        ['phone-landscape', 844, 390]
    ] as const) {
        const context = await browser.newContext({
            viewport: { width, height },
            hasTouch: name !== 'desktop',
            isMobile: name !== 'desktop'
        });
        const page = await context.newPage(),
            errors: string[] = [];
        let script = '';
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('response', (response) => {
            const path = new URL(response.url()).pathname;
            if (response.status() >= 400) errors.push(`${response.status()} ${path}`);
            if (/\/assets\/index-.*\.js$/.test(path)) script = path;
        });
        const response = await page.goto(url);
        await page.waitForFunction(() => document.querySelector('#stats')?.textContent?.includes('FPS'));
        await page.screenshot({ path: `docs/evidence/${name}-${label}-home.png` });
        await page.locator('#solo').click();
        await page.waitForFunction(() => document.querySelector('#hud')?.textContent?.includes('TIME LEFT'));
        await page.waitForFunction(() => document.querySelector('#countdown')?.classList.contains('hidden'));
        await page.screenshot({ path: `docs/evidence/${name}-${label}-race.png` });
        const state = await page.evaluate(() => ({ debugAPI: typeof window.partyDebug, scroll: [scrollX, scrollY] }));
        if (errors.length || state.debugAPI !== 'undefined' || state.scroll.some((v) => v !== 0)) {
            throw new Error(JSON.stringify({ name, errors, state }));
        }
        results.push({
            name,
            url: page.url(),
            status: response?.status(),
            viewport: [width, height],
            script,
            ...state,
            runtimeErrors: errors
        });
        await context.close();
    }
    const report = {
        date: new Date().toISOString(),
        browser: browser.version(),
        image: process.env.PARTY_IMAGE || null,
        results
    };
    await writeFile(`docs/evidence/${label}-qa.json`, JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report) + '\n');
} finally {
    await browser.close();
}
