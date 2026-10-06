"""Compare candidate S0 retrieval using its own image and text embeddings."""

import sys, json, torch, mobileclip, numpy as np
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "offline"))
from common import ASSETS, PROJECT, normalize
from build_assets import views

Q = json.loads((PROJECT / "evaluation/queries.json").read_text())
torch.set_num_threads(4)
model, _, preprocess = mobileclip.create_model_and_transforms(
    "mobileclip_s0", pretrained=str(PROJECT / "artifacts/mobileclip_s0.pt")
)
tok = mobileclip.get_tokenizer("mobileclip_s0")
model.eval()
with torch.inference_mode():
    z = normalize(model.encode_text(tok([q["query"] for q in Q])).numpy())
cache = {}
for q in Q:
    if q["scene"] in cache:
        continue
    folder = ASSETS / "data" / q["scene"]
    meta = json.loads((folder / "manifest.json").read_text())
    regions = json.loads((folder / "regions.json").read_text())
    counts = np.fromfile(folder / "masks.bin", dtype="<u4")
    im = (
        Image.open(folder / "scene.webp")
        .convert("RGB")
        .resize((meta["maskWidth"], meta["maskHeight"]))
    )
    # The same resized image and SAM proposals used for the deployed candidate.
    vectors = []
    for r in regions:
        c = counts[r["rleOffset"] : r["rleOffset"] + r["rleLength"]]
        mask = (
            np.repeat(np.arange(len(c)) % 2, c)
            .reshape(meta["maskHeight"], meta["maskWidth"])
            .astype(bool)
        )
        with torch.inference_mode():
            v = model.encode_image(
                torch.stack([preprocess(c) for c in views(im, mask, r["bbox"])]),
                normalize=True,
            ).numpy()
        vectors.append(v)
    cache[q["scene"]] = np.array(vectors)
    print("S0 encoded", q["scene"], flush=True)
results = {}
for strategy in ["context", "isolated", "masked", "max", "weighted"]:
    ranks = []
    for i, q in enumerate(Q):
        scores = cache[q["scene"]] @ z[i]
        if strategy in ["context", "isolated", "masked"]:
            scores = scores[:, ["context", "isolated", "masked"].index(strategy)]
        elif strategy == "max":
            scores = scores.max(axis=1)
        else:
            scores = scores @ np.array([0.4, 0.4, 0.2])
        ids = np.argsort(-scores) + 1
        ranks.append(
            next(
                (n + 1 for n, r in enumerate(ids) if r in q["acceptableRegions"]),
                len(ids) + 1,
            )
        )
    summary = {}
    for split in ["selection", "holdout", "all"]:
        rs = [r for r, q in zip(ranks, Q) if split == "all" or q["split"] == split]
        summary[split] = dict(
            queries=len(rs),
            recallAt1=sum(r == 1 for r in rs) / len(rs),
            recallAt3=sum(r <= 3 for r in rs) / len(rs),
            MRR=sum(1 / r for r in rs) / len(rs),
        )
    results[strategy] = summary
(PROJECT / "evaluation/s0-retrieval-results.json").write_text(
    json.dumps(
        dict(model="MobileCLIP-S0", encoder="Python FP32", metrics=results), indent=2
    )
    + "\n"
)
print(json.dumps(results, indent=2))
