export const G1_POLICY_CONFIG = Object.freeze({
  simulationDt: 0.002,
  controlDecimation: 10,
  policyHz: 50,
  physicsHz: 500,
  period: 0.8,
  kp: Object.freeze([100, 100, 100, 150, 40, 40, 100, 100, 100, 150, 40, 40]),
  kd: Object.freeze([2, 2, 2, 4, 2, 2, 2, 2, 2, 4, 2, 2]),
  defaultAngles: Object.freeze([-0.1, 0, 0, 0.3, -0.2, 0, -0.1, 0, 0, 0.3, -0.2, 0]),
  angVelScale: 0.25,
  dofPosScale: 1,
  dofVelScale: 0.05,
  actionScale: 0.25,
  commandScale: Object.freeze([2, 2, 0.25]),
  commandInitial: Object.freeze([0, 0, 0]),
  commandLimits: Object.freeze({ vx: 1, vy: 0.5, yaw: 1 })
});

export const LEG_JOINT_NAMES = Object.freeze([
  "left_hip_pitch_joint",
  "left_hip_roll_joint",
  "left_hip_yaw_joint",
  "left_knee_joint",
  "left_ankle_pitch_joint",
  "left_ankle_roll_joint",
  "right_hip_pitch_joint",
  "right_hip_roll_joint",
  "right_hip_yaw_joint",
  "right_knee_joint",
  "right_ankle_pitch_joint",
  "right_ankle_roll_joint"
]);
