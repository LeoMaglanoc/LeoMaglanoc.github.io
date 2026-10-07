"""Audit raw rollouts by independently replaying their saved action sequences.
No policy inference or result-based checkpoint selection.
"""

from common import *
import numpy as np, h5py
from datasets import CONFIG
from simulator import make_env


def main():
    records = []
    for task in CONFIG["robot_tasks"]:
        env, _ = make_env(task)
        with h5py.File(DATA / f"{task}.hdf5") as demos:
            for budget in CONFIG["budgets"]:
                for seed in CONFIG["seeds"]:
                    for regime in ["robot", "ego"]:
                        run = f"robot-{regime}-{budget}-{seed}"
                        metrics = json.loads((CKPT / run / "metrics.json").read_text())
                        checkpoint_hash = sha(CKPT / run / "best.pt")
                        assert metrics["checkpoint_sha256"] == checkpoint_hash
                        for init in CONFIG["evaluation_initializations"]:
                            path = (
                                ART / "rollouts" / run / task / f"episode-{init}.json"
                            )
                            row = json.loads(path.read_text())
                            raw = np.load(path.with_suffix(".npz"))
                            actions, states, frames = (
                                raw["actions"],
                                raw["states"],
                                raw["frames"],
                            )
                            assert row["checkpoint_sha256"] == checkpoint_hash
                            assert actions.shape == (row["length"], 7)
                            assert len(states) == len(actions)
                            assert len(frames) == 1 + (len(actions) + 1) // 2
                            assert frames.shape[1:] == (128, 128, 3)
                            assert (
                                np.isfinite(actions).all() and np.isfinite(states).all()
                            )
                            assert (np.abs(actions) <= 1).all()
                            assert np.isin(actions[:, 6], [-1, 1]).all()
                            assert row["held_out_demo"] == 42 + init
                            assert row["held_out_state_index"] == 1
                            assert np.array_equal(
                                raw["initial_state"],
                                demos[f"data/demo_{42 + init}/states"][1],
                            )
                            # LIBERO checks mjData contacts immediately after mj_step;
                            # a bare final-state restore recomputes contacts at the next
                            # integrated pose (2ms later). Replay reproduces its timing.
                            env.reset()
                            env.set_init_state(raw["initial_state"])
                            max_error = 0.0
                            for step, (action, expected_state) in enumerate(
                                zip(actions, states)
                            ):
                                env.step(action)
                                error = float(
                                    np.max(np.abs(env.get_sim_state() - expected_state))
                                )
                                max_error = max(max_error, error)
                                assert error < 1e-8, (run, task, init, step, error)
                                if step < len(actions) - 1:
                                    assert not env.check_success(), (
                                        "unrecorded earlier success",
                                        run,
                                        task,
                                        init,
                                        step,
                                    )
                            verified = bool(env.check_success())
                            assert verified == row["success"], (
                                run,
                                task,
                                init,
                                verified,
                                row["success"],
                            )
                            env.set_init_state(states[-1])
                            restored_goal = bool(env.check_success())
                            records.append(
                                {
                                    "run": run,
                                    "task": task,
                                    "initialization": init,
                                    "success": verified,
                                    "maximum_replay_state_error": max_error,
                                    "restored_final_pose_goal": restored_goal,
                                    "physics_timestep_seconds": float(
                                        env.sim.model.opt.timestep
                                    ),
                                    "raw_sha256": sha(path.with_suffix(".npz")),
                                }
                            )
                            if len(records) % 20 == 0:
                                print(
                                    "audited action sequences", len(records), flush=True
                                )
        env.close()
    assert len(records) == 180
    save_json(
        PROJECT / "rollout-audit.json",
        {
            "passed": True,
            "checks": "all raw action/state/frame lengths; finite bounded controls and binary gripper; exact held-out start; checkpoint hashes; independent saved-action replay; every control-step state matches within 1e-8; no earlier omitted success; official per-step LIBERO goal predicate; separate restored-final-pose diagnostic",
            "maximum_replay_state_error": max(
                r["maximum_replay_state_error"] for r in records
            ),
            "goal_boundary_differences": sum(
                r["success"] != r["restored_final_pose_goal"] for r in records
            ),
            "success_semantics": "Official goal evaluated immediately after each control action. MuJoCo position/contact caches precede its final 2ms integration; restoring qpos/qvel and forwarding can change boundary contacts. This is not a durable-placement or settling test.",
            "records": records,
        },
    )
    print(
        "PASS: 180 action-sequence replays, every saved state and official success reproduced",
        flush=True,
    )


if __name__ == "__main__":
    main()
