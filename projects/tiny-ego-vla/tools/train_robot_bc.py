"""Paired BC comparisons: identical data, optimizer budgets and action heads.
Only the shared trunk initialization differs. No evaluation states select weights.
"""

from common import *
import random, torch, numpy as np
from torch.utils.data import DataLoader
from models import RobotModel, count_params
from datasets import RobotDataset, CONFIG


def run(kind, seed, budget, regime, resume=False):
    torch.set_num_threads(4)
    torch.manual_seed(seed)
    np.random.seed(seed)
    random.seed(seed)
    train = RobotDataset("train", budget)
    val = RobotDataset("validation", norm=train.norm)
    gen = torch.Generator().manual_seed(seed)
    loader = DataLoader(train, batch_size=128, shuffle=True, generator=gen)
    valid = DataLoader(val, batch_size=256)
    model = RobotModel(kind)
    if regime == "ego":
        ck = torch.load(CKPT / f"ego-{kind}-{seed}/best.pt", weights_only=False)
        model.trunk.load_state_dict(
            {
                k.removeprefix("trunk."): v
                for k, v in ck["model"].items()
                if k.startswith("trunk.")
            }
        )
    opt = torch.optim.AdamW(
        model.parameters(), lr=CONFIG["learning_rate"], weight_decay=0.01
    )
    run_dir = CKPT / f"robot-{regime}-{budget}-{seed}"
    run_dir.mkdir(exist_ok=True)
    best = float("inf")
    curve = []
    start = 0
    t0 = time.perf_counter()
    prior_seconds = 0.0
    seconds_scope = "full training run"
    provenance = run_provenance()
    if resume and (run_dir / "last.pt").exists():
        ck = torch.load(run_dir / "last.pt", weights_only=False)
        provenance = ck["provenance"]
        assert ck["config"] == CONFIG, (
            "Configuration changed: create a new experiment instead of resuming"
        )
        if (
            ck["epoch"] + 1 >= CONFIG["robot_epochs"]
            and (run_dir / "metrics.json").exists()
        ):
            print("COMPLETE (unchanged)", run_dir.name, flush=True)
            return json.loads((run_dir / "metrics.json").read_text())
        model.load_state_dict(ck["model"])
        opt.load_state_dict(ck["optimizer"])
        prior_seconds = ck.get("elapsed_seconds", 0.0)
        seconds_scope = ck.get(
            "seconds_scope", "resumed segment; earlier elapsed not recorded"
        )
        start = ck["epoch"] + 1
        best = ck["best_loss"]
        curve = ck["curve"]
        torch.set_rng_state(ck["torch_rng"])
        gen.set_state(ck["loader_rng"])
        np.random.set_state(ck["numpy_rng"])
        random.setstate(ck["python_rng"])
    for epoch in range(start, CONFIG["robot_epochs"]):
        model.train()
        total = 0
        for v, l, p, y in loader:
            opt.zero_grad()
            loss = torch.nn.functional.mse_loss(model(v, l, p), y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1)
            opt.step()
            total += float(loss) * len(v)
        model.eval()
        vl = 0
        with torch.inference_mode():
            for v, l, p, y in valid:
                vl += float(torch.nn.functional.mse_loss(model(v, l, p), y)) * len(v)
        vl /= len(val)
        curve.append(
            {"epoch": epoch + 1, "train_mse": total / len(train), "validation_mse": vl}
        )
        ck = {
            "elapsed_seconds": prior_seconds + time.perf_counter() - t0,
            "seconds_scope": seconds_scope,
            "model": model.state_dict(),
            "optimizer": opt.state_dict(),
            "epoch": epoch,
            "best_loss": min(best, vl),
            "curve": curve,
            "config": CONFIG,
            "provenance": provenance,
            "norm": train.norm,
            "seed": seed,
            "kind": kind,
            "regime": regime,
            "budget": budget,
            "torch_rng": torch.get_rng_state(),
            "loader_rng": gen.get_state(),
            "numpy_rng": np.random.get_state(),
            "python_rng": random.getstate(),
            "git_commit": revision(),
        }
        if vl < best:
            best = vl
            torch.save(ck, run_dir / "best.pt")
        torch.save(ck, run_dir / "last.pt")
        if epoch % 20 == 0:
            print(regime, budget, seed, epoch, round(vl, 5), flush=True)
    best_ck = torch.load(run_dir / "best.pt", weights_only=False)
    model.load_state_dict(best_ck["model"])
    model.eval()
    test = RobotDataset("test", norm=train.norm)
    tl = DataLoader(test, batch_size=256)
    test_loss = 0
    with torch.inference_mode():
        for v, l, p, y in tl:
            test_loss += float(torch.nn.functional.mse_loss(model(v, l, p), y)) * len(v)
    metrics = {
        "provenance": provenance,
        "regime": regime,
        "budget_per_task": budget,
        "fraction_of_training_pool": budget / 35,
        "seed": seed,
        "kind": kind,
        "params": count_params(model),
        "train_samples": len(train),
        "validation_samples": len(val),
        "test_samples": len(test),
        "best_validation_mse": best,
        "test_mse": test_loss / len(test),
        "selected_epoch": best_ck["epoch"] + 1,
        "seconds": prior_seconds + time.perf_counter() - t0,
        "seconds_scope": seconds_scope,
        "curve": curve,
        "checkpoint_sha256": sha(run_dir / "best.pt"),
    }
    save_json(run_dir / "metrics.json", metrics)
    print("DONE", regime, budget, seed, best, metrics["seconds"], flush=True)


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--resume", action="store_true")
    p.add_argument("--budget", type=int, nargs="+")
    p.add_argument("--seed", type=int, nargs="+")
    args = p.parse_args()
    kind = json.loads((ART / "architecture-selection.json").read_text())["selected"]
    for budget in args.budget or CONFIG["budgets"]:
        for seed in args.seed or CONFIG["seeds"]:
            for regime in ["robot", "ego"]:
                run(kind, seed, budget, regime, args.resume)
