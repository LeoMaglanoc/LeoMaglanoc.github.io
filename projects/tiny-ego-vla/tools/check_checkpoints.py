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
            assert ck["provenance"]["data_manifest_sha256"] == sha(
                PROJECT / "data-manifest.json"
            )
            assert ck["provenance"]["environment_lock_sha256"] == sha(
                PROJECT / "environment-lock.txt"
            )
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
        metrics = json.loads((folder / "metrics.json").read_text())
        key = "validation_loss" if folder.name.startswith("ego-") else "validation_mse"
        metric_key = (
            "best_validation_loss"
            if folder.name.startswith("ego-")
            else "best_validation_mse"
        )
        selected_epoch = (
            min(range(len(metrics["curve"])), key=lambda i: metrics["curve"][i][key])
            + 1
        )
        assert best["epoch"] + 1 == selected_epoch == metrics["selected_epoch"]
        assert (
            best["best_loss"]
            == metrics[metric_key]
            == metrics["curve"][selected_epoch - 1][key]
        )
        assert last["curve"] == metrics["curve"]
        assert best["optimizer"]["state"] and last["optimizer"]["state"]
        model.load_state_dict(last["model"])
        optimizer = torch.optim.AdamW(model.parameters(), lr=CONFIG["learning_rate"])
        optimizer.load_state_dict(last["optimizer"])
        for state in optimizer.state.values():
            for value in state.values():
                if isinstance(value, torch.Tensor):
                    assert torch.isfinite(value).all()
        torch.Generator().set_state(last["loader_rng"])
        torch.Generator().set_state(last["torch_rng"])
        with torch.inference_mode():
            assert torch.isfinite(model(*args)).all()
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
            "checks": "best and last model reload with finite predictions, optimizer reload and finite states, RNG generators reload, exact validation minimum and first-minimum epoch, full curve equality, expected epochs, fixed configuration",
        },
    )
    print("PASS", len(records), "best + last checkpoint pairs")


if __name__ == "__main__":
    main()
