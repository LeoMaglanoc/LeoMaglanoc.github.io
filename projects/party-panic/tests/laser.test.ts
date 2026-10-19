import { describe, expect, it } from 'vitest';
import {
    LASER,
    LASER_COVERS,
    LASER_SPAWNS,
    ShotGate,
    aimDirection,
    chooseSpawn,
    getAimRig,
    laserRank,
    rayBox,
    rayCapsule,
    resolveShot,
    type Cover,
    type LaserTarget,
    type Point
} from '../src/laser';
const target = (id: string, z = -10, x = 0): LaserTarget => ({
    id,
    x,
    y: 0.75,
    z,
    connected: true,
    respawnAt: 0,
    protectedUntil: 0
});
const wall: Cover = { min: { x: -2, y: 0, z: -5 }, max: { x: 2, y: 2, z: -4 } };
const shot = (targets: LaserTarget[], overrides: Partial<Parameters<typeof resolveShot>[0]> = {}) =>
    resolveShot({
        camera: { x: 0, y: 1, z: 3 },
        muzzle: { x: 0, y: 1, z: 0 },
        yaw: 0,
        pitch: 0,
        shooterId: 'self',
        targets,
        now: 5,
        covers: [],
        ...overrides
    });

describe('host fire gate', () => {
    it('enforces cooldown and consumes excess attempts before replay', () => {
        const gate = new ShotGate();
        expect(gate.attempt(1, 0, 0, 0)).toBe(true);
        expect(gate.attempt(2, 0.1, 0, 0)).toBe(false);
        expect(gate.attempt(2, 1, 0, 0)).toBe(false);
        expect(gate.attempt(1, 1, 0, 0)).toBe(false);
        expect(gate.attempt(3, 1 / 3, 0, 0)).toBe(true);
        expect(gate.attempt(4, 0.3, 0, 0)).toBe(false);
    });
    it('rejects nonfinite and out of bound angles, invalid sequences and times', () => {
        for (const [yaw, pitch] of [
            [NaN, 0],
            [Infinity, 0],
            [Math.PI + 0.01, 0],
            [0, LASER.maxPitch + 0.01],
            [0, -LASER.maxPitch - 0.01]
        ]) {
            const gate = new ShotGate();
            expect(gate.attempt(1, 1, yaw, pitch)).toBe(false);
            expect(gate.attempt(1, 2, 0, 0)).toBe(false);
        }
        const gate = new ShotGate();
        for (const sequence of [-1, NaN, Infinity, 1.5]) expect(gate.attempt(sequence, 0, 0, 0)).toBe(false);
        expect(gate.attempt(1, NaN, 0, 0)).toBe(false);
        expect(gate.attempt(2, -1, 0, 0)).toBe(false);
        expect(gate.attempt(3, 0, Math.PI, -LASER.maxPitch)).toBe(true);
        expect(new ShotGate().attempt(1, 0, 0, 0)).toBe(true);
    });
});

describe('equivalent host ray intersections', () => {
    it('handles slab parallel rays, inside starts, backfaces and range', () => {
        expect(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, wall)).toBe(4);
        expect(rayBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, wall, 3.9)).toBeNull();
        expect(rayBox({ x: 3, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, wall)).toBeNull();
        expect(rayBox({ x: 0, y: 1, z: -4.5 }, { x: 1, y: 0, z: 0 }, wall)).toBe(0);
        expect(rayBox({ x: 0, y: 1, z: -6 }, { x: 0, y: 0, z: -1 }, wall)).toBeNull();
    });
    it('uses a capsule rather than an oversized box or sphere', () => {
        const center = { x: 0, y: 0.75, z: -5 };
        expect(rayCapsule({ x: 0, y: 0.75, z: 0 }, { x: 0, y: 0, z: -1 }, center)).toBeCloseTo(4.62);
        expect(rayCapsule({ x: 0, y: 3, z: -5 }, { x: 0, y: -1, z: 0 }, center)).toBeCloseTo(1.5);
        expect(rayCapsule(center, { x: 1, y: 0, z: 0 }, center)).toBe(0);
        expect(rayCapsule({ x: 0.4, y: 0.75, z: 0 }, { x: 0, y: 0, z: -1 }, center)).toBeNull();
        expect(rayCapsule({ x: 0.35, y: 1.45, z: 0 }, { x: 0, y: 0, z: -1 }, center)).toBeNull();
    });
});

describe('authoritative camera and muzzle shot validation', () => {
    it('tags only the first valid target with a visible ray', () => {
        expect(shot([target('far', -15), target('near', -8)]).targetId).toBe('near');
        expect(shot([target('self', -2), target('other')]).targetId).toBe('other');
        expect(shot([target('off-axis', -10, 2)]).targetId).toBeNull();
        expect(shot([target('behind', 5)]).targetId).toBeNull();
    });
    it('cannot hit a target behind cover or outside muzzle range', () => {
        expect(shot([target('covered')], { covers: [wall] }).targetId).toBeNull();
        expect(shot([target('covered')], { covers: [wall] }).blocked).toBe(true);
        expect(shot([target('distant', -26)]).targetId).toBeNull();
        expect(shot([target('within', -24)]).targetId).toBe('within');
    });
    it('camera seeing over low cover cannot make muzzle shoot through it', () => {
        const low: Cover = { min: { x: -2, y: 0, z: -3 }, max: { x: 2, y: 1.3, z: -2 } };
        const result = shot([target('visible')], {
            camera: { x: 0, y: 2.5, z: 0 },
            pitch: -Math.atan2(1.5, 10),
            covers: [low]
        });
        expect(result.targetId).toBeNull();
        expect(result.blocked).toBe(true);
        expect(result.to.z).toBeCloseTo(-2);
    });
    it('protected players absorb a shot without a score; dead and disconnected targets are absent', () => {
        expect(shot([{ ...target('shielded', -5), protectedUntil: 6 }, target('behind', -10)]).targetId).toBeNull();
        expect(shot([{ ...target('shielded'), protectedUntil: 5 }]).targetId).toBe('shielded');
        expect(shot([{ ...target('dead', -5), respawnAt: 7 }, target('alive')]).targetId).toBe('alive');
        expect(shot([{ ...target('gone', -5), connected: false }, target('alive')]).targetId).toBe('alive');
    });
    it('rejects invalid aim and nonfinite origins without producing an endpoint', () => {
        expect(shot([target('other')], { yaw: NaN }).targetId).toBeNull();
        expect(shot([target('other')], { pitch: 0.81 }).targetId).toBeNull();
        expect(shot([target('other')], { camera: { x: Infinity, y: 1, z: 0 } }).targetId).toBeNull();
    });
});

describe('shared rig, arena and results', () => {
    it('shares radian aiming convention and clips camera plus muzzle before walls', () => {
        expect(aimDirection(Math.PI / 2, 0).x).toBeCloseTo(1);
        const rearWall: Cover = { min: { x: -4, y: 0, z: 1 }, max: { x: 4, y: 3, z: 2 } };
        const position = { x: 0, y: 0.75, z: 0 };
        const rig = getAimRig(position, 0, 0, [rearWall]);
        expect(rig.camera.z).toBeLessThan(0.8);
        expect(rig.camera.z).toBeGreaterThan(0);
        const frontWall: Cover = { min: { x: -4, y: 0, z: -0.4 }, max: { x: 4, y: 3, z: -0.3 } };
        expect(getAimRig(position, 0, 0, [frontWall]).muzzle.z).toBeGreaterThan(-0.27);
        for (const yaw of [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
            const upward = getAimRig(position, yaw, LASER.maxPitch);
            expect(upward.camera.y).toBeGreaterThan(0.2);
            expect(upward.muzzle.y).toBeGreaterThan(0);
        }
    });
    it('has eight distinct non-overlapping capsule spawn locations with center cover', () => {
        expect(new Set(LASER_SPAWNS.map((p) => `${p.x},${p.z}`)).size).toBe(8);
        for (const spawn of LASER_SPAWNS) {
            expect(Math.abs(spawn.x) + LASER.radius).toBeLessThan(LASER.bounds.x);
            expect(Math.abs(spawn.z) + LASER.radius).toBeLessThan(LASER.bounds.z);
            for (const cover of LASER_COVERS) {
                if (spawn.y - LASER.height / 2 > cover.max.y || spawn.y + LASER.height / 2 < cover.min.y) continue;
                const closestX = Math.max(cover.min.x, Math.min(cover.max.x, spawn.x));
                const closestZ = Math.max(cover.min.z, Math.min(cover.max.z, spawn.z));
                expect(Math.hypot(closestX - spawn.x, closestZ - spawn.z)).toBeGreaterThan(LASER.radius);
            }
            const eye: Point = { ...spawn, y: 1.1 };
            const delta = { x: -spawn.x, y: 0, z: -spawn.z };
            const distance = Math.hypot(delta.x, delta.z);
            expect(
                LASER_COVERS.some(
                    (cover) =>
                        rayBox(eye, { x: delta.x / distance, y: 0, z: delta.z / distance }, cover, distance) !== null
                )
            ).toBe(true);
        }
    });
    it('selects a distant spawn deterministically and never mutates arena state', () => {
        const occupied = { ...target('enemy'), ...LASER_SPAWNS[0] };
        const spawn = chooseSpawn([occupied], 0);
        expect(Math.hypot(spawn.x - occupied.x, spawn.z - occupied.z)).toBeGreaterThan(15);
        expect(chooseSpawn([], 0, 3)).toEqual(LASER_SPAWNS[3]);
        spawn.x = 900;
        expect(LASER_SPAWNS.every((p) => Math.abs(p.x) < 14)).toBe(true);
        expect(chooseSpawn([{ ...occupied, connected: false }], 0, 2)).toEqual(LASER_SPAWNS[2]);
    });
    it('ranks authoritative scores with stable ties without modifying input', () => {
        const players = [
            { id: 'z', score: 2 },
            { id: 'b', score: 5 },
            { id: 'a', score: 5 }
        ];
        expect(laserRank(players).map((p) => p.id)).toEqual(['a', 'b', 'z']);
        expect(players[0].id).toBe('z');
    });
});
