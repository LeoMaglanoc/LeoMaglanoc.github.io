import { G1_POLICY_CONFIG as C } from "./config.js";

export function desiredJointPositions(action) {
  const target = new Float32Array(12);
  for (let i = 0; i < 12; i += 1) target[i] = action[i] * C.actionScale + C.defaultAngles[i];
  return target;
}

export function pdControl(target, q, dq) {
  const torque = new Float32Array(12);
  for (let i = 0; i < 12; i += 1) {
    torque[i] = C.kp[i] * (target[i] - q[7 + i]) - C.kd[i] * dq[6 + i];
  }
  return torque;
}
