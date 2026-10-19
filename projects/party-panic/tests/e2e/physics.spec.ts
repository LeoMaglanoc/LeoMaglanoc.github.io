import { test, expect } from '@playwright/test';
test('real Ammo: ten jumps, ordered triggers, respawn, timeout and rematch', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(4));
    const landingHeights = await page.evaluate(() => {
        const d = window.partyDebug;
        const heights: number[] = [];
        for (let n = 1; n <= 10; n++) {
            d.setTestInput([0, 0], n);
            d.hostAdvance(0.2);
            const up = d.getState().players[0];
            if (up.y < 1.5) throw Error('Jump did not lift capsule ' + n);
            d.hostAdvance(1);
            heights.push(d.getState().players[0].y);
        }
        return heights;
    });
    for (const h of landingHeights) expect(h).toBeCloseTo(0.75, 1);
    // Checkpoint 2 and finish cannot be skipped, even by a host-side test teleport.
    await page.evaluate(() => {
        const d = window.partyDebug,
            id = d.getState().players[0].id;
        d.teleport(id, -85);
        d.hostAdvance(0.1);
    });
    expect((await page.evaluate(() => window.partyDebug.getState())).players[0].checkpoint).toBe(0);
    await page.evaluate(() => {
        const d = window.partyDebug,
            id = d.getState().players[0].id;
        d.teleport(id, -40);
        d.hostAdvance(0.1);
    });
    expect((await page.evaluate(() => window.partyDebug.getState())).players[0].checkpoint).toBe(1);
    await page.evaluate(() => {
        const d = window.partyDebug,
            id = d.getState().players[0].id;
        d.teleport(id, 15);
        d.hostAdvance(0.1);
    });
    let s = await page.evaluate(() => window.partyDebug.getState());
    expect(s.players[0].respawns).toBeGreaterThan(0);
    expect(s.players[0].z).toBeCloseTo(-43, 0);
    await page.evaluate(() => {
        const d = window.partyDebug,
            id = d.getState().players[0].id;
        d.teleport(id, -85);
        d.hostAdvance(0.1);
        d.teleport(id, -132);
        d.hostAdvance(0.1);
    });
    s = await page.evaluate(() => window.partyDebug.getState());
    expect(s.phase).toBe('results');
    expect(s.players[0].finish).not.toBeNull();
    await expect(page.locator('#panel')).toContainText('That was a dash');
    await page.locator('#rematch').click();
    s = await page.evaluate(() => window.partyDebug.getState());
    expect(s.phase).toBe('lobby');
    expect(s.players[0].checkpoint).toBe(0);
    expect(s.players[0].finish).toBeNull();
    await page.locator('#start').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(124));
    await expect(page.locator('#panel')).toContainText('DNF');
    expect(errors).toEqual([]);
});
test('eight capsules complete host-authoritative triggers and repeat rematches', async ({ page }) => {
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo').click();
    await page.evaluate(() => {
        for (let n = 1; n < 8; n++) window.partyDebug.addTestPlayer('Local fixture ' + n);
        window.partyDebug.hostAdvance(4);
    });
    const initialBodies = await page.evaluate(() => window.partyDebug.getDiagnostics().bodies);
    expect(initialBodies).toBeGreaterThanOrEqual(22);
    for (let round = 0; round < 3; round++) {
        await page.evaluate(() => {
            const d = window.partyDebug;
            for (const p of d.getState().players) {
                for (const z of [-40, -85, -132]) {
                    d.teleport(p.id, z);
                    d.hostAdvance(0.15);
                }
            }
        });
        const s = await page.evaluate(() => window.partyDebug.getState());
        expect(s.players).toHaveLength(8);
        expect(s.players.every((p) => p.finish !== null)).toBe(true);
        expect(new Set(s.players.map((p) => p.color)).size).toBe(8);
        await expect(page.locator('#rematch')).toBeVisible();
        await page.locator('#rematch').click();
        await page.locator('#start').click();
        await page.evaluate(() => window.partyDebug.hostAdvance(4));
    }
    expect(await page.evaluate(() => window.partyDebug.getDiagnostics().bodies)).toBe(initialBodies);
    // Eight entities on ONE authority, not eight WebRTC clients or physical phones.
    expect((await page.evaluate(() => window.partyDebug.getState())).players).toHaveLength(8);
});

test('jump deduplication, pause/resume clock, wall timeout and leaving releases bodies', async ({ page }) => {
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(4));
    const values = await page.evaluate(() => {
        const d = window.partyDebug;
        d.setTestInput([0, 0], 1);
        d.hostAdvance(0.2);
        d.setTestInput([0, 0], 2);
        let max = 0;
        for (let i = 0; i < 80; i++) {
            d.hostAdvance(1 / 60);
            max = Math.max(max, d.getState().players[0].y);
        }
        const time = d.getState().elapsed;
        d.setPaused(true);
        d.advanceWall(10);
        const paused = d.getState().elapsed;
        d.setPaused(false);
        d.advanceWall(3);
        return { max, time, paused, resumed: d.getState().elapsed, bodies: d.getDiagnostics().bodies };
    });
    expect(values.max).toBeLessThan(2.5);
    expect(values.max).toBeGreaterThan(2);
    expect(values.paused).toBe(values.time);
    expect(values.resumed - values.time).toBeCloseTo(3, 1);
    expect(values.bodies).toBe(15);
    await page.evaluate(() => window.partyDebug.advanceWall(121));
    await expect(page.locator('#panel')).toContainText('DNF');
    await page.locator('#result-leave').click();
    expect(await page.evaluate(() => window.partyDebug.getDiagnostics().bodies)).toBe(14);
    await page.locator('#solo').click();
    expect((await page.evaluate(() => window.partyDebug.getState())).phase).toBe('countdown');
});
