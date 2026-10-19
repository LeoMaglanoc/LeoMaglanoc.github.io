import { test, expect, type Page } from '@playwright/test';

/** Stub browser permissions, while retaining actual clicks and engine gameplay. */
async function displayBrowser(page: Page, denied: boolean) {
    await page.addInitScript(
        ({ denied }) => {
            const calls: { type: string; active: boolean }[] = [];
            Object.assign(window, { displayCalls: calls });
            let fullscreen: Element | null = null;
            Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
            Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
            Element.prototype.requestFullscreen = function () {
                calls.push({ type: 'enter', active: navigator.userActivation.isActive });
                if (denied) return Promise.reject(new Error('Test browser refused fullscreen'));
                fullscreen = document.documentElement;
                document.dispatchEvent(new Event('fullscreenchange'));
                return Promise.resolve();
            };
            document.exitFullscreen = () => {
                calls.push({ type: 'exit', active: navigator.userActivation.isActive });
                fullscreen = null;
                document.dispatchEvent(new Event('fullscreenchange'));
                return Promise.resolve();
            };
            Object.defineProperty(screen.orientation, 'lock', {
                configurable: true,
                value: () => Promise.reject(new Error('Test browser requires manual rotation'))
            });
        },
        { denied }
    );
}

test('denied gesture fullscreen keeps solo input and manual rotation usable', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await displayBrowser(page, true);
    await page.goto('./?debug=1');
    await page.waitForFunction(() => !!window.partyDebug);
    await page.locator('#bot-count').selectOption('0');
    await page.locator('#solo').click();
    expect(await page.evaluate(() => Reflect.get(window, 'displayCalls'))).toEqual([{ type: 'enter', active: true }]);
    await expect(page.locator('#countdown')).toBeVisible();
    await expect(page.locator('.portrait-hint')).toBeVisible();
    await page.waitForFunction(() => window.partyDebug.getState()?.phase === 'racing');
    const z = await page.evaluate(() => window.partyDebug.getState().players[0].z);
    await page.keyboard.down('w');
    await page.waitForFunction((before) => window.partyDebug.getState().players[0].z < before - 1, z);
    await page.keyboard.up('w');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.portrait-hint')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/portrait-game/);
    await page.locator('#diagnostics > summary').click();
    await expect(page.locator('#display-status')).toContainText('Test browser refused fullscreen');
    expect(errors).toEqual([]);
});

test('results and rematch retain display state; explicit exit and reenter work', async ({ page }) => {
    await displayBrowser(page, false);
    await page.goto('./?debug=1');
    await page.waitForFunction(() => !!window.partyDebug);
    // A persisted pagehide models a bfcache departure: display resources can be
    // released, but the controller must still accept a later user gesture.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await page.locator('#bot-count').selectOption('0');
    await page.locator('#solo').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    // Exercise authoritative timeout, with no fabricated score or finish state.
    await page.evaluate(() => window.partyDebug.hostAdvance(125));
    await expect(page.locator('#rematch')).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'displayCalls'))).toHaveLength(1);
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.locator('#rematch').click();
    await expect(page.locator('#start')).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'displayCalls'))).toHaveLength(1);
    await page.locator('#diagnostics > summary').click();
    await page.locator('#display-exit').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.locator('#start').click();
    await expect(page.locator('#countdown')).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'displayCalls'))).toEqual([
        { type: 'enter', active: true },
        { type: 'exit', active: true },
        { type: 'enter', active: true }
    ]);
    await page.locator('#leave').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(page.locator('#solo')).toBeVisible();
});
