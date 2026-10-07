"""Confirm robot training proprioception and online simulator observations agree."""

from common import *
import numpy as np, h5py
from simulator import make_env, proprio, upright_frame
from PIL import Image


def main():
    env, task = make_env("bowl_plate")
    record = []
    with h5py.File(DATA / "bowl_plate.hdf5") as f:
        d = f["data/demo_0"]
        for t in [0, 40, 80]:
            obs = env.set_init_state(d["states"][t])
            p = proprio(obs)
            reference = np.concatenate(
                [d["obs/ee_states"][t], d["obs/gripper_states"][t]]
            )
            diff = float(np.max(np.abs(p - reference)))
            obs_next = env.set_init_state(d["states"][t + 1])
            diff_next = float(np.max(np.abs(proprio(obs_next) - reference)))
            assert diff_next < 0.001, (t, diff_next)
            env.set_init_state(d["states"][t + 1])
            rendered = upright_frame(env)
            stored = d["obs/agentview_rgb"][t][::-1].copy()
            # Shadow settings can differ. Save actual pairs for inspection instead of
            # claiming exact RGB parity under different renderer settings.
            Image.fromarray(np.concatenate([stored, rendered], axis=1)).resize(
                (768, 384)
            ).save(ART / f"sim-parity-{t}.jpg")
            record.append(
                {
                    "frame": t,
                    "proprio_max_abs_error_same_index": diff,
                    "proprio_max_abs_error_next_state": diff_next,
                    "rgb_mae": float(
                        np.abs(stored.astype(float) - rendered.astype(float)).mean()
                    ),
                    "image": f"artifacts/sim-parity-{t}.jpg",
                }
            )
    env.close()
    save_json(PROJECT / "sim-parity-report.json", record)
    print(record)


if __name__ == "__main__":
    main()
