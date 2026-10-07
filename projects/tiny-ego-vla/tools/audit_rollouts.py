"""Audit every raw rollout and independently recompute final-state task success.
No policy inference, action replay or result-based checkpoint selection.
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
                            env.set_init_state(states[-1])
                            verified = bool(env.check_success())
                            assert verified == row["success"], (
                                run,
                                task,
                                init,
                                verified,
                                row["success"],
                            )
                            records.append(
                                {
                                    "run": run,
                                    "task": task,
                                    "initialization": init,
                                    "success": verified,
                                    "raw_sha256": sha(path.with_suffix(".npz")),
                                }
                            )
        env.close()
    assert len(records) == 180
    save_json(
        PROJECT / "rollout-audit.json",
        {
            "passed": True,
            "checks": "all raw action/state/frame lengths; finite bounded controls and binary gripper; exact held-out start; checkpoint hashes; independent final-state LIBERO goal predicate",
            "records": records,
        },
    )
    print(
        "PASS: 180 raw rollouts and independently verified final-state successes",
        flush=True,
    )


if __name__ == "__main__":
    main()
