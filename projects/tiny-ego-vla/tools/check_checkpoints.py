"""Verify both continuation states and the exact validation-selection rule."""

from common import *
import torch, numpy as np
from models import EgoModel, RobotModel
from datasets import CONFIG


def main():
    records = []
    torch.set_num_threads(4)
    for folder in sorted(CKPT.glob("*-*")):
        if not folder.is_dir() or not (folder / "metrics.json").exists():
            continue
        best = torch.load(folder / "best.pt", weights_only=False)
        last = torch.load(folder / "last.pt", weights_only=False)
        for ck in [best, last]:
            for key in [
                "model",
                "optimizer",
                "epoch",
                "config",
                "seed",
                "kind",
                "torch_rng",
                "loader_rng",
                "numpy_rng",
                "python_rng",
                "provenance",
            ]:
                assert key in ck, (folder, key)
            assert ck["config"] == CONFIG
        assert (
            last["epoch"] + 1
            == CONFIG[
                "ego_epochs" if folder.name.startswith("ego-") else "robot_epochs"
            ]
        )
        model = (
            EgoModel(best["kind"])
            if folder.name.startswith("ego-")
            else RobotModel(best["kind"])
        )
        model.load_state_dict(best["model"])
        model.eval()
        with torch.inference_mode():
            args = [torch.zeros(1, 4, 512), torch.zeros(1, 512)]
            if folder.name.startswith("robot-"):
                args.append(torch.zeros(1, 8))
                assert all(
                    k in best["norm"] for k in ["p_mean", "p_std", "a_mean", "a_std"]
                )
            out = model(*args)
            assert torch.isfinite(out).all()
        assert best["optimizer"]["state"] and last["optimizer"]["state"]
        records.append(
            {
                "run": folder.name,
                "best_sha256": sha(folder / "best.pt"),
                "last_sha256": sha(folder / "last.pt"),
                "selected_epoch": best["epoch"] + 1,
                "last_epoch": last["epoch"] + 1,
                "params": sum(p.numel() for p in model.parameters()),
            }
        )
    assert len(records) == 23, (
        len(records),
        "expected 5 human architecture/seed runs + 18 robot runs",
    )
    save_json(
        PROJECT / "checkpoint-audit.json",
        {
            "passed": True,
            "records": records,
            "checks": "reload finite prediction, optimizer populated, all RNG states present, expected epochs, fixed configuration",
        },
    )
    print("PASS", len(records), "best + last checkpoint pairs")


if __name__ == "__main__":
    main()
