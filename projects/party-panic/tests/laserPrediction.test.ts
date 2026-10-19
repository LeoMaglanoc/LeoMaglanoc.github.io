import { expect, it } from 'vitest';
import { LaserPrediction, clipArena } from '../src/laserPrediction';
import { neutral, type Player } from '../src/protocol';
import { LASER_COVERS } from '../src/laser';

const player = () => ({ x: -4, y: 0.75, z: -8, vx: 0, vz: 0, respawns: 0, respawnAt: 0, inputSequence: 0 }) as Player;
it('sweeps large deltas into the same cover and perimeter without tunnelling', () => {
    const p = player();
    const cover = clipArena(p, { ...p, z: 10 });
    expect(cover.z).toBeLessThan(-6.43);
    expect(cover.z).toBeGreaterThan(-6.46);
    const wall = clipArena({ x: -12, y: 0.75, z: 0 }, { x: -100, y: 0.75, z: 0 });
    expect(wall.x).toBeGreaterThan(-13.61);
});
it('responds locally then reconciles acknowledged input, resets respawns and freezes stale snapshots', () => {
    const g = new LaserPrediction(),
        p = player(),
        input = { ...neutral('laser-tag', 1), sequence: 1, axes: [0, 1] as [number, number] };
    let out = g.sample(p, 1, input, 1 / 60, 0);
    expect(out.z).toBeGreaterThan(p.z);
    for (let i = 0; i < 200; i++) out = g.sample(p, 1, { ...input, sequence: i + 2 }, 1 / 60, 20);
    expect(out.z).toBeLessThanOrEqual(-6.43);
    expect(out.z).toBeGreaterThan(-6.46);
    p.respawns++;
    p.x = 11;
    p.z = 8;
    p.inputSequence = 300;
    out = g.sample(p, 2, { ...input, sequence: 301, axes: [0, 0] }, 1 / 60, 0);
    expect(out.x).toBe(11);
    expect(out.z).toBe(8);
    out = g.sample(p, 2, input, 0.1, 700);
    expect(out.x).toBe(11);
    expect(out.z).toBe(8);
});
it('a sustained prediction stays outside every shared arena cover', () => {
    for (const axes of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [Math.SQRT1_2, Math.SQRT1_2]
    ] as [number, number][]) {
        const g = new LaserPrediction(),
            p = player();
        for (let n = 0; n < 240; n++) {
            const out = g.sample(p, 0, { ...neutral('laser-tag', 1), sequence: n + 1, axes }, 1 / 60, 30);
            expect(
                LASER_COVERS.some(
                    (c) =>
                        c.max.y > 0.3 &&
                        out.x > c.min.x - 0.38 &&
                        out.x < c.max.x + 0.38 &&
                        out.z > c.min.z - 0.38 &&
                        out.z < c.max.z + 0.38
                )
            ).toBe(false);
        }
    }
});
