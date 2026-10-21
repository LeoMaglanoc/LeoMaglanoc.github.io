import { test, expect } from '@playwright/test';
for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['portrait', 390, 844],
    ['landscape', 844, 390],
    ['wide-landscape', 915, 412],
    ['narrow-landscape', 667, 375]
] as const) {
    test(`Bomb Arena ${name}: input, fuse, elimination, rematch and mode switch`, async ({ browser }, info) => {
        const context = await browser.newContext({
            viewport: { width, height },
            hasTouch: name !== 'desktop',
            isMobile: name !== 'desktop'
        });
        const page = await context.newPage(),
            errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('http://127.0.0.1:5173/party-panic/?debug=1');
        await page.waitForFunction(() => window.partyDebug);
        await page.locator('#solo-mode').selectOption('bomb-arena');
        await page.locator('#bot-count').selectOption('0');
        await page.locator('#solo').click();
        await page.waitForFunction(() => window.partyDebug.getState()?.phase === 'racing');
        expect(await page.evaluate(() => window.partyDebug.getState().players[0].x)).toBe(1);
        await expect(page.locator('#bomb-canvas')).toBeVisible();
        await expect(page.locator('#fire')).toBeHidden();
        await expect(page.locator('#jump')).toBeHidden();
        if (name === 'desktop') {
            await page.keyboard.down('d');
            await page.waitForFunction(() => window.partyDebug.getState().players[0].x >= 3);
            await page.keyboard.up('d');
        } else {
            const stick = (await page.locator('#joystick').boundingBox())!;
            const cdp = await context.newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchStart',
                touchPoints: [{ x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }]
            });
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: stick.x + stick.width * 0.85, y: stick.y + stick.height / 2 }]
            });
            await page.waitForFunction(() => window.partyDebug.getState().players[0].x >= 3);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await expect.poll(() => page.evaluate(() => window.partyDebug.getInput().axes)).toEqual([0, 0]);
        }
        await page.locator('#bomb-canvas').click();
        if (name === 'desktop') await page.keyboard.down('Space');
        else await page.locator('#bomb-button').tap();
        await page.waitForFunction(() => window.partyDebug.getState().bomb!.bombs.length === 1);
        if (name === 'desktop') await page.keyboard.down('Space');
        expect((await page.evaluate(() => window.partyDebug.getState())).bomb!.bombs).toHaveLength(1);
        const planted = await page.evaluate(() => window.partyDebug.getState().bomb!);
        expect(planted.bombs[0].at - planted.tick).toBeLessThanOrEqual(90);
        await page.screenshot({ path: info.outputPath(`${name}-bomb.png`) });
        await page.keyboard.up('Space');
        await page.waitForFunction(() => window.partyDebug.getState().phase === 'results');
        const terminal = await page.evaluate(() => window.partyDebug.getState());
        expect(terminal.bomb!.winner).toBeNull();
        expect(terminal.players[0].health).toBe(0);
        await page.screenshot({ path: info.outputPath(`${name}-results.png`) });
        await page.locator('#rematch').click();
        expect((await page.evaluate(() => window.partyDebug.getState())).bomb!.bombs).toHaveLength(0);
        await page.locator('[data-mode="laser-tag"]').click();
        await expect(page.locator('#start')).toContainText('Laser Tag');
        await page.locator('[data-mode="obstacle-dash"]').click();
        await page.locator('#start').click();
        await page.waitForFunction(() => window.partyDebug.getState().phase === 'racing');
        await expect(page.locator('#jump')).toBeVisible();
        await expect(page.locator('#bomb-canvas')).toBeHidden();
        expect(errors).toEqual([]);
        await context.close();
    });
}
test('Bomb Arena seven bots use real legal inputs and finish an accelerated round', async ({ page }) => {
    await page.goto('?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo-mode').selectOption('bomb-arena');
    await page.locator('#bot-count').selectOption('7');
    await page.locator('#solo').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(4));
    const start = await page.evaluate(() => window.partyDebug.getState());
    expect(start.players).toHaveLength(8);
    expect(start.bomb!.width).toBe(17);
    for (let n = 0; n < 18; n++) {
        await page.evaluate(() => window.partyDebug.hostAdvance(5));
        if ((await page.evaluate(() => window.partyDebug.getState())).phase === 'results') break;
    }
    const end = await page.evaluate(() => window.partyDebug.getState());
    expect(end.phase).toBe('results');
    expect(end.players.some((p) => p.deaths > 0)).toBe(true);
});
