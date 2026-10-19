import process from 'node:process';
import { VERSION } from '../../src/protocol';
import { test, expect, type Page } from '@playwright/test';
test.skip(process.env.RUN_WEBRTC !== '1', 'Public WebRTC path required; managed Chromium UDP policy blocks ICE here.');
test('real WebRTC: two to eight clients, impaired movement, authority, full room, results and rematch', async ({
    browser,
    baseURL
}, testInfo) => {
    test.setTimeout(240000);
    const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const pages: Page[] = [];
    const errors: string[] = [];
    const add = async () => {
        const p = await context.newPage();
        p.on('pageerror', (e) => errors.push(e.message));
        pages.push(p);
        return p;
    };
    const host = await add();
    await host.goto(new URL('?debug=1', baseURL).href);
    await host.waitForFunction(() => window.partyDebug);
    await host.locator('#host').click();
    await host.locator('#nickname').fill('Host');
    await host.locator('#continue').click();
    await expect(host.locator('#share-link')).toBeVisible({ timeout: 20000 });
    const link = await host.locator('#share-link').inputValue();
    const join = async (name: string) => {
        const p = await add();
        await p.goto(link + '&debug=1');
        await p.locator('#nickname').fill(name);
        await p.locator('#continue').click();
        return p;
    };
    try {
        const guest = await join('Guest');
        await expect(host.locator('#roster')).toContainText('Guest', { timeout: 20000 });
        await expect(guest.locator('#roster')).toContainText('Host');
        await expect
            .poll(() => guest.evaluate(() => window.partyDebug.getDiagnostics().ice), { timeout: 10000 })
            .toContain('direct');
        await expect
            .poll(() => guest.evaluate(() => window.partyDebug.getDiagnostics().rtt), { timeout: 5000 })
            .toBeGreaterThan(0);
        const diagnostics = await Promise.all(
            [host, guest].map((p) =>
                p.evaluate(() => {
                    const d = window.partyDebug.getDiagnostics();
                    return {
                        ice: d.ice,
                        semantics: d.semantics,
                        rtt: d.rtt,
                        fps: d.fps,
                        counts: d.counts,
                        elapsedSeconds: d.elapsedSeconds
                    };
                })
            )
        );
        console.log('REAL WEBRTC EVIDENCE', JSON.stringify(diagnostics));
        await testInfo.attach('webrtc-diagnostics', {
            body: JSON.stringify(diagnostics, null, 2),
            contentType: 'application/json'
        });
        // Duplicate join belongs to the existing connection; it cannot allocate a new player.
        await guest.evaluate(
            (version) => window.partyDebug.sendControl({ type: 'join', version, nickname: 'Duplicate' }),
            VERSION
        );
        await expect(guest.locator('#notice')).toContainText('Already joined');
        expect((await host.evaluate(() => window.partyDebug.getState())).players).toHaveLength(2);
        for (const p of [host, guest])
            await p.evaluate(() => window.partyDebug.setFaults({ delay: 80, jitter: 40, loss: 0.03, reorder: 0.05 }));
        await guest.locator('#ready').click();
        await host.locator('#start').click();
        await guest.waitForFunction(() => window.partyDebug.getState()?.phase === 'racing');
        await guest.keyboard.down('w');
        await host.waitForFunction(() => window.partyDebug.getState().players.find((p) => p.name === 'Guest')!.z < 1);
        await guest.keyboard.up('w');
        await host.waitForFunction(
            () => Math.abs(window.partyDebug.getState().players.find((p) => p.name === 'Guest')!.vz) < 0.1
        );
        await guest.waitForTimeout(500);
        const correction = await guest.evaluate(() => {
            const p = window.partyDebug.getState().players.find((p) => p.name === 'Guest')!,
                r = window.partyDebug.getRenderPosition(p.id)!;
            return Math.hypot(r.x - p.x, r.y - p.y, r.z - p.z);
        });
        expect(correction).toBeLessThan(0.8);
        await guest.evaluate(() => {
            window.partyDebug.setFaults({ delay: 0, jitter: 0, loss: 0, reorder: 0 });
            window.partyDebug.sendRaw({ type: 'finish', playerId: 'host', time: 0 });
        });
        await expect
            .poll(() => host.evaluate(() => window.partyDebug.getDiagnostics().counts.rejected))
            .toBeGreaterThan(0);
        const complete = async () => {
            await host.evaluate(() => {
                const d = window.partyDebug;
                for (const p of d.getState().players.filter((p) => p.connected))
                    for (const z of [-40, -85, -132]) {
                        d.teleport(p.id, z);
                        d.hostAdvance(0.15);
                    }
            });
        };
        await complete();
        await expect(guest.locator('#panel')).toContainText('That was a dash');
        expect((await guest.evaluate(() => window.partyDebug.getState())).players.every((p) => p.finish !== null)).toBe(
            true
        );
        await host.locator('#rematch').click();
        await expect(guest.locator('#roster')).toContainText('Guest');
        expect(
            (await guest.evaluate(() => window.partyDebug.getState())).players.every(
                (p) => p.finish === null && p.checkpoint === 0
            )
        ).toBe(true);
        const guests = [guest];
        for (let n = 2; n <= 7; n++) {
            guests.push(await join('Guest ' + n));
            await expect(host.locator('#roster')).toContainText('Guest ' + n, { timeout: 20000 });
        }
        expect((await host.evaluate(() => window.partyDebug.getState())).players).toHaveLength(8);
        const extra = await join('Overflow');
        await expect(extra.locator('#notice')).toContainText('Room full', { timeout: 20000 });
        await extra.close();
        for (const p of guests) await p.locator('#ready').click();
        await expect
            .poll(() => host.evaluate(() => window.partyDebug.getState().players.filter((p) => p.ready).length))
            .toBe(7);
        await host.locator('#start').click();
        await host.evaluate(() => window.partyDebug.hostAdvance(4));
        await guest.waitForFunction(() => window.partyDebug.getState().phase === 'racing');
        const leaving = guests.pop()!;
        await leaving.locator('#leave').click();
        await expect
            .poll(() => host.evaluate(() => window.partyDebug.getState().players.filter((p) => !p.connected).length), {
                timeout: 15000
            })
            .toBe(1);
        await complete();
        for (const p of guests) await expect(p.locator('#panel')).toContainText('That was a dash');
        const results = await host.evaluate(() => window.partyDebug.getState());
        expect(results.players.filter((p) => p.finish !== null)).toHaveLength(7);
        expect(results.players.filter((p) => !p.connected && p.finish === null)).toHaveLength(1);
        console.log(
            'EIGHT CLIENT RESULT EVIDENCE',
            JSON.stringify({
                players: results.players.length,
                finished: 7,
                dnf: 1,
                host: await host.evaluate(() => window.partyDebug.getDiagnostics())
            })
        );
        await host.locator('#rematch').click();
        await expect(guest.locator('#roster')).toContainText('Host');
        await host.close();
        await expect(guest.locator('#panel')).toContainText('Match ended', { timeout: 25000 });
        expect(errors).toEqual([]);
    } finally {
        await context.close();
    }
});
