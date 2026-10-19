export const RACE_MOVEMENT = {
    speed: 2.8,
    groundAcceleration: 36,
    groundBraking: 42,
    airAcceleration: 9,
    hitRecoveryAcceleration: 3,
    jumpVelocity: 7.5,
    jumpBuffer: 0.1,
    coyoteTime: 0.1
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
