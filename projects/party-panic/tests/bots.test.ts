import { expect, it } from 'vitest';
import { BotController } from '../src/bots';
import { parseInput, type Player } from '../src/protocol';
import { LASER, LASER_COVERS, getAimRig, rayBox, resolveShot } from '../src/laser';

const player = (id = 'bot', overrides: Partial<Player> = {}): Player => ({
    id,
    name: id,
    color: '#ffcc4a',
    connected: true,
    ready: true,
    bot: true,
    checkpoint: 0,
    progress: 0,
    finish: null,
    x: 0,
    y: 0.75,
    z: 3,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    respawns: 0,
    score: 0,
    deaths: 0,
    respawnAt: 0,
    protectedUntil: 0,
    aimPitch: 0,
    health: 100,
    energy: 1,
    weapon: 'quick',
    charge: 0,
    inputSequence: 0,
    shotSequence: 0,
    ...overrides
});
it('produces valid bounded monotonic inputs without mutating authoritative player state', () => {
    const bot = new BotController(),
        p = player(),
        target = player('human', { x: 9, z: -8, bot: false });
    const original = structuredClone([p, target]);
    let sequence = 0;
    for (const mode of ['obstacle-dash', 'laser-tag'] as const) {
        for (let i = 0; i < 90; i++) {
            const input = bot.update(p, [p, target], mode, 7, i / 60, 1 / 60);
            expect(parseInput(input)).toEqual(input);
            expect(input.sequence).toBeGreaterThan(sequence);
            expect(Math.hypot(...input.axes)).toBeLessThanOrEqual(1.00001);
            sequence = input.sequence;
        }
    }
    expect([p, target]).toEqual(original);
});
it('jumps once per actual gap edge and retries after an authoritative respawn', () => {
    const bot = new BotController(),
        p = player('bot', { z: -15.85 });
    const first = bot.update(p, [p], 'obstacle-dash', 1, 0, 1 / 60);
    expect(first.jumpSequence).toBe(1);
    expect(bot.update(p, [p], 'obstacle-dash', 1, 0.1, 1 / 60).jumpSequence).toBe(1);
    p.z = -25.85;
    expect(bot.update(p, [p], 'obstacle-dash', 1, 0.2, 1 / 60).jumpSequence).toBe(2);
    p.z = -15.85;
    p.respawns++;
    expect(bot.update(p, [p], 'obstacle-dash', 1, 0.3, 1 / 60).jumpSequence).toBe(3);
});
it('aims with bounded turning, reaction time and ordinary rate-limited shots', () => {
    const bot = new BotController(),
        p = player('bot', { x: 8, z: 2 }),
        target = player('human', { x: 8, z: -3 });
    let yaw = 0,
        lastFire = -Infinity,
        shots = 0,
        lastSerial = 0;
    for (let i = 0; i < 180; i++) {
        const time = i / 60,
            input = bot.update(p, [p, target], 'laser-tag', 1, time, 1 / 60);
        if (input.modeId !== 'laser-tag') throw Error('wrong mode');
        expect(Math.abs(Math.atan2(Math.sin(input.aim.yaw - yaw), Math.cos(input.aim.yaw - yaw)))).toBeLessThanOrEqual(
            0.050001
        );
        yaw = input.aim.yaw;
        if (input.aim.fire && input.aim.sequence > lastSerial) {
            lastSerial = input.aim.sequence;
            expect(time).toBeGreaterThanOrEqual(0.3);
            expect(time - lastFire).toBeGreaterThanOrEqual(LASER.cooldown - 1e-9);
            const rig = getAimRig(p, input.aim.yaw, input.aim.pitch);
            expect(
                resolveShot({ ...rig, ...input.aim, shooterId: p.id, targets: [p, target], now: time }).targetId
            ).toBe(target.id);
            lastFire = time;
            shots++;
        }
    }
    expect(shots).toBeGreaterThan(2);
});
it('routes around cover through normal movement and never fires through it', () => {
    const bot = new BotController(),
        p = player('bot', { x: 0, z: 3 }),
        target = player('human', { x: 0, z: -8 });
    let movedSideways = false;
    for (let i = 0; i < 600; i++) {
        const time = i / 60,
            input = bot.update(p, [p, target], 'laser-tag', 1, time, 1 / 60);
        if (input.modeId !== 'laser-tag') throw Error('wrong mode');
        const step = LASER.speed / 60;
        const length = Math.hypot(...input.axes);
        if (length > 0) {
            const direction = { x: input.axes[0] / length, y: 0, z: input.axes[1] / length };
            expect(LASER_COVERS.some((cover) => rayBox(p, direction, cover, length * step) !== null)).toBe(false);
        }
        if (input.aim.fire) {
            const rig = getAimRig(p, input.aim.yaw, input.aim.pitch);
            expect(
                resolveShot({ ...rig, ...input.aim, shooterId: p.id, targets: [p, target], now: time }).targetId
            ).toBe(target.id);
        }
        p.x += input.axes[0] * step;
        p.z += input.axes[1] * step;
        movedSideways ||= Math.abs(p.x) > 1.5;
    }
    expect(movedSideways).toBe(true);
    expect(p.z).toBeLessThan(0);
});
it('does not chase or shoot protected, disconnected or respawning targets', () => {
    const bot = new BotController(),
        p = player(),
        target = player('human', { protectedUntil: 100 });
    for (const overrides of [
        { protectedUntil: 100 },
        { protectedUntil: 0, connected: false },
        { connected: true, respawnAt: 100 }
    ]) {
        Object.assign(target, overrides);
        const input = bot.update(p, [p, target], 'laser-tag', 1, 1, 1 / 60);
        expect(input.axes).toEqual([0, 0]);
        expect(input.modeId === 'laser-tag' && input.aim.fire).toBe(false);
    }
});
it('gives solo race opponents separate lanes, pace and mirrored bumper timing', () => {
    const bots = new BotController();
    const left = player('bot-0', { checkpoint: 1, x: -4, z: -94 });
    const right = player('bot-1', { checkpoint: 1, x: 4, z: -94 });
    const middle = player('bot-2', { checkpoint: 1, x: -2, z: -94 });
    const time = Math.PI / (2 * 1.7);
    expect(bots.update(left, [left], 'obstacle-dash', 1, time, 1 / 60).axes).toEqual([0, -0.96]);
    expect(bots.update(right, [right], 'obstacle-dash', 1, time, 1 / 60).axes).toEqual([0, 0]);
    expect(bots.update(middle, [middle], 'obstacle-dash', 1, time, 1 / 60).axes).toEqual([0, -0.94]);
    left.checkpoint = right.checkpoint = middle.checkpoint = 0;
    left.x = right.x = middle.x = 0;
    left.z = right.z = middle.z = 3;
    expect(bots.update(left, [left], 'obstacle-dash', 1, 0, 1 / 60).axes[0]).toBeLessThan(0);
    expect(bots.update(right, [right], 'obstacle-dash', 1, 0, 1 / 60).axes[0]).toBeGreaterThan(0);
    expect(bots.update(middle, [middle], 'obstacle-dash', 1, 0, 1 / 60).axes[0]).toBe(0);
});
