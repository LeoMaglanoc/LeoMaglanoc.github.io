"""Reproduce the first discovered cached-contact / restored-pose goal boundary.
Diagnostic only; does not change official evaluation records or model selection.
"""

from common import *
from simulator import make_env
import numpy as np, mujoco


def main():
    path = ART / "rollouts/robot-robot-4-29/bowl_plate/episode-1.npz"
    raw = np.load(path)
    env, _ = make_env("bowl_plate")
    assert int(env.sim.model.opt.integrator) == 0  # semi-implicit Euler
    env.set_init_state(raw["states"][-1])
    final_goal = bool(env.check_success())
    # Euler integrates qpos using the newly updated qvel. Undo only that final
    # position integration to reconstruct the geometry used by cached contacts.
    mujoco.mj_integratePos(
        env.sim.model._model,
        env.sim.data.qpos,
        env.sim.data.qvel,
        -env.sim.model.opt.timestep,
    )
    env.sim.forward()
    cached_pose_goal = bool(env.check_success())
    env.reset()
    env.set_init_state(raw["initial_state"])
    started = time.perf_counter()
    for action in raw["actions"]:
        env.step(action)
    seconds = time.perf_counter() - started
    replay_goal = bool(env.check_success())
    error = float(np.max(np.abs(env.get_sim_state() - raw["states"][-1])))
    env.sim.forward()
    forward_goal = bool(env.check_success())
    recorded = json.loads(path.with_suffix(".json").read_text())
    assert replay_goal == cached_pose_goal == recorded["success"]
    assert final_goal == forward_goal and final_goal != replay_goal and error < 1e-8
    report = dict(
        passed=True,
        run=recorded["run"],
        task=recorded["task"],
        initialization=recorded["initialization"],
        raw_sha256=sha(path),
        physics_timestep_seconds=float(env.sim.model.opt.timestep),
        cached_pose_goal=cached_pose_goal,
        action_replay_goal=replay_goal,
        restored_final_pose_goal=final_goal,
        replay_after_forward_goal=forward_goal,
        maximum_final_state_error=error,
        action_replay_seconds=seconds,
        explanation="Official LIBERO check uses cached contact geometry preceding the last 2ms integration; forwarding the saved post-integration pose changes this boundary contact.",
        source="https://mujoco.readthedocs.io/en/3.2.7/computation/index.html#consistency-in-mjdata",
    )
    save_json(PROJECT / "goal-timing-audit.json", report)
    env.close()
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
