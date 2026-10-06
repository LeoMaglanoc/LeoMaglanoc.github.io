"""Switch matching image towers without rerunning or changing SAM proposals."""

import json, numpy as np, torch
from PIL import Image
from common import ASSETS, MODEL, CHECKPOINT_REVISION, load_model
from build_assets import views

model, preprocess, _ = load_model()
for p in sorted((ASSETS / "data").glob("*/manifest.json")):
    m = json.loads(p.read_text())
    im = Image.open(p.parent / "scene.webp").convert("RGB")
    small = im.copy()
    small.thumbnail((1024, 1024))
    assert small.size == (m["maskWidth"], m["maskHeight"])
    regions = json.loads((p.parent / "regions.json").read_text())
    counts = np.fromfile(p.parent / "masks.bin", dtype="<u4")
    vectors = []
    for r in regions:
        c = counts[r["rleOffset"] : r["rleOffset"] + r["rleLength"]]
        mask = (
            np.repeat(np.arange(len(c)) % 2, c)
            .reshape(m["maskHeight"], m["maskWidth"])
            .astype(bool)
        )
        with torch.inference_mode():
            v = model.encode_image(
                torch.stack([preprocess(c) for c in views(small, mask, r["bbox"])]),
                normalize=True,
            ).numpy()
        vectors.append(v)
    with torch.inference_mode():
        scene = model.encode_image(preprocess(im).unsqueeze(0), normalize=True).numpy()
    np.concatenate([scene, np.array(vectors).reshape(-1, m["embeddingDim"])]).astype(
        "<f4"
    ).tofile(p.parent / "embeddings.bin")
    m.update(
        model=MODEL,
        checkpoint="apple/MobileCLIP-S0",
        checkpointRevision=CHECKPOINT_REVISION,
    )
    p.write_text(json.dumps(m, indent=2) + "\n")
    print("Re-encoded", m["sceneId"], flush=True)
