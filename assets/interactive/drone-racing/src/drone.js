import { clamp } from "./math.js";
import { VEHICLE } from "./vehicle-config.js";
export const PARAMS = Object.freeze({ ...VEHICLE, arm: VEHICLE.armLength,
  kf: VEHICLE.thrustCoefficient, km: VEHICLE.torqueCoefficient, maxForce: VEHICLE.maxRotorThrust });
// Rotor positions (+X,+Y), (-X,+Y), (-X,-Y), (+X,-Y); spins +,-,+,-.
// f_i=kf*w_i^2, yaw reaction=spin_i*km*w_i^2; tau=r cross [0,0,f].
export function rotorWrench(speeds, out = new Float64Array(4), efficiency = 1) {
  const f0 = PARAMS.kf * speeds[0] ** 2,
    f1 = PARAMS.kf * speeds[1] ** 2,
    f2 = PARAMS.kf * speeds[2] ** 2 * efficiency,
    f3 = PARAMS.kf * speeds[3] ** 2;
  out[0] = f0 + f1 + f2 + f3;
  out[1] = PARAMS.arm * (f0 + f1 - f2 - f3);
  out[2] = PARAMS.arm * (-f0 + f1 + f2 - f3);
  out[3] = (PARAMS.km / PARAMS.kf) * (f0 - f1 + f2 - f3);
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
