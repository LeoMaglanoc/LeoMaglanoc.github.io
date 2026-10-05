"""Optional GeoCLIP CPU teacher: compute each training image once, resume safely.
Install the optional dependency separately. No teacher runs in the browser.
"""

import argparse, hashlib, json, signal
from pathlib import Path
import numpy as np
import torch
from PIL import Image
from train import ROOT, DATA

p = argparse.ArgumentParser()
p.add_argument("--checkpoint", type=Path, default=ROOT / "checkpoints/current/best.pt")
p.add_argument(
    "--manifest", type=Path, default=ROOT / "checkpoints/current/manifest.json"
)
p.add_argument("--output", type=Path, default=ROOT / "artifacts/teacher.json")
p.add_argument("--threads", type=int, default=2)
args = p.parse_args()
torch.set_num_threads(args.threads)
state = torch.load(args.checkpoint, weights_only=False)
centers = np.asarray(state["centers"])
rows = json.loads(args.manifest.read_text())
fingerprint = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
if fingerprint != state["manifest_sha256"]:
    raise ValueError("Checkpoint and manifest differ")
cache = (
    json.loads(args.output.read_text())
    if args.output.exists()
    else {
        "teacher": "GeoCLIP",
        "temperature": 2,
        "manifest_sha256": fingerprint,
        "centers": centers.tolist(),
        "probabilities": {},
    }
)
if cache["manifest_sha256"] != fingerprint or not np.allclose(
    cache["centers"], centers
):
    raise ValueError("Teacher cache is for a different dataset or geocell grid")
from geoclip import GeoCLIP

teacher = GeoCLIP().cpu().eval()
stop = False


def finish(*_):
    global stop
    stop = True


signal.signal(signal.SIGINT, finish)
signal.signal(signal.SIGTERM, finish)
args.output.parent.mkdir(parents=True, exist_ok=True)


def save():
    tmp = args.output.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache))
    tmp.replace(args.output)


with torch.no_grad():
    # Cache location features once, instead of recomputing a worldwide gallery.
    location = teacher.location_encoder(torch.tensor(centers, dtype=torch.float32))
    location = torch.nn.functional.normalize(location, dim=1)
    wanted = set(state["train_ids"])
    selected = [r for r in rows if r["id"] in wanted]
    for i, row in enumerate(selected):
        if row["id"] in cache["probabilities"]:
            continue
        with Image.open(DATA / "images" / f"{row['id']}.jpg") as image:
            x = teacher.image_encoder.preprocess_image(image.convert("RGB")).cpu()
        z = torch.nn.functional.normalize(teacher.image_encoder(x), dim=1)
        logits = teacher.logit_scale.exp() * (z @ location.T)
        probs = (logits / 2).softmax(-1)[0].numpy()
        cache["probabilities"][row["id"]] = probs.tolist()
        save()
        print(
            "Teacher cached",
            len(cache["probabilities"]),
            "/",
            len(selected),
            flush=True,
        )
        if stop:
            print("Saved. Rerun the same command to continue.", flush=True)
            break
