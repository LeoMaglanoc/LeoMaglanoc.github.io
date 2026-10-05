"""Make a small, tracked continuation bundle; never publish training data to the game."""

import argparse, hashlib, json, shutil
from pathlib import Path
import torch, numpy as np

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument("--run-dir", type=Path, default=ROOT / "artifacts/refined")
args = p.parse_args()
dest = ROOT / "checkpoints/current"
dest.mkdir(parents=True, exist_ok=True)
for name in ["last.pt", "best.pt", "manifest.json"]:
    shutil.copy2(args.run_dir / name, dest / name)
shutil.copy2(ROOT / "data/dataset-revision.json", dest / "dataset-revision.json")
state = torch.load(dest / "last.pt", weights_only=False)
rows = json.loads((dest / "manifest.json").read_text())
image_hashes = {
    r["id"]: hashlib.sha256(
        (ROOT / "data/images" / f"{r['id']}.jpg").read_bytes()
    ).hexdigest()
    for r in rows
}
(dest / "image-sha256.json").write_text(json.dumps(image_hashes, indent=2))
files = {
    p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
    for p in list((ROOT / "training").glob("*.py"))
    + list((ROOT / "src").glob("*.js"))
    + list((ROOT / "models").glob("*"))
    + list(dest.glob("*"))
    if p.is_file() and p.name != "bundle.json"
}
bundle = {
    "format_version": 1,
    "last_epoch": state["epoch"],
    "last_stage": "partial_finetuning" if state["finetune"] else "frozen_encoder",
    "best_validation_head_median_km": state["best_val_km"],
    "manifest_sha256": state["manifest_sha256"],
    "environment": {"torch": torch.__version__, "numpy": np.__version__},
    "sha256": files,
    "includes": [
        "best and latest model states",
        "optimizer state",
        "Python, NumPy and PyTorch RNG states",
        "stable train/val/test IDs",
        "geocell centers",
        "data manifest and upstream revision",
        "training history and arguments",
    ],
    "local_dependencies": "Image files remain in data/images; reconstruct selected images using restore_data.py on a fresh clone.",
}
(dest / "bundle.json").write_text(json.dumps(bundle, indent=2))
print("Saved", dest)
