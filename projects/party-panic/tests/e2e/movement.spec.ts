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
            d.setTestInput([0, 0], tick < 47 ? 1 : 2);
            d.hostAdvance(1 / 60);
        }
        return d.getLogs().filter((entry) => (entry as { type: string }).type === 'jump').length;
    });
    expect(jumpEvents).toBe(2);
});
