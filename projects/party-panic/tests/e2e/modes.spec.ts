import { test, expect } from '@playwright/test';

test('three repeated Dash/Laser mode cycles use authoritative timeouts and release scene bodies', async ({ page }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?debug=1');
    await page.waitForFunction(() => !!window.partyDebug);
    await page.locator('#solo').click();
    const baseline = await page.evaluate(() => window.partyDebug.getDiagnostics().bodies);
    expect(baseline).toBeGreaterThan(1);
    let epoch = await page.evaluate(() => window.partyDebug.getState().roundId);
    await page.evaluate(() => window.partyDebug.hostAdvance(125));
    await expect(page.locator('#rematch')).toBeVisible();
    await page.locator('#rematch').click();
    await expect(page.locator('#start')).toBeVisible();
    const bodies: { mode: string; count: number }[] = [];
    let laserBodies: number | undefined;
    for (let cycle = 0; cycle < 3; cycle++) {
        for (const mode of ['laser-tag', 'obstacle-dash'] as const) {
            await page.locator(`[data-mode="${mode}"]`).click();
            await page.waitForFunction((selected) => window.partyDebug.getState().modeId === selected, mode);
            const lobby = await page.evaluate(() => ({
                state: window.partyDebug.getState(),
                bodies: window.partyDebug.getDiagnostics().bodies
            }));
            expect(lobby.state.phase).toBe('lobby');
            expect(lobby.state.roundId).toBeGreaterThan(epoch);
            expect(lobby.state.players.every((p) => !p.ready)).toBe(true);
            epoch = lobby.state.roundId;
            bodies.push({ mode, count: lobby.bodies });
            if (mode === 'obstacle-dash') expect(lobby.bodies).toBe(baseline);
            else {
                laserBodies ??= lobby.bodies;
                expect(lobby.bodies).toBe(laserBodies);
            }
            await page.locator('#start').click();
            await page.waitForFunction(() => window.partyDebug.getState().phase === 'countdown');
            await page.evaluate((seconds) => window.partyDebug.hostAdvance(seconds), mode === 'laser-tag' ? 95 : 125);
            await expect(page.locator('#rematch')).toBeVisible();
            const ended = await page.evaluate(() => window.partyDebug.getState());
            expect(ended.modeId).toBe(mode);
            expect(ended.phase).toBe('results');
            expect(ended.elapsed).toBe(mode === 'laser-tag' ? 90 : 120);
            expect(ended.roundId).toBeGreaterThan(epoch);
            epoch = ended.roundId;
            await page.locator('#rematch').click();
            await expect(page.locator('#start')).toBeVisible();
        }
    }
    console.log('REPEATED MODE BODY COUNTS', JSON.stringify(bodies));
    expect(errors).toEqual([]);
});
