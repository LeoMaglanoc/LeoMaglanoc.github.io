// Same inspected dm_control contract: position[x, zz, xz], velocity[x, theta].
export function observation(data) {
  return Float32Array.of(
    data.qpos[0],
    Math.cos(data.qpos[1]),
    Math.sin(data.qpos[1]),
    data.qvel[0],
    data.qvel[1],
  );
}

// Native dense reward, useful for live diagnostics only. Training uses dm_control.
export function reward(data, action) {
  const upright = (Math.cos(data.qpos[1]) + 1) / 2;
  const gaussian = (x, margin) => Math.exp(Math.log(0.1) * (x / margin) ** 2);
  const centered = (1 + gaussian(data.qpos[0], 2)) / 2;
  const smallControl = (4 + Math.max(0, 1 - action ** 2)) / 5;
  const smallVelocity = (1 + gaussian(data.qvel[1], 5)) / 2;
  return upright * centered * smallControl * smallVelocity;
}
