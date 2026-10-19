export const RACE_MOVEMENT = {
    speed: 2.8,
    groundAcceleration: 36,
    groundBraking: 42,
    airAcceleration: 9,
    hitRecoveryAcceleration: 3,
    jumpVelocity: 7.5,
    jumpBuffer: 0.1,
    coyoteTime: 0.1,
    gravityRise: 18,
    gravityFall: 22,
    gravityCut: 44,
    maxFallSpeed: 25,
    airFriction: 2,
    diveImpulse: 3.4,
    diveMaxSpeed: 6.2,
    diveLift: 1.6,
    diveDuration: 0.32,
    diveCooldown: 0.85,
    diveSteering: 0.2,
    stumbleDeadTime: 0.08,
    stumbleRecovery: 0.45,
    turnRate: 14
} as const;

/** Bounded change in horizontal speed, independent of travel direction. */
export function approachHorizontal(
    vx: number,
    vz: number,
    axisX: number,
    axisZ: number,
    speed: number,
    acceleration: number,
    dt: number
): [number, number] {
    const axisLength = Math.max(1, Math.hypot(axisX, axisZ));
    const dx = (axisX / axisLength) * speed - vx;
    const dz = (axisZ / axisLength) * speed - vz;
    const distance = Math.hypot(dx, dz);
    const fraction = distance > 0 ? Math.min(1, (Math.max(0, acceleration) * Math.max(0, dt)) / distance) : 0;
    return [vx + dx * fraction, vz + dz * fraction];
}

/** Wobble Rush-inspired momentum decay; never snap an impulse to running speed. */
export function raceHorizontal(
    vx: number,
    vz: number,
    axes: readonly number[],
    grounded: boolean,
    diving: boolean,
    sinceHit: number,
    dt: number
): [number, number] {
    const t = RACE_MOVEMENT;
    const authority = Math.max(
        0,
        Math.min(1, (sinceHit - t.stumbleDeadTime) / (t.stumbleRecovery - t.stumbleDeadTime))
    );
    const magnitude = Math.hypot(...axes);
    const speed = Math.hypot(vx, vz);
    const friction = grounded && !diving ? t.groundBraking : t.airFriction;
    if (speed > t.speed || magnitude < 0.01) {
        const floor = magnitude > 0.01 ? t.speed : 0;
        const next = Math.max(floor, speed - friction * dt);
        const scale = speed > 0 ? Math.min(1, next / speed) : 0;
        vx *= scale;
        vz *= scale;
        if (!diving || magnitude < 0.01) return [vx, vz];
        return approachHorizontal(vx, vz, axes[0], axes[1], next, t.airAcceleration * t.diveSteering * authority, dt);
    }
    return approachHorizontal(
        vx,
        vz,
        axes[0],
        axes[1],
        t.speed,
        (diving ? t.airAcceleration * t.diveSteering : grounded ? t.groundAcceleration : t.airAcceleration) * authority,
        dt
    );
}

export function raceGravity(vy: number, held: boolean) {
    return vy > 0 ? (held ? RACE_MOVEMENT.gravityRise : RACE_MOVEMENT.gravityCut) : RACE_MOVEMENT.gravityFall;
}

export function turnToward(yaw: number, target: number, dt: number) {
    const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
    return yaw + Math.max(-RACE_MOVEMENT.turnRate * dt, Math.min(RACE_MOVEMENT.turnRate * dt, delta));
}
