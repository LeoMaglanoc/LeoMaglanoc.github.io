"""CPU-only cached-feature training, spatial evaluation and resumable fine-tuning."""

import argparse, hashlib, json, os, random, signal, time
from pathlib import Path
import numpy as np
import torch
from torch import nn
from PIL import Image
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "artifacts"
stop = False


def interrupt(*_):
    global stop
    stop = True


def atomic_save(value, path):
    tmp = path.with_suffix(".tmp")
    torch.save(value, tmp)
    tmp.replace(path)


def distance(a, b):
    a = np.radians(np.asarray(a))
    b = np.radians(np.asarray(b))
    d = b - a
    return (
        6371
        * 2
        * np.arcsin(
            np.sqrt(
                np.clip(
                    np.sin(d[..., 0] / 2) ** 2
                    + np.cos(a[..., 0])
                    * np.cos(b[..., 0])
                    * np.sin(d[..., 1] / 2) ** 2,
                    0,
                    1,
                )
            )
        )
    )


def tensor(path):
    # Explicit half-pixel bilinear resize without antialiasing, shared with JS.
    im = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255
    h, w = im.shape[:2]
    xx = np.clip((np.arange(224) + 0.5) * w / 224 - 0.5, 0, w - 1)
    yy = np.clip((np.arange(224) + 0.5) * h / 224 - 0.5, 0, h - 1)
    x0 = np.floor(xx).astype(int)
    y0 = np.floor(yy).astype(int)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    wx = (xx - x0).astype(np.float32)[None, :, None]
    wy = (yy - y0).astype(np.float32)[:, None, None]
    top = im[y0[:, None], x0[None, :]] * (1 - wx) + im[y0[:, None], x1[None, :]] * wx
    bottom = im[y1[:, None], x0[None, :]] * (1 - wx) + im[y1[:, None], x1[None, :]] * wx
    x = top * (1 - wy) + bottom * wy
    return torch.from_numpy(
        (
            (x - np.array([0.485, 0.456, 0.406], np.float32))
            / np.array([0.229, 0.224, 0.225], np.float32)
        )
        .transpose(2, 0, 1)
        .copy()
    )


class Model(nn.Module):
    def __init__(self, cells):
        super().__init__()
        base = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)
        self.encoder = nn.Sequential(base.features, base.avgpool, nn.Flatten(1))
        self.head = nn.Sequential(
            nn.Linear(576, 256), nn.ReLU(), nn.Dropout(0.25), nn.Linear(256, cells)
        )

    def forward(self, x):
        z = self.encoder(x)
        return z, self.head(z)


def cells(gps, k, seed):
    rng = np.random.default_rng(seed)
    scaled = gps * np.array([1, np.cos(np.deg2rad(53))])
    centers = scaled[rng.choice(len(gps), k, replace=False)]
    for _ in range(60):
        labels = ((scaled[:, None] - centers[None]) ** 2).sum(-1).argmin(1)
        new = np.stack(
            [
                scaled[labels == i].mean(0) if (labels == i).any() else centers[i]
                for i in range(k)
            ]
        )
        if np.allclose(new, centers):
            break
        centers = new
    return centers / np.array([1, np.cos(np.deg2rad(53))])


def metrics(pred, gps):
    d = distance(pred, gps)
    return {
        "n": len(d),
        "median_km": float(np.median(d)),
        "mean_km": float(d.mean()),
        "within_25km": float((d <= 25).mean()),
        "within_100km": float((d <= 100).mean()),
        "within_200km": float((d <= 200).mean()),
        "within_500km": float((d <= 500).mean()),
        "within_750km": float((d <= 750).mean()),
    }


def nearest(z, refs, gps, k, temperature=20):
    z = z / (np.linalg.norm(z, axis=1, keepdims=True) + 1e-8)
    refs = refs / (np.linalg.norm(refs, axis=1, keepdims=True) + 1e-8)
    sim = z @ refs.T
    idx = np.argsort(-sim, axis=1)[:, :k]
    if k == 1:
        return gps[idx[:, 0]]
    weights = np.exp(
        (np.take_along_axis(sim, idx, 1) - np.take_along_axis(sim, idx[:, :1], 1)) * temperature
    )
    weights /= weights.sum(1, keepdims=True)
    return (gps[idx] * weights[:, :, None]).sum(1)


def main():
    global OUT
    p = argparse.ArgumentParser()
    p.add_argument("--epochs", type=int, default=150)
    p.add_argument("--resume", action="store_true")
    p.add_argument("--finetune", action="store_true")
    p.add_argument("--threads", type=int, default=2)
    p.add_argument("--cells", type=int, default=48)
    p.add_argument("--export", action="store_true")
    p.add_argument("--teacher-cache", type=Path)
    p.add_argument("--kd-weight", type=float, default=0.2)
    p.add_argument("--run-dir", default=str(OUT))
    p.add_argument("--warm-start", type=Path)
    p.add_argument("--manifest", type=Path, default=DATA / "manifest.json")
    args = p.parse_args()
    OUT = Path(args.run_dir)
    torch.set_num_threads(args.threads)
    torch.manual_seed(42)
    np.random.seed(42)
    random.seed(42)
    OUT.mkdir(exist_ok=True)
    signal.signal(signal.SIGINT, interrupt)
    signal.signal(signal.SIGTERM, interrupt)
    rows = json.loads(args.manifest.read_text())
    rows = [r for r in rows if (DATA / "images" / f"{r['id']}.jpg").exists()]
    gps = np.array([[float(r["latitude"]), float(r["longitude"])] for r in rows])
    split = np.array([r["split"] for r in rows])
    tr = np.flatnonzero(split == "train")
    va = np.flatnonzero(split == "val")
    te = np.flatnonzero(split == "test")
    # Remove train images near validation/test images, even across block boundaries.
    held = np.concatenate([va, te])
    safe = np.ones(len(tr), bool)
    for start in range(0, len(tr), 256):
        safe[start : start + 256] = (
            distance(gps[tr[start : start + 256], None], gps[held][None]).min(1) >= 25
        )
    tr = tr[safe]
    if min(len(tr), len(va), len(te)) < 10:
        raise ValueError("Insufficient spatially separated data")
    fingerprint = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    checkpoint = OUT / "last.pt"
    resume = (
        torch.load(checkpoint, weights_only=False)
        if args.resume and checkpoint.exists()
        else None
    )
    if args.resume and resume is None:
        raise ValueError("No last.pt checkpoint exists for --resume")
    warm = torch.load(args.warm_start, weights_only=False) if args.warm_start else None
    if resume and warm:
        raise ValueError("Choose --resume or --warm-start")
    if resume and resume["manifest_sha256"] != fingerprint:
        raise ValueError(
            "Dataset changed: start a new run (retain existing checkpoint first)"
        )
    centers = (
        np.asarray((resume or warm)["centers"])
        if (resume or warm)
        else cells(gps[tr], min(args.cells, len(tr) // 10), 42)
    )
    labels = distance(gps[:, None], centers[None]).argmin(1)
    model = Model(len(centers))
    teacher_targets = None
    teacher_hash = None
    temperature = 2.0
    if args.teacher_cache:
        teacher_raw = args.teacher_cache.read_bytes()
        teacher_hash = hashlib.sha256(teacher_raw).hexdigest()
        teacher = json.loads(teacher_raw)
        if teacher["manifest_sha256"] != fingerprint or not np.allclose(
            teacher["centers"], centers
        ):
            raise ValueError("Teacher dataset/geocells mismatch")
        if not 0 <= args.kd_weight <= 1:
            raise ValueError("KD weight must be in [0,1]")
        if any(rows[i]["id"] not in teacher["probabilities"] for i in tr):
            raise ValueError("Teacher cache is incomplete for training IDs")
        teacher_targets = torch.zeros(len(rows), len(centers))
        temperature = float(teacher["temperature"])
        for i in tr:
            probs = np.asarray(teacher["probabilities"][rows[i]["id"]])
            if (
                probs.shape != (len(centers),)
                or not np.isfinite(probs).all()
                or np.any(probs < 0)
                or not np.isclose(probs.sum(), 1, atol=1e-4)
            ):
                raise ValueError("Invalid teacher probabilities")
            teacher_targets[i] = torch.from_numpy(probs.astype(np.float32))
    if resume and resume.get("teacher_cache_sha256") != teacher_hash:
        raise ValueError("Resume requires the same teacher cache")
    if resume or warm:
        model.load_state_dict((resume or warm)["model"])
    (OUT / "manifest.json").write_text(json.dumps(rows, indent=2))
    for param in model.encoder.parameters():
        param.requires_grad = False
    if args.finetune:
        for param in model.encoder[0][-1].parameters():
            param.requires_grad = True
    lr = 1e-4 if args.finetune else 1e-3
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=lr, weight_decay=0.01
    )
    same_stage = resume and resume["finetune"] == args.finetune
    if same_stage:
        optimizer.load_state_dict(resume["optimizer"])
        torch.set_rng_state(resume["torch_rng"])
        np.random.set_state(resume["numpy_rng"])
        random.setstate(resume["python_rng"])
    cache = OUT / "features.npz"
    model.eval()
    if cache.exists() and not args.finetune:
        saved = np.load(cache)
        if str(saved["fingerprint"]) != fingerprint:
            raise ValueError(
                "Stale feature cache: remove artifacts/features.npz for new data"
            )
        features = torch.from_numpy(saved["features"])
    else:
        vectors = []
        with torch.no_grad():
            for start in range(0, len(rows), 32):
                batch = torch.stack(
                    [
                        tensor(DATA / "images" / f"{r['id']}.jpg")
                        for r in rows[start : start + 32]
                    ]
                )
                vectors.append(model.encoder(batch))
                print("features", start + len(batch), "/", len(rows), flush=True)
        features = torch.cat(vectors)
        if not args.finetune:
            np.savez(cache, features=features.numpy(), fingerprint=fingerprint)
    y = torch.from_numpy(labels)
    best = resume["best_val_km"] if same_stage else float("inf")
    start_epoch = resume["epoch"] + 1 if same_stage else 0
    history = resume["history"] if same_stage else []
    weights = np.bincount(labels[tr], minlength=len(centers))
    weights = torch.tensor(1 / np.sqrt(np.maximum(weights, 1)), dtype=torch.float32)
    weights /= weights.mean()
    start_time = time.time()
    for epoch in range(start_epoch, start_epoch + args.epochs):
        model.eval()
        model.head.train()  # Frozen BN stays frozen even during partial fine-tuning.
        losses = []
        for ids in torch.randperm(len(tr)).split(64 if not args.finetune else 16):
            indices = tr[ids.numpy()]
            optimizer.zero_grad()
            if args.finetune:
                x = torch.stack(
                    [tensor(DATA / "images" / f"{rows[i]['id']}.jpg") for i in indices]
                )
                _, logits = model(x)
            else:
                logits = model.head(features[indices])
            loss = nn.functional.cross_entropy(
                logits, y[indices], weight=weights, label_smoothing=0.1
            )
            if teacher_targets is not None:
                kd = (
                    nn.functional.kl_div(
                        nn.functional.log_softmax(logits / temperature, dim=1),
                        teacher_targets[indices],
                        reduction="batchmean",
                    )
                    * temperature**2
                )
                loss = (1 - args.kd_weight) * loss + args.kd_weight * kd
            loss.backward()
            optimizer.step()
            losses.append(loss.item())
        model.eval()
        with torch.no_grad():
            if args.finetune:
                vf = torch.cat(
                    [
                        model.encoder(
                            torch.stack(
                                [
                                    tensor(DATA / "images" / f"{rows[i]['id']}.jpg")
                                    for i in va[s : s + 32]
                                ]
                            )
                        )
                        for s in range(0, len(va), 32)
                    ]
                )
            else:
                vf = features[va]
            pred = centers[model.head(vf).argmax(1).numpy()]
        val = metrics(pred, gps[va])
        entry = {
            "epoch": epoch,
            "loss": float(np.mean(losses)),
            "val": val,
            "elapsed_seconds": time.time() - start_time,
        }
        history.append(entry)
        improved = val["median_km"] < best
        if improved:
            best = val["median_km"]
        state = {
            "format_version": 1,
            "teacher_cache_sha256": teacher_hash,
            "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "environment": {"torch": torch.__version__, "numpy": np.__version__},
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "epoch": epoch,
            "finetune": args.finetune,
            "best_val_km": best,
            "centers": centers,
            "manifest_sha256": fingerprint,
            "torch_rng": torch.get_rng_state(),
            "numpy_rng": np.random.get_state(),
            "python_rng": random.getstate(),
            "history": history,
            "train_ids": [rows[i]["id"] for i in tr],
            "val_ids": [rows[i]["id"] for i in va],
            "test_ids": [rows[i]["id"] for i in te],
            "arguments": vars(args),
        }
        atomic_save(state, checkpoint)
        if improved:
            atomic_save(state, OUT / "best.pt")
        if epoch % 10 == 0 or stop:
            print(json.dumps(entry), flush=True)
        if stop:
            print("Stopped at epoch boundary; last.pt is resumable", flush=True)
            return
    if not args.export:
        return
    model.load_state_dict(torch.load(OUT / "best.pt", weights_only=False)["model"])
    model.eval()
    if args.finetune:
        with torch.no_grad():
            features = torch.cat(
                [
                    model.encoder(
                        torch.stack(
                            [
                                tensor(DATA / "images" / f"{r['id']}.jpg")
                                for r in rows[s : s + 32]
                            ]
                        )
                    )
                    for s in range(0, len(rows), 32)
                ]
            )
    f = features.numpy()
    candidates = {}
    with torch.no_grad():
        headpred = centers[model.head(features).argmax(1).numpy()]
    candidates["head"] = {
        "val": metrics(headpred[va], gps[va]),
        "test": metrics(headpred[te], gps[te]),
    }
    for k in [1, 5, 10]:
        candidates[f"retrieval-{k}"] = {
            "val": metrics(nearest(f[va], f[tr], gps[tr], k), gps[va]),
            "test": metrics(nearest(f[te], f[tr], gps[tr], k), gps[te]),
        }
    # Selection only sees validation; test results never determine model choice.
    winner = min(candidates, key=lambda name: candidates[name]["val"]["median_km"])
    baseline = np.median(gps[tr], axis=0)
    candidates["constant-center"] = {
        "val": metrics(np.tile(baseline, (len(va), 1)), gps[va]),
        "test": metrics(np.tile(baseline, (len(te), 1)), gps[te]),
    }
    models = ROOT / "models"
    models.mkdir(exist_ok=True)
    dummy = torch.zeros(1, 3, 224, 224)
    torch.onnx.export(
        model,
        dummy,
        models / "model.onnx",
        input_names=["image"],
        output_names=["embedding", "logits"],
        opset_version=17,
    )
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    sess = ort.InferenceSession(
        str(models / "model.onnx"),
        sess_options=opts,
        providers=["CPUExecutionProvider"],
    )
    sample = tensor(DATA / "images" / f"{rows[te[0]]['id']}.jpg").unsqueeze(0)
    pt = model(sample)
    onnxout = sess.run(None, {"image": sample.numpy()})
    parity = max(
        float(np.max(np.abs(a.detach().numpy() - b))) for a, b in zip(pt, onnxout)
    )
    if parity > 1e-4:
        raise ValueError(f"ONNX parity failure {parity}")
    refs = f[tr] / (np.linalg.norm(f[tr], axis=1, keepdims=True) + 1e-8)
    refs.astype("<f4").tofile(models / "references.f32")
    (models / "references.json").write_text(
        json.dumps(
            {
                "feature_file": "references.f32",
                "count": len(tr),
                "dimensions": 576,
                "gps": gps[tr].tolist(),
            },
            separators=(",", ":"),
        )
    )
    metadata = {
        "version": f"europe-v1-{'refined' if args.finetune else 'bootstrap'}",
        "architecture": "ImageNet MobileNetV3-Small + trained geographic head",
        "parameters": sum(p.numel() for p in model.parameters()),
        "input": {
            "shape": [1, 3, 224, 224],
            "resize": "stretch, half-pixel bilinear, no antialiasing",
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
        },
        "method": winner,
        "centers": centers.tolist(),
        "manifest_sha256": fingerprint,
        "splits": {
            "train": len(tr),
            "val": len(va),
            "test": len(te),
            "minimum_train_holdout_distance_km": 25,
            "validation_block_degrees": 3,
        },
        "candidates": candidates,
        "onnx_max_absolute_error": parity,
        "training": (
            "CPU, ImageNet encoder with last block fine-tuned, supervised geographic head"
            if args.finetune
            else "CPU, frozen ImageNet encoder, supervised geographic head"
        ),
        "distillation": {
            "enabled": teacher_targets is not None,
            "teacher_cache_sha256": teacher_hash,
            "kd_weight": args.kd_weight if teacher_targets is not None else 0,
        },
        "human_benchmark": "Not yet measured",
        "precision": "FP32",
    }
    (models / "metadata.json").write_text(json.dumps(metadata, indent=2))
    (OUT / "metrics.json").write_text(json.dumps(metadata, indent=2))
    # Fixed, uncurated test sample; image filenames do not expose country.
    pack = []
    for index, i in enumerate(te[:40]):
        r = rows[i]
        dest = ROOT / "images" / f"round-{index:03d}.jpg"
        dest.write_bytes((DATA / "images" / f"{r['id']}.jpg").read_bytes())
        pack.append(
            {
                "image": dest.relative_to(ROOT).as_posix(),
                "id": r["id"],
                "lat": float(r["latitude"]),
                "lon": float(r["longitude"]),
                "country": r["country"],
                "creator": r["creator_username"],
                "source": f"https://www.mapillary.com/app/?pKey={r['id']}&focus=photo",
                "license": "CC BY-SA 4.0",
                "modified": "resized to maximum 640 px; JPEG recompressed",
                "split": "test",
            }
        )
    (ROOT / "rounds.json").write_text(json.dumps(pack, indent=2))
    (models / "fixture.json").write_text(
        json.dumps(
            {
                "image": pack[0]["image"],
                "embedding": onnxout[0][0].tolist(),
                "logits": onnxout[1][0].tolist(),
                "expected_method": winner,
            },
            indent=2,
        )
    )
    print(json.dumps(metadata, indent=2), flush=True)


if __name__ == "__main__":
    main()
