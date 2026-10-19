import { test, expect } from '@playwright/test';
for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['phone-portrait', 390, 844],
    ['phone-landscape', 844, 390]
] as const) {
    test(`${name}: home, touch input, portrait hint and no page scroll`, async ({ browser }) => {
        const context = await browser.newContext({
            viewport: { width, height },
            hasTouch: name !== 'desktop',
            isMobile: name !== 'desktop',
            deviceScaleFactor: 1
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('http://127.0.0.1:5173/party-panic/?debug=1');
        await page.waitForFunction(() => window.partyDebug);
        await expect(page.locator('#solo')).toBeInViewport();
        await expect(page.locator('#host')).toBeInViewport();
        await expect(page.locator('#join-open')).toBeInViewport();
        await page.screenshot({ path: `test-results/${name}-home.png` });
        await page.locator('#bot-count').selectOption('0');
        await page.locator('#solo').click();
        await page.evaluate(() => window.partyDebug.hostAdvance(4));
        await page.waitForFunction(() => window.partyDebug.getState().phase === 'racing');
        if (name === 'phone-portrait') await expect(page.locator('.portrait-hint')).toBeVisible();
        await expect(page.locator('#jump')).toBeInViewport();
        await expect(page.locator('#joystick')).toBeInViewport();
        await expect(page.locator('#dive')).toBeInViewport();
        expect(
            await page.evaluate(() => {
                const button = document.querySelector('#dive')!;
                const rect = button.getBoundingClientRect();
                return [0.2, 0.5, 0.8].every((x) =>
                    [0.2, 0.5, 0.8].every((y) =>
                        button.contains(document.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height * y))
                    )
                );
            })
        ).toBe(true);
        const stick = await page.locator('#joystick').boundingBox();
        await page.mouse.move(stick!.x + stick!.width / 2, stick!.y + stick!.height / 2);
        await page.mouse.down();
        await page.mouse.move(stick!.x + stick!.width / 2, stick!.y + 7);
        await page.waitForFunction(() => window.partyDebug.getState().players[0].z < 2);
        await page.mouse.up();
        await page.locator('#jump').dispatchEvent('pointerdown', { pointerId: 5, pointerType: 'touch' });
        await page.waitForFunction(() => window.partyDebug.getState().players[0].vy > 1);
        await page.screenshot({ path: `test-results/${name}-race.png` });
        expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
        expect(errors).toEqual([]);
        await context.close();
    });
}

test('landscape Laser weapon controls remain clickable above the playfield and clear of diagnostics', async ({
    page
}) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo-mode').selectOption('laser-tag');
    await page.locator('#bot-count').selectOption('0');
    await page.locator('#solo').click();
    await page.waitForFunction(() => window.partyDebug.getState().phase === 'racing');
    for (const id of ['fire', 'weapon-quick', 'weapon-charged']) {
        await expect(page.locator('#' + id)).toBeInViewport();
        expect(
            await page.evaluate((id) => {
                const button = document.getElementById(id)!;
                const rect = button.getBoundingClientRect();
                return [0.2, 0.5, 0.8].every((x) =>
                    [0.2, 0.5, 0.8].every((y) =>
                        button.contains(document.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height * y))
                    )
                );
            }, id)
        ).toBe(true);
    }
    await page.locator('#weapon-charged').click();
    await expect(page.locator('#weapon-charged')).toHaveAttribute('aria-pressed', 'true');
});
