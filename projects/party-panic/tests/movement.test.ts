import { describe, expect, it } from 'vitest';
import { raceHorizontal, raceGravity, turnToward, approachHorizontal, RACE_MOVEMENT } from '../src/movement';

describe('authoritative race horizontal movement', () => {
    it('applies the same acceleration and braking magnitude on cardinal and diagonal paths', () => {
        for (const [x, z] of [
            [0, -1],
            [Math.SQRT1_2, -Math.SQRT1_2]
        ]) {
            const velocity = approachHorizontal(0, 0, x, z, 2.8, 36, 1 / 60);
            expect(Math.hypot(...velocity)).toBeCloseTo(0.6);
            const braking = approachHorizontal(x * 2.8, z * 2.8, 0, 0, 2.8, 42, 1 / 60);
            expect(Math.hypot(...braking)).toBeCloseTo(2.1);
        }
    });
    it('normalizes diagonal inputs, never overshoots target, and stops exactly', () => {
        const velocity = approachHorizontal(0, 0, 1, 1, RACE_MOVEMENT.speed, 36, 1);
        expect(Math.hypot(...velocity)).toBeCloseTo(RACE_MOVEMENT.speed);
        expect(approachHorizontal(0.1, -0.2, 0, 0, 2.8, 42, 1 / 60)).toEqual([0, 0]);
    });
    it('preserves bounded hit momentum and uses air control for in-flight braking', () => {
        const hit = approachHorizontal(5, 0, 0, -1, 2.8, RACE_MOVEMENT.hitRecoveryAcceleration, 1 / 60);
        expect(Math.hypot(hit[0] - 5, hit[1])).toBeCloseTo(0.05);
        const air = approachHorizontal(0, -2.8, 0, 0, 2.8, RACE_MOVEMENT.airAcceleration, 1 / 60);
        expect(air[1]).toBeCloseTo(-2.65);
    });
    it('does not move when simulation delta is zero', () => {
        expect(approachHorizontal(1, -2, 0, 0, 2.8, 42, 0)).toEqual([1, -2]);
    });
});

it('preserves impulse speed and bounds stumble recovery and dive steering', () => {
    expect(raceHorizontal(5, 0, [0, -1], false, true, 10, 1 / 60)[0]).toBeGreaterThan(4.9);
    expect(raceHorizontal(0, 0, [0, -1], true, false, 0.03, 1 / 60)).toEqual([0, 0]);
    expect(raceHorizontal(0, 0, [0, -1], true, false, 0.5, 1 / 60)[1]).toBeCloseTo(-0.6);
    expect(raceGravity(3, false)).toBeGreaterThan(raceGravity(3, true));
    expect(raceGravity(-3, true)).toBeGreaterThan(raceGravity(3, true));
    expect(turnToward(Math.PI - 0.01, -Math.PI + 0.01, 1 / 60)).toBeCloseTo(Math.PI + 0.01);
});
