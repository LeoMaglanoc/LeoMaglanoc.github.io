import { expect, test } from '@playwright/test';

for (const direction of ['cardinal', 'diagonal'] as const) {
    test(`real Ammo: ${direction} acceleration and braking stay bounded`, async ({ page }) => {
        await page.goto('./?debug=1');
        await page.waitForFunction(() => window.partyDebug);
        await page.locator('#bot-count').selectOption('0');
        await page.locator('#solo').click();
        const measured = await page.evaluate((direction) => {
            const d = window.partyDebug;
            d.hostAdvance(4);
            const axes: [number, number] = direction === 'cardinal' ? [0, -1] : [Math.SQRT1_2, -Math.SQRT1_2];
            const speeds: number[] = [];
            for (let i = 0; i < 30; i++) {
                d.setTestInput(axes, 0);
                d.hostAdvance(1 / 60);
                const p = d.getState().players[0];
                speeds.push(Math.hypot(p.vx, p.vz));
            }
            const initial = d.getState().players[0];
            for (let i = 0; i < 4; i++) {
                d.setTestInput([0, 0], 0);
                d.hostAdvance(1 / 60);
            }
            const stopped = d.getState().players[0];
            return {
                speeds,
                speed: Math.hypot(stopped.vx, stopped.vz),
                distance: Math.hypot(stopped.x - initial.x, stopped.z - initial.z)
            };
        }, direction);
        expect(measured.speeds[0]).toBeCloseTo(0.6, 3);
        expect(measured.speeds[4]).toBeCloseTo(2.8, 3);
        expect(Math.max(...measured.speeds)).toBeLessThan(2.801);
        expect(measured.speed).toBeLessThan(0.001);
        expect(measured.distance).toBeLessThan(0.12);
    });
}

test('real Ammo buffers a landing jump, but a held sequence cannot repeatedly jump', async ({ page }) => {
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#bot-count').selectOption('0');
    await page.locator('#solo').click();
    const jumpEvents = await page.evaluate(() => {
        const d = window.partyDebug;
        d.hostAdvance(4);
        for (let tick = 1; tick <= 150; tick++) {
            d.setTestInput([0, 0], tick < 43 ? 1 : 2);
            d.hostAdvance(1 / 60);
        }
        return d.getLogs().filter((entry) => (entry as { type: string }).type === 'jump').length;
    });
    expect(jumpEvents).toBe(2);
});

test('real Ammo: short hops, committed dives and duplicate edges', async ({ page }) => {
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    const results = [];
    for (const scenario of ['held', 'cut', 'run', 'dive']) {
        if (scenario !== 'held') await page.locator('#leave').click();
        await page.locator('#bot-count').selectOption('0');
        await page.locator('#solo').click();
        results.push(
            await page.evaluate((scenario) => {
                const d = window.partyDebug;
                d.hostAdvance(4);
                const initial = d.getState().players[0];
                const before = d.getLogs().filter((e) => (e as { type: string }).type === 'dive').length;
                let apex = initial.y;
                for (let i = 0; i < 90; i++) {
                    d.setTestInput(
                        [0, -1],
                        ['held', 'cut'].includes(scenario) ? 1 : 0,
                        scenario === 'held' || i < 3,
                        scenario === 'dive' ? 1 : 0
                    );
                    d.hostAdvance(1 / 60);
                    apex = Math.max(apex, d.getState().players[0].y);
                }
                const p = d.getState().players[0];
                return {
                    apex: apex - initial.y,
                    distance: initial.z - p.z,
                    dives: d.getLogs().filter((e) => (e as { type: string }).type === 'dive').length - before
                };
            }, scenario)
        );
    }
    expect(results[1].apex).toBeLessThan(results[0].apex * 0.75);
    expect(results[3].distance).toBeGreaterThan(results[2].distance + 0.5);
    expect(results[3].dives).toBe(1);
});
