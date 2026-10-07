from common import *
import random, copy, torch, numpy as np
from torch.utils.data import DataLoader
from models import EgoModel, count_params
from datasets import EgoDataset, CONFIG


def loss_fn(pred, target, mask):
    reg = (
        torch.nn.functional.smooth_l1_loss(pred[:, :4], target[:, :4], reduction="none")
        * mask[:, :4]
    )
    contact = (
        torch.nn.functional.binary_cross_entropy_with_logits(
            pred[:, 4], target[:, 4], reduction="none"
        )
        * mask[:, 4]
    )
    return reg.sum() / mask[:, :4].sum().clamp(min=1) + 0.2 * contact.sum() / mask[
        :, 4
    ].sum().clamp(min=1)


def run(kind, seed, resume=False):
    torch.set_num_threads(4)
    torch.manual_seed(seed)
    np.random.seed(seed)
    random.seed(seed)
    train = EgoDataset("train")
    val = EgoDataset("validation")
    gen = torch.Generator().manual_seed(seed)
    loader = DataLoader(train, batch_size=128, shuffle=True, generator=gen)
    valid = DataLoader(val, batch_size=256)
    model = EgoModel(kind)
    opt = torch.optim.AdamW(
        model.parameters(), lr=CONFIG["learning_rate"], weight_decay=0.01
    )
    run_dir = CKPT / f"ego-{kind}-{seed}"
    run_dir.mkdir(exist_ok=True)
    best = float("inf")
    curve = []
    start = 0
    t0 = time.perf_counter()
    provenance = run_provenance()
    if resume and (run_dir / "last.pt").exists():
        ck = torch.load(run_dir / "last.pt", weights_only=False)
        provenance = ck["provenance"]
        assert ck["config"] == CONFIG, (
            "Configuration changed: create a new experiment instead of resuming"
        )
        model.load_state_dict(ck["model"])
        opt.load_state_dict(ck["optimizer"])
        start = ck["epoch"] + 1
        best = ck["best_loss"]
        curve = ck["curve"]
        torch.set_rng_state(ck["torch_rng"])
        gen.set_state(ck["loader_rng"])
        np.random.set_state(ck["numpy_rng"])
        random.setstate(ck["python_rng"])
    for epoch in range(start, CONFIG["ego_epochs"]):
        model.train()
        total = 0
        for v, l, y, m in loader:
            opt.zero_grad()
            loss = loss_fn(model(v, l), y, m)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1)
            opt.step()
            total += float(loss) * len(v)
        model.eval()
        vl = 0
        with torch.inference_mode():
            for v, l, y, m in valid:
                vl += float(loss_fn(model(v, l), y, m)) * len(v)
        vl /= len(val)
        curve.append(
            {
                "epoch": epoch + 1,
                "train_loss": total / len(train),
                "validation_loss": vl,
            }
        )
        ck = {
            "model": model.state_dict(),
            "optimizer": opt.state_dict(),
            "epoch": epoch,
            "best_loss": min(vl, best),
            "curve": curve,
            "config": CONFIG,
            "provenance": provenance,
            "kind": kind,
            "seed": seed,
            "torch_rng": torch.get_rng_state(),
            "loader_rng": gen.get_state(),
            "numpy_rng": np.random.get_state(),
            "python_rng": random.getstate(),
            "git_commit": revision(),
            "encoder_sha256": "809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7",
        }
        if vl < best:
            best = vl
            torch.save(ck, run_dir / "best.pt")
        torch.save(ck, run_dir / "last.pt")
        if epoch % 10 == 0:
            print(kind, seed, epoch, round(vl, 5), flush=True)
    ck = torch.load(run_dir / "best.pt", weights_only=False)
    model.load_state_dict(ck["model"])
    model.eval()
    examples = []
    with torch.inference_mode():
        for i in np.linspace(0, len(val) - 1, min(80, len(val))).astype(int):
            v, l, y, m = val[i]
            pred = model(v[None], l[None])[0].numpy()
            row = val.rows[i]
            examples.append(
                {
                    "video": row[4],
                    "frame": int(row[5]),
                    "target": y.numpy().tolist(),
                    "predicted": pred.tolist(),
                    "mask": m.numpy().tolist(),
                }
            )
    stats = {
        "provenance": provenance,
        "kind": kind,
        "seed": seed,
        "params": count_params(model),
        "train_samples": len(train),
        "validation_samples": len(val),
        "best_validation_loss": best,
        "selected_epoch": ck["epoch"] + 1,
        "seconds": time.perf_counter() - t0,
        "curve": curve,
        "examples": examples,
    }
    save_json(run_dir / "metrics.json", stats)
    print("DONE", kind, seed, best, stats["seconds"], flush=True)
    return stats


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--kind", choices=["mlp", "gru", "transformer"])
    p.add_argument("--seed", type=int, default=11)
    p.add_argument("--resume", action="store_true")
    args = p.parse_args()
    if args.kind:
        run(args.kind, args.seed, args.resume)
    else:
        results = [run(k, 11, args.resume) for k in ["mlp", "gru", "transformer"]]
        selected = min(results, key=lambda r: r["best_validation_loss"])["kind"]
        save_json(
            ART / "architecture-selection.json",
            {
                "selected": selected,
                "criterion": "lowest held-out human-video validation loss; no robot evaluation used",
                "candidates": [
                    {k: v for k, v in r.items() if k not in ("curve", "examples")}
                    for r in results
                ],
            },
        )
        for seed in CONFIG["seeds"][1:]:
            run(selected, seed, args.resume)
