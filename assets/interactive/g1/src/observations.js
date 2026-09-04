import { G1_POLICY_CONFIG as C } from "./config.js";

export function getGravityOrientation(quaternion) {
  const qw = quaternion[0];
  const qx = quaternion[1];
  const qy = quaternion[2];
  const qz = quaternion[3];

  return [
    2 * (-qz * qx + qw * qy),
    -2 * (qz * qy + qw * qx),
    1 - 2 * (qw * qw + qz * qz)
  ];
}

export function buildObservation(data, command, previousAction, physicsStep) {
  const obs = new Float32Array(47);
  const qj = data.qpos;
  const dqj = data.qvel;
  const quaternion = [data.qpos[3], data.qpos[4], data.qpos[5], data.qpos[6]];
  const gravity = getGravityOrientation(quaternion);
  const phase = ((physicsStep * C.simulationDt) % C.period) / C.period;

  obs[0] = data.qvel[3] * C.angVelScale;
  obs[1] = data.qvel[4] * C.angVelScale;
  obs[2] = data.qvel[5] * C.angVelScale;
  obs[3] = gravity[0];
  obs[4] = gravity[1];
  obs[5] = gravity[2];

  for (let i = 0; i < 3; i += 1) obs[6 + i] = command[i] * C.commandScale[i];
  for (let i = 0; i < 12; i += 1) {
    obs[9 + i] = (qj[7 + i] - C.defaultAngles[i]) * C.dofPosScale;
    obs[21 + i] = dqj[6 + i] * C.dofVelScale;
    obs[33 + i] = previousAction[i];
  }
  obs[45] = Math.sin(2 * Math.PI * phase);
  obs[46] = Math.cos(2 * Math.PI * phase);
  return obs;
}

export function observationSummary(observation) {
  return {
    angularVelocity: Array.from(observation.slice(0, 3)),
    gravity: Array.from(observation.slice(3, 6)),
    command: Array.from(observation.slice(6, 9)),
    jointPositionError: Array.from(observation.slice(9, 21)),
    jointVelocity: Array.from(observation.slice(21, 33)),
    previousAction: Array.from(observation.slice(33, 45)),
    phase: Array.from(observation.slice(45, 47))
  };
}
