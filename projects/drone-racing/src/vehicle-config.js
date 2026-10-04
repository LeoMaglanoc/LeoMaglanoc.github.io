// Approximate custom 5-inch racing quad, SI units; not a calibrated digital twin.
const arm = 0.22 / (2 * Math.sqrt(2));
export const VEHICLE = Object.freeze({
  mass: 0.65,
  gravity: 9.81,
  wheelbase: 0.22,
  armLength: arm,
  inertia: Object.freeze([0.0023, 0.0023, 0.004]),
  motorPositions: Object.freeze(
    [
      [arm, arm, 0],
      [-arm, arm, 0],
      [-arm, -arm, 0],
      [arm, -arm, 0],
    ].map(Object.freeze)
  ),
  rotorDirections: Object.freeze([1, -1, 1, -1]),
  maxRotorThrust: 6,
  thrustCoefficient: 8e-6,
  torqueCoefficient: 1.2e-7,
  motorTimeConstant: 0.018,
  collisionRadius: 0.175,
  visual: Object.freeze({ propRadius: 0.0635, bodyLength: 0.11, bodyWidth: 0.045, bodyHeight: 0.07 }),
});
export function motorResponse(actual, command, dt) {
  const alpha = -Math.expm1(-dt / VEHICLE.motorTimeConstant);
  for (let i = 0; i < 4; i++) actual[i] += alpha * (command[i] - actual[i]);
  return actual;
}
