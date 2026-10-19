import process from 'node:process';
import { VERSION, neutral } from '../../src/protocol';
import { test, expect, type Page, type BrowserContext, type CDPSession } from '@playwright/test';
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

test('real WebRTC Laser: gesture readiness, cover, authoritative tags, faults and eight-client firing', async ({
    browser,
    baseURL
}, testInfo) => {
    test.setTimeout(360000);
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    const touches: CDPSession[] = [];
    const errors: string[] = [];
    const impaired = { delay: 80, jitter: 40, loss: 0.03, reorder: 0.05, reliableDelay: 80, duplicate: 0.3 };
    const add = async () => {
        const context = await browser.newContext({
            viewport: { width: 844, height: 390 },
            hasTouch: true,
            isMobile: true
        });
        contexts.push(context);
        await context.addInitScript(() => {
            const calls: { active: boolean; granted?: boolean; reason?: string }[] = [];
            Object.assign(window, { fullscreenGestureCalls: calls });
            const request = Element.prototype.requestFullscreen;
            if (!request) return;
            Element.prototype.requestFullscreen = function (options) {
                const call: (typeof calls)[number] = { active: navigator.userActivation.isActive };
                calls.push(call);
                // Observe the real API. Incoming network messages never get a gesture.
                return request.call(this, options).then(
                    () => {
                        call.granted = !!document.fullscreenElement;
                    },
                    (error) => {
                        call.granted = false;
                        call.reason = String(error);
                        throw error;
                    }
                );
            };
        });
        const page = await context.newPage();
        pages.push(page);
        page.on('pageerror', (error) => errors.push(error.message));
        return page;
    };
    const fullscreenCalls = (page: Page) =>
        page.evaluate(() => Reflect.get(window, 'fullscreenGestureCalls') as { active: boolean }[]);
    const scores = (page: Page) =>
        page.evaluate(() =>
            window.partyDebug
                .getState()
                .players.map((p) => ({ id: p.id, score: p.score, deaths: p.deaths }))
                .sort((a, b) => a.id.localeCompare(b.id))
        );
    const snapshot = (page: Page) =>
        page.evaluate(() => ({ state: window.partyDebug.getState(), diagnostics: window.partyDebug.getDiagnostics() }));
    try {
        const host = await add();
        await host.goto(new URL('?debug=1', baseURL).href);
        await host.waitForFunction(() => !!window.partyDebug);
        await host.locator('#host').click();
        await host.locator('#nickname').fill('Laser Host');
        await host.locator('#continue').click();
        await expect(host.locator('#share-link')).toBeVisible({ timeout: 25000 });
        const roomLink = await host.locator('#share-link').inputValue();
        const join = async (name: string) => {
            const page = await add();
            await page.goto(roomLink + '&debug=1');
            await page.locator('#nickname').fill(name);
            await page.locator('#continue').click();
            await expect(host.locator('#roster')).toContainText(name, { timeout: 25000 });
            await expect(page.locator('#roster')).toContainText('Laser Host');
            return page;
        };
        const guest = await join('Laser Guest');
        await host.locator('[data-mode="laser-tag"]').click();
        await guest.waitForFunction(() => window.partyDebug.getState().modeId === 'laser-tag');
        expect(await fullscreenCalls(host)).toEqual([expect.objectContaining({ active: true })]);
        expect(await fullscreenCalls(guest)).toEqual([expect.objectContaining({ active: true })]);
        await guest.locator('#ready').click();
        expect(await fullscreenCalls(guest)).toEqual([expect.objectContaining({ active: true })]);
        await expect
            .poll(() =>
                host.evaluate(() => window.partyDebug.getState().players.find((p) => p.name === 'Laser Guest')!.ready)
            )
            .toBe(true);
        await host.locator('#start').click();
        await guest.waitForFunction(() => window.partyDebug.getState().phase === 'racing');
        expect(await fullscreenCalls(host)).toEqual([expect.objectContaining({ active: true })]);
        expect(await fullscreenCalls(guest)).toHaveLength(1);
        const initial = await host.evaluate(() => window.partyDebug.getState());
        const guestId = initial.players.find((p) => p.name === 'Laser Guest')!.id;
        const hostId = initial.players.find((p) => p.name === 'Laser Host')!.id;
        // Observe real guest response with delayed input/snapshots; no position injection.
        for (const page of [host, guest])
            await page.evaluate(() =>
                window.partyDebug.setFaults({ delay: 120, jitter: 0, loss: 0, reorder: 0, reliableDelay: 120 })
            );
        await guest.evaluate((id) => {
            const origin = window.partyDebug.getRenderPosition(id)!;
            document.addEventListener(
                'keydown',
                () => {
                    const started = performance.now();
                    const probe = () => {
                        const visible = window.partyDebug.getRenderPosition(id)!;
                        if (Math.hypot(visible.x - origin.x, visible.z - origin.z) > 0.005) {
                            Object.assign(window, {
                                guestResponse: {
                                    milliseconds: performance.now() - started,
                                    origin,
                                    visible,
                                    authoritative: window.partyDebug.getState().players.find((p) => p.id === id),
                                    diagnostics: window.partyDebug.getDiagnostics()
                                }
                            });
                        } else requestAnimationFrame(probe);
                    };
                    requestAnimationFrame(probe);
                },
                { once: true }
            );
        }, guestId);
        // Aim points into the shelter in front of the guest's actual spawn.
        await guest.keyboard.down('w');
        await guest.waitForFunction(() => Reflect.has(window, 'guestResponse'));
        const response = await guest.evaluate(() => Reflect.get(window, 'guestResponse'));
        await testInfo.attach('guest-input-to-observed-render-response', {
            body: JSON.stringify(response, null, 2),
            contentType: 'application/json'
        });
        await guest.waitForTimeout(2200);
        await guest.keyboard.up('w');
        await host.waitForFunction(
            (id) => Math.abs(window.partyDebug.getState().players.find((p) => p.id === id)!.vz) < 0.1,
            guestId
        );
        await guest.waitForTimeout(250);
        const blocked = await host.evaluate(
            (id) => window.partyDebug.getState().players.find((p) => p.id === id)!,
            guestId
        );
        const rendered = await guest.evaluate((id) => window.partyDebug.getRenderPosition(id), guestId);
        expect(blocked.x).toBeCloseTo(-4, 1);
        expect(blocked.z).toBeGreaterThan(-7.5);
        expect(blocked.z).toBeLessThanOrEqual(-6.3);
        expect(rendered!.z).toBeLessThanOrEqual(-6.3);
        for (const page of [host, guest])
            await page.evaluate(() => window.partyDebug.setFaults({ delay: 0, jitter: 0, loss: 0, reorder: 0 }));
        await host.evaluate((id) => window.partyDebug.aimAtPlayer(id), guestId);
        const fireBox = (await host.locator('#fire').boundingBox())!;
        const firingSession = await host.context().newCDPSession(host);
        await firingSession.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: fireBox.x + fireBox.width / 2, y: fireBox.y + fireBox.height / 2, id: 77 }]
        });
        await expect
            .poll(() =>
                host.evaluate((id) => window.partyDebug.getState().players.find((p) => p.id === id)!.score, hostId)
            )
            .toBe(1);
        await expect
            .poll(() =>
                guest.evaluate((id) => window.partyDebug.getState().players.find((p) => p.id === id)!.deaths, guestId)
            )
            .toBe(1);
        for (const page of [host, guest]) await page.evaluate((f) => window.partyDebug.setFaults(f), impaired);
        await firingSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const protectedScores = await scores(host);
        const rejected = await host.evaluate(() => window.partyDebug.getDiagnostics().counts.rejected);
        const stale = { ...neutral('laser-tag', initial.roundId - 1), sequence: 1000000 };
        await guest.evaluate((input) => {
            window.partyDebug.sendControl({ type: 'hit', targetId: 'host', score: 100 });
            window.partyDebug.sendControl({ type: 'score', score: 100 });
            window.partyDebug.sendRaw(input);
        }, stale);
        await expect
            .poll(() => host.evaluate(() => window.partyDebug.getDiagnostics().counts.rejected))
            .toBeGreaterThan(rejected);
        await guest.waitForTimeout(500);
        expect(await scores(host)).toEqual(protectedScores);
        await host.evaluate(() => window.partyDebug.hostAdvance(95));
        await expect(guest.locator('#panel')).toContainText('Winner: Laser Host');
        await expect.poll(() => scores(guest)).toEqual(await scores(host));
        const twoClient = await Promise.all([host, guest].map(snapshot));
        await host.locator('#rematch').click();
        await expect(guest.locator('#ready')).toBeVisible();
        await host.locator('[data-mode="obstacle-dash"]').click();
        await guest.waitForFunction(() => window.partyDebug.getState().modeId === 'obstacle-dash');
        expect(await host.locator('#share-link').inputValue()).toBe(roomLink);
        expect((await host.evaluate(() => window.partyDebug.getState())).players.map((p) => p.id)).toEqual(
            initial.players.map((p) => p.id)
        );
        const guests = [guest];
        for (let n = 2; n <= 7; n++) guests.push(await join('Laser Guest ' + n));
        expect((await host.evaluate(() => window.partyDebug.getState())).players).toHaveLength(8);
        await host.locator('[data-mode="laser-tag"]').click();
        for (const page of guests)
            await page.waitForFunction(() => window.partyDebug.getState().modeId === 'laser-tag');
        expect((await host.evaluate(() => window.partyDebug.getState())).players.every((p) => !p.ready)).toBe(true);
        for (const page of pages) await page.evaluate((f) => window.partyDebug.setFaults(f), impaired);
        for (const page of guests) await page.locator('#ready').click();
        await expect
            .poll(() => host.evaluate(() => window.partyDebug.getState().players.filter((p) => p.ready).length))
            .toBe(7);
        await host.locator('#start').click();
        for (const page of pages) await page.waitForFunction(() => window.partyDebug.getState().phase === 'racing');
        const ids = (await host.evaluate(() => window.partyDebug.getState())).players.map((p) => p.id).sort();
        const startedAt = Date.now();
        // Separate context CDP touches preserve simultaneous holds without pointer
        // lock or bringing each page to the foreground and clearing other inputs.
        for (const page of pages) {
            const session = await page.context().newCDPSession(page);
            touches.push(session);
            const fire = await page.locator('#fire').boundingBox();
            expect(fire).not.toBeNull();
            await session.send('Input.dispatchTouchEvent', {
                type: 'touchStart',
                touchPoints: [{ x: fire!.x + fire!.width / 2, y: fire!.y + fire!.height / 2, id: 1 }]
            });
        }
        await host.waitForTimeout(8500);
        for (const session of touches)
            await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await host.waitForTimeout(500);
        const live = await host.evaluate((started) => {
            const d = window.partyDebug;
            const state = d.getState();
            const logs = d.getLogs() as { at: string; type: string; payload: { id?: string } }[];
            return {
                shooters: [
                    ...new Set(
                        logs
                            .filter((log) => log.type === 'shot' && Date.parse(log.at) >= started)
                            .map((log) => log.payload.id)
                    )
                ].sort(),
                score: state.players.reduce((sum, p) => sum + p.score, 0),
                deaths: state.players.reduce((sum, p) => sum + p.deaths, 0)
            };
        }, startedAt);
        expect(live.shooters).toEqual(ids);
        expect(live.score).toBe(live.deaths);
        const stress = {
            realSeconds: (Date.now() - startedAt) / 1000,
            live,
            clients: await Promise.all(pages.map(snapshot))
        };
        expect(stress.realSeconds).toBeGreaterThanOrEqual(8);
        await host.evaluate(() => window.partyDebug.hostAdvance(95));
        for (const page of guests) await expect(page.locator('#panel')).toContainText('Top tags.');
        const authoritative = await scores(host);
        for (const page of guests) await expect.poll(() => scores(page)).toEqual(authoritative);
        expect(authoritative.reduce((sum, p) => sum + p.score, 0)).toBe(
            authoritative.reduce((sum, p) => sum + p.deaths, 0)
        );
        await testInfo.attach('laser-webrtc-authority-and-stress', {
            body: JSON.stringify(
                {
                    twoClient,
                    blocked,
                    rendered,
                    stress,
                    final: authoritative,
                    fullscreen: await Promise.all(pages.map(fullscreenCalls))
                },
                null,
                2
            ),
            contentType: 'application/json'
        });
        expect(errors).toEqual([]);
    } finally {
        await testInfo.attach('laser-webrtc-last-state', {
            body: JSON.stringify(await Promise.allSettled(pages.map(snapshot)), null, 2),
            contentType: 'application/json'
        });
        for (const session of touches) await session.detach().catch(() => {});
        for (const context of contexts) await context.close();
    }
});
