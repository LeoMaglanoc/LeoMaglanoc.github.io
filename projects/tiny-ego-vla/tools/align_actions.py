"""Repair legacy caches after confirming official LIBERO post-action observations.
Reuses exact frozen visual features. Never pairs an observation with a past action.
"""

from common import *
import h5py, numpy as np

ALIGNMENT = "post_action_obs_predict_next_two_actions"


def main():
    count = 0
    for task in ["bowl_plate", "bowl_ramekin"]:
        with h5py.File(DATA / f"{task}.hdf5") as f:
            for i in range(50):
                path = DATA / f"{task}_demo_{i:02d}.npz"
                cache = np.load(path)
                if (
                    "action_alignment" in cache
                    and str(cache["action_alignment"]) == ALIGNMENT
                ):
                    continue
                d = {k: cache[k] for k in cache.files}
                cache.close()
                source = f[f"data/demo_{i}"]
                n = len(source["actions"])
                keep = d["indices"] + 2 < n
                for k in ["visual", "proprio", "indices"]:
                    d[k] = d[k][keep]
                d["actions"] = np.array(
                    [
                        source["actions"][j]
                        for k in d["indices"]
                        for j in (k + 1, k + 2)
                    ],
                    dtype="float32",
                ).reshape(-1, 2, 7)
                d["action_alignment"] = np.array(ALIGNMENT)
                np.savez_compressed(path, **d)
                count += 1
    save_json(
        ART / "action-alignment.json",
        {
            "repaired_caches": count,
            "alignment": ALIGNMENT,
            "evidence": "Official create_dataset.py stores post-step observations alongside pre-step states/actions; audit_sim_parity confirms next-state alignment. Terminal observations without two future actions are excluded.",
        },
    )
    print("aligned", count)


if __name__ == "__main__":
    main()
