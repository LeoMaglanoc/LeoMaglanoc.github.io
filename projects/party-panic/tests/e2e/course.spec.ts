import { test, expect } from '@playwright/test';
test('solo traverses the actual course with input only and authoritative finish', async ({ page }) => {
    await page.goto('./?debug=1');
    await page.waitForFunction(() => window.partyDebug);
    await page.locator('#solo').click();
    await page.evaluate(() => window.partyDebug.hostAdvance(4));
    const result = await page.evaluate(() => {
        const d = window.partyDebug;
        let jump = 0;
        let lastFall = 0;
        const jumped = new Set<number>();
        for (let tick = 0; tick < 7200; tick++) {
            const s = d.getState(),
                p = s.players[0];
            if (s.phase !== 'racing') return { state: s, logs: d.getLogs() };
            if (p.respawns !== lastFall) {
                lastFall = p.respawns;
                jumped.clear();
            }
            let z = -1;
            const targetX = p.checkpoint > 0 ? -4 : 0;
            let x = Math.max(-1, Math.min(1, (targetX - p.x) * 3));
            for (const edge of [-16, -26, -35])
                if (p.z > edge - 0.25 && p.z < edge + 0.38 && p.y < 1.05 && !jumped.has(edge)) {
                    jump++;
                    jumped.add(edge);
                }
            // Wait at the near side of each pusher until the opposite lane is open.
            for (const [i, gate] of [-96, -108, -120].entries())
                if (p.z > gate + 1.5 && p.z < gate + 2.2 && Math.sin(s.elapsed * 1.7 + i * 1.8) < 0.55) z = 0;
            if (Math.abs(targetX - p.x) < 0.08) x = 0;
            const norm = Math.max(1, Math.hypot(x, z));
            d.setTestInput([x / norm, z / norm], jump);
            d.hostAdvance(1 / 60);
        }
        return { state: d.getState(), logs: d.getLogs() };
    });
    console.log('INPUT-ONLY COURSE', JSON.stringify(result.state.players[0]));
    expect(result.state.phase).toBe('results');
    expect(result.state.players[0].finish).not.toBeNull();
    expect(result.state.players[0].checkpoint).toBe(2);
});
