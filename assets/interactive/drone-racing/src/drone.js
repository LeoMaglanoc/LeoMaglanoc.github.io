import { clamp } from "./math.js";
import { VEHICLE } from "./vehicle-config.js";
export const PARAMS = Object.freeze({
  ...VEHICLE,
  arm: VEHICLE.armLength,
  kf: VEHICLE.thrustCoefficient,
  km: VEHICLE.torqueCoefficient,
  maxForce: VEHICLE.maxRotorThrust,
});
// Rotor positions (+X,+Y), (-X,+Y), (-X,-Y), (+X,-Y); spins +,-,+,-.
// f_i=kf*w_i^2, yaw reaction=spin_i*km*w_i^2; tau=r cross [0,0,f].
export function rotorWrench(speeds, out = new Float64Array(4), efficiency = 1) {
  out.fill(0);
  for (let i = 0; i < 4; i++) {
    const f = PARAMS.kf * speeds[i] ** 2 * (i === 2 ? efficiency : 1);
    const [x, y] = VEHICLE.motorPositions[i];
    out[0] += f;
    out[1] += y * f;
    out[2] -= x * f;
    out[3] += VEHICLE.rotorDirections[i] * (PARAMS.km / PARAMS.kf) * f;
  }
  return out;
}
export function mix(wrench, out = new Float64Array(4)) {
  const [f, tx, ty, tz] = wrench,
    a = tx / PARAMS.arm,
    b = ty / PARAMS.arm,
    c = (tz * PARAMS.kf) / PARAMS.km;
  const forces = [(f + a - b + c) / 4, (f + a + b - c) / 4, (f - a + b + c) / 4, (f - a - b - c) / 4];
  for (let i = 0; i < 4; i++) out[i] = Math.sqrt(clamp(forces[i], 0, PARAMS.maxForce) / PARAMS.kf);
  return out;
}
