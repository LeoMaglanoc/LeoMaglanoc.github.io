// Only learned neural inference. No physics state cloning or simulation steps.
export async function imagine(policy, start, horizon = 15) {
  let state = { h: Float32Array.from(start.h), z: Float32Array.from(start.z) };
  const trajectory = [];
  for (let i = 0; i < horizon; i++) {
    const action = await policy.act(state);
    const next = await policy.imagine(state, action);
    state = next.state;
    trajectory.push({
      observation: next.observation,
      reward: next.reward,
      action,
      time: (i + 1) * policy.metadata.policy_timestep,
    });
  }
  return trajectory;
}
