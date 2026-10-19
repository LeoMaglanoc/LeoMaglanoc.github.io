import { describe, expect, it, vi } from 'vitest';
import { Vec3 } from 'playcanvas';
import { LaserRound } from '../src/laserRound';
import { LASER, LASER_SPAWNS, getAimRig, resolveShot } from '../src/laser';
import { VERSION, neutral, type Input, type Player, type Snapshot } from '../src/protocol';
import type { Scene } from '../src/scene';

function player(id: string, z: number): Player {
    return {
        id,
        name: id,
        color: '#ffffff',
        connected: true,
        ready: true,
        bot: false,
        checkpoint: 0,
        progress: 0,
        finish: null,
        x: -12,
        y: 0.75,
        z,
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
        shotSequence: 0
    };
}
function fixture() {
    const players = [player('shooter', 0), player('target', -4), player('second', 2)];
    players[1].health = 34; // One remaining quick hit for elimination/lifecycle fixtures.
    players[2].x = -9; // Separate sightline: the two shooters do not stand in each other's ray.
    // Only rendering/rigidbody effects are mocked; authority and geometry execute unchanged.
    const characters = new Map(
        players.map((p) => [p.id, { enabled: true, rigidbody: { linearVelocity: new Vec3(), teleport: vi.fn() } }])
    );
    const scene = { characters, face: vi.fn() } as unknown as Scene;
    const state: Snapshot = {
        type: 'snapshot',
        version: VERSION,
        modeId: 'laser-tag',
        roundId: 3,
        sequence: 0,
        tick: 0,
        phase: 'racing',
        elapsed: 5,
        countdown: 0,
        paused: false,
        players
    };
    const round = new LaserRound();
    const events: { type: string; payload: unknown }[] = [];
    round.onEvent = (type, payload) => events.push({ type, payload });
    const inputs = new Map<string, { input: Input; received: number }>();
    const aim = (shooter: Player, target: Player, sequence: number) => {
        let yaw = 0,
            pitch = 0;
        for (let i = 0; i < 24; i++) {
            const camera = getAimRig(shooter, yaw, pitch).camera;
            const dx = target.x - camera.x,
                dz = target.z - camera.z;
            yaw = Math.atan2(dx, -dz);
            pitch = Math.atan2(target.y + 0.2 - camera.y, Math.hypot(dx, dz));
        }
        const input: Input = {
            ...neutral('laser-tag', state.roundId),
            modeId: 'laser-tag',
            sequence,
            aim: { yaw, pitch, sequence, fire: true, weapon: 'quick' }
        };
        inputs.set(shooter.id, { input, received: performance.now() });
        return input;
    };
    return {
        round,
        state,
        scene,
        characters,
        events,
        inputs,
        aim,
        shooter: players[0],
        target: players[1],
        second: players[2]
    };
}

describe('LaserRound host score and respawn ownership', () => {
    it('uses the real camera/muzzle ray to score one tag and disable the target', () => {
        const f = fixture();
        const input = f.aim(f.shooter, f.target, 1);
        if (input.modeId !== 'laser-tag') throw new Error('wrong input fixture');
        expect(
            resolveShot({
                ...getAimRig(f.shooter, input.aim.yaw, input.aim.pitch),
                yaw: input.aim.yaw,
                pitch: input.aim.pitch,
                shooterId: f.shooter.id,
                targets: f.state.players,
                now: f.state.elapsed
            }).targetId
        ).toBe('target');
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.shooter.score).toBe(1);
        expect(f.target.deaths).toBe(1);
        expect(f.target.respawnAt).toBe(7);
        expect(f.characters.get('target')!.enabled).toBe(false);
        expect(f.events.map((e) => e.type)).toEqual(['shot', 'damage', 'tag']);
    });
    it('does not double score repeated input, excess sequences or simultaneous shooters', () => {
        const f = fixture();
        f.aim(f.shooter, f.target, 1);
        f.aim(f.second, f.target, 1);
        f.round.afterStep(f.state, f.scene, f.inputs);
        f.round.afterStep(f.state, f.scene, f.inputs);
        f.aim(f.shooter, f.target, 2);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.shooter.score + f.second.score).toBe(1);
        expect(f.target.deaths).toBe(1);
        expect(f.events.filter((e) => e.type === 'tag')).toHaveLength(1);
    });
    it('enforces the cooldown even when a target becomes available', () => {
        const f = fixture();
        f.target.protectedUntil = 6;
        f.aim(f.shooter, f.target, 1);
        f.round.afterStep(f.state, f.scene, f.inputs);
        f.target.protectedUntil = 0;
        f.state.elapsed += 0.1;
        f.aim(f.shooter, f.target, 2);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.shooter.score).toBe(0);
        f.state.elapsed += 0.3;
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.shooter.score).toBe(0); // rejected sequence stays consumed after cooldown
        f.aim(f.shooter, f.target, 3);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.shooter.score).toBe(1);
    });
    it('waits two seconds to respawn, teleports safely once and protects for one second', () => {
        const f = fixture();
        f.aim(f.shooter, f.target, 1);
        f.round.afterStep(f.state, f.scene, f.inputs);
        f.state.elapsed = 6.99;
        f.round.beforeStep(f.state, f.scene);
        expect(f.characters.get('target')!.enabled).toBe(false);
        f.state.elapsed = 7;
        f.round.beforeStep(f.state, f.scene);
        expect(f.target.respawnAt).toBe(0);
        expect(f.target.protectedUntil).toBe(8);
        expect(f.target.respawns).toBe(1);
        expect(f.characters.get('target')!.enabled).toBe(true);
        expect(f.characters.get('target')!.rigidbody.teleport).toHaveBeenCalledExactlyOnceWith(
            f.target.x,
            f.target.y,
            f.target.z
        );
        expect(LASER_SPAWNS).toContainEqual({ x: f.target.x, y: f.target.y, z: f.target.z });
        f.round.beforeStep(f.state, f.scene);
        expect(f.target.respawns).toBe(1);
    });
    it('blocks farming a newly respawned target with real authoritative rays', () => {
        const f = fixture();
        f.target.protectedUntil = 6;
        f.aim(f.shooter, f.target, 1);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.shooter.score).toBe(0);
        expect(f.target.respawnAt).toBe(0);
        f.state.elapsed = 6;
        f.aim(f.shooter, f.target, 2);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.shooter.score).toBe(1);
    });
    it('ignores disconnected targets and never resurrects a disconnected pending respawn', () => {
        const f = fixture();
        f.target.connected = false;
        f.aim(f.shooter, f.target, 1);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.shooter.score).toBe(0);
        f.target.respawnAt = 4;
        f.characters.get('target')!.enabled = false;
        f.round.beforeStep(f.state, f.scene);
        expect(f.target.respawnAt).toBe(4);
        expect(f.characters.get('target')!.enabled).toBe(false);
    });
    it('does not fire for dead, disconnected, stale, previous-round or wrong-mode shooters', () => {
        for (const invalid of ['dead', 'disconnected', 'stale', 'round', 'mode', 'life'] as const) {
            const f = fixture();
            const input = f.aim(f.shooter, f.target, 1);
            if (invalid === 'dead') f.shooter.respawnAt = 6;
            if (invalid === 'disconnected') f.shooter.connected = false;
            if (invalid === 'stale') f.inputs.get(f.shooter.id)!.received = performance.now() - 401;
            if (invalid === 'round') input.roundId--;
            if (invalid === 'life') input.life++;
            if (invalid === 'mode') f.inputs.get(f.shooter.id)!.input = neutral('obstacle-dash', f.state.roundId);
            f.round.afterStep(f.state, f.scene, f.inputs);
            expect(f.shooter.score, invalid).toBe(0);
            expect(f.events, invalid).toHaveLength(0);
        }
    });
    it('reset clears previous-round firing gates; preparation resets spawn and shield', () => {
        const f = fixture();
        f.target.protectedUntil = 6;
        f.aim(f.shooter, f.target, 1);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.events.filter((e) => e.type === 'shot')).toHaveLength(1);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.events.filter((e) => e.type === 'shot')).toHaveLength(1);
        f.round.reset();
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.events.filter((e) => e.type === 'shot')).toHaveLength(2);
        f.round.prepare(f.shooter, 5);
        expect({ x: f.shooter.x, y: f.shooter.y, z: f.shooter.z }).toEqual(LASER_SPAWNS[5]);
        expect(f.shooter.protectedUntil).toBe(LASER.spawnProtection);
    });
});

it('three authoritative quick hits reduce full health before exactly one elimination', () => {
    const f = fixture();
    f.target.health = 100;
    for (let serial = 1; serial <= 3; serial++) {
        f.state.elapsed = 5 + (serial - 1) * 0.26;
        f.aim(f.shooter, f.target, serial);
        f.round.afterStep(f.state, f.scene, f.inputs);
        expect(f.target.health).toBe(Math.max(0, 100 - serial * 34));
        expect(f.shooter.score).toBe(serial === 3 ? 1 : 0);
    }
    expect(f.events.filter((e) => e.type === 'damage')).toHaveLength(3);
    expect(f.events.filter((e) => e.type === 'tag')).toHaveLength(1);
});
it('charged shots require authoritative preparation and cannot replay rejected serials', () => {
    const f = fixture();
    f.target.health = 100;
    const i = f.aim(f.shooter, f.target, 1);
    if (i.modeId !== 'laser-tag') throw new Error('fixture');
    i.aim.weapon = 'charged';
    f.round.afterStep(f.state, f.scene, f.inputs);
    expect(f.target.health).toBe(100);
    f.state.elapsed += 0.35;
    f.round.afterStep(f.state, f.scene, f.inputs);
    expect(f.target.health).toBe(100);
    i.aim.sequence = 2;
    f.round.afterStep(f.state, f.scene, f.inputs);
    expect(f.target.health).toBe(30);
    expect(f.shooter.score).toBe(0);
});

it('rejects an unseen pre-death shot arriving after respawn, with the same round', () => {
    const f = fixture();
    const old = f.aim(f.shooter, f.target, 99);
    f.shooter.respawns = 1;
    f.inputs.set(f.shooter.id, { input: old, received: performance.now() });
    f.round.afterStep(f.state, f.scene, f.inputs);
    expect(f.events).toHaveLength(0);
    expect(f.target.health).toBe(34);
    old.life = 1;
    if (old.modeId === 'laser-tag') old.aim.sequence = 100;
    f.round.afterStep(f.state, f.scene, f.inputs);
    expect(f.target.health).toBe(0);
});
