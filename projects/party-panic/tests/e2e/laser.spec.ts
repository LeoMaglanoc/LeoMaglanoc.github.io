import { test, expect } from '@playwright/test';

test('solo Laser Tag: real AI inputs tag, respawn, score and finish a complete match', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo-mode').selectOption('laser-tag');
    await page.locator('#bot-count').selectOption('3');
    await page.locator('#solo').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(4));
    await expect(page.locator('#reticle')).toBeVisible();
    await expect(page.locator('#fire')).toBeVisible();
    await expect(page.locator('#jump')).toBeHidden();
    // Only ordinary bot inputs advance the match: no test placement or fabricated tags.
    const halfway = await page.evaluate(() => {
        window.partyDebug.hostAdvance(40);
        return window.partyDebug.getState();
    });
    console.log('LASER AI HALFWAY', JSON.stringify(halfway.players));
    expect(halfway.modeId).toBe('laser-tag');
    expect(halfway.players).toHaveLength(4);
    expect(halfway.players.filter((p) => p.bot)).toHaveLength(3);
    expect(halfway.players.reduce((n, p) => n + p.score, 0)).toBeGreaterThan(0);
    expect(halfway.players.reduce((n, p) => n + p.score, 0)).toBe(halfway.players.reduce((n, p) => n + p.deaths, 0));
    expect(halfway.players.some((p) => p.respawns > 0)).toBe(true);
    await page.screenshot({ path: 'test-results/laser-ai-arena.png' });
    await page.evaluate(() => window.partyDebug.hostAdvance(55));
    await expect(page.locator('#panel')).toContainText('Top tags.');
    const final = await page.evaluate(() => window.partyDebug.getState());
    expect(final.elapsed).toBe(90);
    expect(final.players.reduce((n, p) => n + p.score, 0)).toBe(final.players.reduce((n, p) => n + p.deaths, 0));
    await page.locator('#rematch').click();
    expect(
        (await page.evaluate(() => window.partyDebug.getState())).players.every(
            (p) => p.score === 0 && p.respawnAt === 0
        )
    ).toBe(true);
    await page.locator('[data-mode="obstacle-dash"]').click();
    await page.locator('#start').click();
    expect((await page.evaluate(() => window.partyDebug.getState())).modeId).toBe('obstacle-dash');
    expect(errors).toEqual([]);
});

test('laser touch move + aim-and-fire reach real input and host shooting; release clears fire', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    // Keep this test on explicit touch drags; real browser pointer lock is covered separately.
    await page.addInitScript(() => {
        Element.prototype.requestPointerLock = () => Promise.reject(new Error('test drag fallback'));
    });
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo-mode').selectOption('laser-tag');
    await page.locator('#bot-count').selectOption('0');
    await page.locator('#solo').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(4));
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.partyDebug.getInput());
    const fire = await page.locator('#fire').boundingBox();
    const stick = await page.locator('#joystick').boundingBox();
    const session = await page.context().newCDPSession(page);
    const fingers = [
        { id: 1, x: stick!.x + stick!.width / 2, y: stick!.y + stick!.height / 2 },
        { id: 2, x: fire!.x + fire!.width / 2, y: fire!.y + fire!.height / 2 }
    ];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers });
    fingers[0].y -= 25;
    fingers[1].x -= 30;
    fingers[1].y -= 10;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers });
    await page.waitForTimeout(500);
    const during = await page.evaluate(() => window.partyDebug.getInput());
    expect(during.modeId).toBe('laser-tag');
    expect(Math.hypot(...during.axes)).toBeGreaterThan(0.1);
    if (during.modeId === 'laser-tag' && before.modeId === 'laser-tag') {
        expect(during.aim.fire).toBe(true);
        expect(during.aim.sequence).toBeGreaterThan(0);
        expect(during.aim.yaw).not.toBe(before.aim.yaw);
    }
    const shots = await page.evaluate(
        () => window.partyDebug.getLogs().filter((v) => (v as { type: string }).type === 'shot').length
    );
    expect(shots).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/laser-touch-arena.png' });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(180);
    const after = await page.evaluate(() => window.partyDebug.getInput());
    if (after.modeId === 'laser-tag') expect(after.aim.fire).toBe(false);
});

test('AI racers traverse the real course without test positions or progress claims', async ({ page }) => {
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#bot-count').selectOption('3');
    await page.locator('#solo').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(115));
    const state = await page.evaluate(() => window.partyDebug.getState());
    console.log('AI RACE FINISHES', JSON.stringify(state.players));
    expect(state.players.filter((p) => p.bot && p.finish !== null)).toHaveLength(3);
    expect(state.players.filter((p) => p.bot).every((p) => p.checkpoint === 2)).toBe(true);
});
