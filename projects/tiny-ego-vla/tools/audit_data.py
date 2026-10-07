"""Scientific integrity checks on cached data and split boundaries."""

from common import *
import numpy as np, torch
from datasets import CONFIG, EgoDataset, RobotDataset
from models import RobotModel, EgoModel, count_params


def main():
    splits = CONFIG["robot_split"]
    sets = {k: set(range(*v)) for k, v in splits.items()}
    assert sets["train"].isdisjoint(sets["validation"]) and sets["test"].isdisjoint(
        sets["train"] | sets["validation"]
    )
    assert set(CONFIG["ego_sources"]["train"]).isdisjoint(
        CONFIG["ego_sources"]["validation"]
    )
    assert {42 + i for i in CONFIG["evaluation_initializations"]} <= sets["test"]
    arrays = []
    for p in sorted(DATA.glob("*_demo_*.npz")) + sorted(DATA.glob("*_embeddings.npz")):
        d = np.load(p)
        z = d["visual"]
        assert np.isfinite(z).all()
        assert np.allclose(np.linalg.norm(z, axis=1), 1, atol=1e-5)
        assert z.shape[1] == 512
        if "actions" in d:
            assert (
                str(d["action_alignment"]) == "post_action_obs_predict_next_two_actions"
            )
            assert d["actions"].shape == (len(z), 2, 7)
            assert d["proprio"].shape == (len(z), 8)
            assert np.isfinite(d["actions"]).all() and np.isfinite(d["proprio"]).all()
        arrays.append({"file": p.name, "frames": len(z), "sha256": sha(p)})
    assert len(list(DATA.glob("*_demo_*.npz"))) == 100
    ego = {}
    for split in ["train", "validation"]:
        d = EgoDataset(split)
        assert len(d) > 0
        ego[split] = {
            "windows": len(d),
            "wrist_labels": sum(bool(r[3][0]) for r in d.rows),
            "object_labels": sum(bool(r[3][2]) for r in d.rows),
            "contact_labels": sum(bool(r[3][4]) for r in d.rows),
        }
    for budget in CONFIG["budgets"]:
        d = RobotDataset("train", budget)
        actual = {r[5] for r in d.rows}
        assert actual == set(range(budget))
        v = RobotDataset("validation", norm=d.norm)
        assert v.norm is d.norm
        assert d.norm["a_mean"].shape == (14,) and d.norm["p_mean"].shape == (8,)
        assert np.all(d.norm["p_std"] >= 0.01)
    torch.set_num_threads(4)
    params = {}
    for kind in ["mlp", "gru", "transformer"]:
        torch.manual_seed(11)
        baseline = RobotModel(kind)
        torch.manual_seed(11)
        transfer = RobotModel(kind)
        assert all(
            torch.equal(x, y)
            for x, y in zip(baseline.head.parameters(), transfer.head.parameters())
        )
        # Replacing the trunk cannot change the paired head's initial weights.
        transfer.trunk.load_state_dict(EgoModel(kind).trunk.state_dict())
        assert all(
            torch.equal(x, y)
            for x, y in zip(baseline.head.parameters(), transfer.head.parameters())
        )
        output = baseline(
            torch.zeros(2, 4, 512), torch.zeros(2, 512), torch.zeros(2, 8)
        )
        assert output.shape == (2, 14) and torch.isfinite(output).all()
        params[kind] = {
            "ego": count_params(EgoModel(kind)),
            "robot": count_params(baseline),
        }
        assert params[kind]["robot"] < 1_000_000
    report = {
        "passed": True,
        "split_checks": "episode/source disjoint; rollout starts in test only",
        "ego": ego,
        "architecture_params": params,
        "cached_arrays": arrays,
        "paired_action_head_initialization": "exact tensor match",
        "normalization": "training-budget-only; validation/test reuse identical statistics",
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    save_json(PROJECT / "integrity-report.json", report)
    print(
        json.dumps({k: v for k, v in report.items() if k != "cached_arrays"}, indent=2)
    )


if __name__ == "__main__":
    main()
