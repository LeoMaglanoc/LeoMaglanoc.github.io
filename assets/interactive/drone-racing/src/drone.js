import { clamp } from "./math.js";
export const PARAMS = Object.freeze({
  mass: 0.029,
  gravity: 9.81,
  arm: 0.03253,
  kf: 2.2417e-8,
  km: 1.64786e-10,
  maxForce: 0.12,
  inertia: [1.4e-5, 1.4e-5, 2.17e-5],
});
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
