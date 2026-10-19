import { chromium, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

// Production-only browser evidence. No debug URL, engine hooks, teleports or score mutation.
// Run from the project directory: PARTY_URL=https://... node tools/v02-release-qa.ts
const url = process.env.PARTY_URL || 'http://127.0.0.1:8080/party-panic/';
const label = process.env.PARTY_QA_LABEL || 'local';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('PARTY_QA_LABEL must be alphanumeric');
if (new URL(url).searchParams.has('debug')) throw new Error('Use a production URL without debug mode');
const directory = 'docs/evidence/v02-release';
await mkdir(directory, { recursive: true });
const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(homedir(), '.cache', 'ms-playwright');
let videoAvailable = false;
try {
    for (const name of await readdir(cache)) {
        if (!name.startsWith('ffmpeg-')) continue;
        await access(path.join(cache, name, 'ffmpeg-linux'));
        videoAvailable = true;
    }
} catch {
    // Screenshots and measurements remain available without the optional recorder.
}
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const results: unknown[] = [];
let failures = 0;

async function viewportEvidence(page: Page) {
    return page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        return {
            debugAPI: typeof window.partyDebug,
            viewport: { width: innerWidth, height: innerHeight },
            visualViewport: {
                width: visualViewport?.width,
                height: visualViewport?.height,
                scale: visualViewport?.scale
            },
            scroll: {
                x: scrollX,
                y: scrollY,
                width: document.documentElement.scrollWidth,
                height: document.documentElement.scrollHeight
            },
            canvas: rect
                ? {
                      x: rect.x,
                      y: rect.y,
                      width: rect.width,
                      height: rect.height,
                      bufferWidth: canvas!.width,
                      bufferHeight: canvas!.height
                  }
                : null,
            fullscreenObserved: document.fullscreenElement !== null,
            orientationObserved: screen.orientation?.type || null,
            hud: document.querySelector('#hud')?.textContent,
            reticleVisible: !document.querySelector('#reticle')?.classList.contains('hidden'),
            portraitHint: getComputedStyle(document.querySelector('.portrait-hint')!).display,
            displayStatus: document.querySelector('#display-status')?.textContent
        };
    });
}

try {
    for (const modeId of ['obstacle-dash', 'laser-tag'] as const) {
        for (const [viewportName, width, height] of [
            ['desktop', 1440, 900],
            ['phone-landscape', 844, 390],
            ['phone-portrait', 390, 844]
        ] as const) {
            const scenario = `${label}-${modeId}-${viewportName}`;
            const recording =
                viewportName === 'phone-landscape' && videoAvailable && process.env.PARTY_RECORD_VIDEO !== '0';
            const context = await browser.newContext({
                viewport: { width, height },
                hasTouch: viewportName !== 'desktop',
                isMobile: viewportName !== 'desktop',
                acceptDownloads: true,
                ...(recording ? { recordVideo: { dir: `${directory}/videos`, size: { width, height } } } : {})
            });
            const page = await context.newPage();
            const runtimeErrors: string[] = [];
            const consoleErrors: string[] = [];
            const httpFailures: string[] = [];
            const requestFailures: string[] = [];
            const assets: { url: string; status: number; bytes: number; sha256: string }[] = [];
            const assetReads: Promise<void>[] = [];
            page.on('pageerror', (error) => runtimeErrors.push(error.message));
            page.on('console', (message) => {
                if (message.type() === 'error') consoleErrors.push(message.text());
            });
            page.on('requestfailed', (request) =>
                requestFailures.push(`${request.url()}: ${request.failure()?.errorText}`)
            );
            page.on('response', (response) => {
                if (response.status() >= 400) httpFailures.push(`${response.status()} ${response.url()}`);
                if (/\/assets\/[^/?]+\.(js|css)(\?|$)/.test(response.url())) {
                    assetReads.push(
                        (async () => {
                            try {
                                const body = await response.body();
                                assets.push({
                                    url: response.url(),
                                    status: response.status(),
                                    bytes: body.byteLength,
                                    sha256: createHash('sha256').update(body).digest('hex')
                                });
                            } catch (error) {
                                requestFailures.push(`Could not hash asset ${response.url()}: ${String(error)}`);
                            }
                        })()
                    );
                }
            });
            let result: Record<string, unknown> = {
                scenario,
                modeId,
                viewportName,
                expectedViewport: { width, height }
            };
            try {
                const response = await page.goto(url);
                await page.locator('#solo').waitFor({ state: 'visible' });
                await page.waitForFunction(() => !(document.querySelector('#solo') as HTMLButtonElement)?.disabled);
                await page.locator('#solo-mode').selectOption(modeId);
                await page.locator('#bot-count').selectOption('3');
                await page.screenshot({ path: `${directory}/${scenario}-home.png` });
                const home = await viewportEvidence(page);
                if (home.debugAPI !== 'undefined') throw new Error('Debug API exposed in production bundle');
                await page.locator('#solo').click();
                await page.waitForFunction(() => !document.querySelector('#hud')?.classList.contains('hidden'));
                await page.waitForFunction(() => document.querySelector('#countdown')?.classList.contains('hidden'));
                const activeAt = Date.now();
                await page.screenshot({ path: `${directory}/${scenario}-game.png` });
                const inputs: string[] = [];
                if (viewportName === 'desktop') {
                    await page.keyboard.down('KeyW');
                    inputs.push('Keyboard W held for 8 real seconds');
                    if (modeId === 'laser-tag') {
                        await page.mouse.move(width * 0.65, height * 0.5);
                        await page.mouse.down();
                        inputs.push('Primary mouse held; pointer movement for aim');
                    }
                    for (let second = 0; second < 8; second++) {
                        if (modeId === 'obstacle-dash' && second % 2 === 0) await page.keyboard.press('Space');
                        if (modeId === 'laser-tag')
                            await page.mouse.move(width * 0.65 + second * 5, height * 0.5 + Math.sin(second) * 8);
                        await page.waitForTimeout(1000);
                    }
                    await page.keyboard.up('KeyW');
                    if (modeId === 'laser-tag') await page.mouse.up();
                } else {
                    const cdp = await context.newCDPSession(page);
                    const joystick = await page.locator('#joystick').boundingBox();
                    const action = await page.locator(modeId === 'laser-tag' ? '#fire' : '#jump').boundingBox();
                    if (!joystick || !action) throw new Error('Touch controls missing');
                    const left = { id: 1, x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2 };
                    const right = { id: 2, x: action.x + action.width / 2, y: action.y + action.height / 2 };
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
                    left.y -= joystick.height * 0.3;
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [left] });
                    inputs.push('Browser CDP touch: movement joystick held forward');
                    if (modeId === 'laser-tag') {
                        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
                        inputs.push('Simultaneous second touch: fire held and dragged for aim');
                    } else inputs.push('Simultaneous second touch: jump tapped every 2 seconds');
                    for (let second = 0; second < 8; second++) {
                        if (modeId === 'laser-tag') {
                            right.x += second % 2 === 0 ? 7 : -4;
                            await cdp.send('Input.dispatchTouchEvent', {
                                type: 'touchMove',
                                touchPoints: [left, right]
                            });
                        } else if (second % 2 === 0) {
                            await cdp.send('Input.dispatchTouchEvent', {
                                type: 'touchStart',
                                touchPoints: [left, right]
                            });
                            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [left] });
                        }
                        await page.waitForTimeout(1000);
                    }
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                    await cdp.detach();
                }
                await page.evaluate(() => document.exitPointerLock?.());
                await page.screenshot({ path: `${directory}/${scenario}-hud.png` });
                const gameplay = await viewportEvidence(page);
                await page.locator('#diagnostics summary').click();
                const downloadPromise = page.waitForEvent('download');
                await page.locator('#export').click();
                const download = await downloadPromise;
                const diagnosticPath = `${directory}/${scenario}-diagnostics.json`;
                await download.saveAs(diagnosticPath);
                const diagnostics = JSON.parse(await readFile(diagnosticPath, 'utf8'));
                await Promise.all(assetReads);
                const checks = {
                    httpOK: response?.ok() === true && httpFailures.length === 0,
                    debugAbsent: gameplay.debugAPI === 'undefined',
                    noRuntimeErrors: runtimeErrors.length === 0,
                    noConsoleErrors: consoleErrors.length === 0,
                    noRequestFailures: requestFailures.length === 0,
                    noScroll:
                        gameplay.scroll.x === 0 &&
                        gameplay.scroll.y === 0 &&
                        gameplay.scroll.width <= gameplay.viewport.width &&
                        gameplay.scroll.height <= gameplay.viewport.height,
                    expectedMode: diagnostics.modeId === modeId,
                    canvasFitsViewport:
                        !!gameplay.canvas &&
                        Math.abs(gameplay.canvas.width - (gameplay.visualViewport.width ?? gameplay.viewport.width)) <
                            2 &&
                        Math.abs(
                            gameplay.canvas.height - (gameplay.visualViewport.height ?? gameplay.viewport.height)
                        ) < 2,
                    modeHUD:
                        modeId === 'laser-tag'
                            ? gameplay.hud?.includes('TAGS') === true
                            : gameplay.hud?.includes('CHECKPOINT') === true
                };
                const passed = Object.values(checks).every(Boolean);
                if (!passed) failures++;
                result = {
                    ...result,
                    passed,
                    checks,
                    status: response?.status(),
                    finalURL: page.url(),
                    requestedInputHoldSeconds: 8,
                    gameplayCaptureWindowSeconds: (Date.now() - activeAt) / 1000,
                    inputs,
                    home,
                    gameplay,
                    diagnostics,
                    assets,
                    runtimeErrors,
                    consoleErrors,
                    httpFailures,
                    requestFailures
                };
            } catch (error) {
                failures++;
                result = {
                    ...result,
                    passed: false,
                    failure: String(error),
                    runtimeErrors,
                    consoleErrors,
                    httpFailures,
                    requestFailures,
                    assets
                };
                await page.screenshot({ path: `${directory}/${scenario}-failure.png` }).catch(() => {});
            } finally {
                const video = page.video();
                await context.close();
                if (video) {
                    const videoPath = `${directory}/videos/${scenario}.webm`;
                    await video.saveAs(videoPath);
                    await video.delete();
                    result.video = {
                        path: videoPath,
                        description:
                            'Automated Chromium viewport capture; includes loading/countdown and 8 seconds of real-input gameplay. Not a human phone recording.'
                    };
                }
            }
            results.push(result);
            process.stdout.write(
                JSON.stringify({ scenario, passed: result.passed, failure: result.failure || null }) + '\n'
            );
        }
    }
} finally {
    const report = {
        date: new Date().toISOString(),
        url,
        browser: browser.version(),
        renderer:
            'Automated Chromium with SwiftShader software rendering; emulated viewports, not physical Android/iOS devices.',
        limitations: [
            'Solo host with 3 genuine simulation-controlled bots; this report does not certify WebRTC multiplayer.',
            'FPS diagnostics include countdown and the active interval; these are not steady-state phone performance measurements.',
            'Fullscreen/orientation fields record only actual automated browser API outcomes; they do not certify Android or iPhone behavior.',
            'No physical-phone performance target is verified by this run.'
        ],
        videoAvailable,
        failures,
        results
    };
    await writeFile(`${directory}/${label}-report.json`, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
if (failures) process.exitCode = 1;
