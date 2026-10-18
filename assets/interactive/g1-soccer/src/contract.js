// Preserve SoccerDribble's input order, float32 commands and update-after-step timing.
export const JOINTS = [
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
  "right_ankle_roll_joint",
];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function yaw(q) {
  const [w, x, y, z] = q;
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}
export function highObservation(q, v, base, ball, target, command, baseVel) {
  const angle = yaw(q.subarray(base + 3, base + 7)),
    c = Math.cos(angle),
    s = Math.sin(angle);
  const bx = q[ball] - q[base],
    by = q[ball + 1] - q[base + 1],
    tx = target[0] - q[base],
    ty = target[1] - q[base + 1];
  return Float32Array.from([
    c * bx + s * by,
    -s * bx + c * by,
    c * tx + s * ty,
    -s * tx + c * ty,
    Math.hypot(bx, by),
    Math.hypot(target[0] - q[ball], target[1] - q[ball + 1]),
    c * v[baseVel] + s * v[baseVel + 1],
    -s * v[baseVel] + c * v[baseVel + 1],
    Math.sin(angle),
    Math.cos(angle),
    ...command,
  ]);
}
export function lowObservation(
  q,
  v,
  base,
  baseVel,
  positions,
  velocities,
  command,
  action,
  step,
  cfg,
) {
  const obs = new Float32Array(47),
    [w, x, y, z] = q.subarray(base + 3, base + 7);
  for (let i = 0; i < 3; i++) obs[i] = v[baseVel + 3 + i] * cfg.ang_vel_scale;
  obs.set(
    [2 * (-z * x + w * y), -2 * (z * y + w * x), 1 - 2 * (w * w + z * z)],
    3,
  );
  for (let i = 0; i < 3; i++)
    obs[6 + i] = Math.fround(command[i] * cfg.cmd_scale[i]);
  for (let i = 0; i < 12; i++) {
    obs[9 + i] =
      (q[positions[i]] - Math.fround(cfg.default_angles[i])) *
      cfg.dof_pos_scale;
    obs[21 + i] = v[velocities[i]] * cfg.dof_vel_scale;
  }
  obs.set(action, 33);
  const phase =
    ((step * cfg.simulation_dt) % cfg.gait_period) / cfg.gait_period;
  obs[45] = Math.sin(2 * Math.PI * phase);
  obs[46] = Math.cos(2 * Math.PI * phase);
  return obs;
}
export function integrateCommand(command, action, cfg) {
  for (let i = 0; i < 3; i++)
    command[i] = clamp(
      Math.fround(
        command[i] +
          Math.fround(
            clamp(action[i], -1, 1) * Math.fround(cfg.delta_cmd_limit[i]),
          ),
      ),
      -cfg.cmd_limit[i],
      cfg.cmd_limit[i],
    );
}
export function outcome(q, base, ball, target, steps, cfg) {
  if (!q.every(Number.isFinite))
    throw Error("Simulation produced a non-finite state. Reset to try again.");
  if (q[base + 2] < cfg.high_level.fall_height_threshold) return "fall";
  if (
    Math.abs(q[ball]) > cfg.field_cfg.half_x ||
    Math.abs(q[ball + 1]) > cfg.field_cfg.half_y
  )
    return "ball_out_of_bounds";
  if (
    Math.hypot(q[ball] - target[0], q[ball + 1] - target[1]) <
    cfg.field_cfg.target_radius
  )
    return "success";
  if (steps * cfg.low_level.simulation_dt >= cfg.high_level.max_episode_seconds)
    return "timeout";
  return null;
}
