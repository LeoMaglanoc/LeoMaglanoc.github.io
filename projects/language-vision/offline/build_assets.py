"""SAM 2.1 proposals -> deterministic cleanup -> 3 MobileCLIP views -> binary assets."""

import argparse, json, time
import numpy as np, torch
from PIL import Image, ImageDraw
from sam2.build_sam import build_sam2
from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
from common import (
    ROOT,
    PROJECT,
    ASSETS,
    MODEL,
    CHECKPOINT_REVISION,
    load_model,
    normalize,
)


def clean_masks(proposals):
    candidates = sorted(
        [m for m in proposals if 0.002 <= m["area"] / m["segmentation"].size <= 0.70],
        key=lambda m: (-m["predicted_iou"] * m["stability_score"], -m["area"]),
    )
    kept = []
    for m in candidates:
        duplicate = False
        for k in kept:
            a, b = m["bbox"], k["bbox"]
            if min(a[0] + a[2], b[0] + b[2]) <= max(a[0], b[0]) or min(
                a[1] + a[3], b[1] + b[3]
            ) <= max(a[1], b[1]):
                continue
            inter = np.count_nonzero(m["segmentation"] & k["segmentation"])
            union = m["area"] + k["area"] - inter
            # Keep meaningful nested regions; remove almost-identical masks only.
            if inter / union > 0.85 or (
                inter / min(m["area"], k["area"]) > 0.97
                and min(m["area"], k["area"]) / max(m["area"], k["area"]) > 0.85
            ):
                duplicate = True
                break
        if not duplicate:
            kept.append(m)
        if len(kept) >= 60:
            break
    return sorted(kept, key=lambda m: (m["bbox"][1], m["bbox"][0]))


def rle(mask):
    flat = mask.ravel()
    changes = np.flatnonzero(flat[1:] != flat[:-1]) + 1
    counts = np.diff(np.r_[0, changes, len(flat)]).astype(np.uint32)
    if flat[0]:
        counts = np.r_[np.uint32(0), counts]
    return counts


def views(im, mask, bbox):
    x, y, w, h = bbox
    px = int(w * 0.15)
    py = int(h * 0.15)
    box = (
        max(0, x - px),
        max(0, y - py),
        min(im.width, x + w + px + 1),
        min(im.height, y + h + py + 1),
    )
    crop = np.asarray(im.crop(box))
    m = mask[box[1] : box[3], box[0] : box[2], None]
    isolated = np.where(m, crop, 128).astype("uint8")
    masked = np.where(m, crop, (crop * 0.25 + 128 * 0.75)).astype("uint8")
    return [Image.fromarray(crop), Image.fromarray(isolated), Image.fromarray(masked)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene")
    ap.add_argument("--points", type=int, default=20)
    args = ap.parse_args()
    model, preprocess, _ = load_model()
    sam = build_sam2(
        "configs/sam2.1/sam2.1_hiera_t.yaml",
        str(PROJECT / "artifacts/sam2.1_hiera_tiny.pt"),
        device="cpu",
        apply_postprocessing=False,
    )
    generator = SAM2AutomaticMaskGenerator(
        sam,
        points_per_side=args.points,
        points_per_batch=32,
        pred_iou_thresh=0.75,
        stability_score_thresh=0.88,
        output_mode="binary_mask",
        min_mask_region_area=0,
    )
    catalog = json.loads((ASSETS / "data/scenes.json").read_text())
    for s in catalog:
        if args.scene and args.scene != s["id"]:
            continue
        folder = ASSETS / "data" / s["id"]
        if (folder / "manifest.json").exists():
            print("Already built", s["id"], flush=True)
            continue
        im = Image.open(folder / "scene.webp").convert("RGB")
        # Exact stored masks at a maximum of 1024 px; original photograph stays 1800 px.
        small = im.copy()
        small.thumbnail((1024, 1024))
        print("Segmenting", s["id"], small.size, flush=True)
        start = time.time()
        with torch.inference_mode():
            masks = clean_masks(generator.generate(np.asarray(small)))
        print("Masks", len(masks), "seconds", time.time() - start, flush=True)
        regions = []
        counts = []
        vectors = []
        offset = 0
        debug = small.copy()
        draw = ImageDraw.Draw(debug)
        for n, m in enumerate(masks):
            x, y, w, h = map(int, m["bbox"])
            mask = m["segmentation"]
            images = views(small, mask, (x, y, w, h))
            with torch.inference_mode():
                v = model.encode_image(
                    torch.stack([preprocess(c) for c in images]), normalize=True
                ).numpy()
            vectors.append(v)
            c = rle(mask)
            counts.append(c)
            regions.append(
                dict(
                    id=n + 1,
                    bbox=[x, y, w, h],
                    pixelArea=int(m["area"]),
                    areaFraction=m["area"] / mask.size,
                    predictedIoU=float(m["predicted_iou"]),
                    stabilityScore=float(m["stability_score"]),
                    rleOffset=offset,
                    rleLength=len(c),
                )
            )
            offset += len(c)
            draw.rectangle((x, y, x + w, y + h), outline="cyan")
            draw.text(
                (x, y), str(n + 1), fill="red", stroke_width=1, stroke_fill="white"
            )
        with torch.inference_mode():
            scene = model.encode_image(
                preprocess(im).unsqueeze(0), normalize=True
            ).numpy()
        embeddings = np.concatenate(
            [scene, np.array(vectors).reshape(-1, scene.shape[-1])]
        ).astype("<f4")
        embeddings.tofile(folder / "embeddings.bin")
        np.concatenate(counts).astype("<u4").tofile(folder / "masks.bin")
        (folder / "regions.json").write_text(
            json.dumps(regions, separators=(",", ":")) + "\n"
        )
        manifest = dict(
            sceneId=s["id"],
            width=im.width,
            height=im.height,
            maskWidth=small.width,
            maskHeight=small.height,
            model=MODEL,
            checkpoint="apple/MobileCLIP-S0",
            checkpointRevision=CHECKPOINT_REVISION,
            embeddingDim=scene.shape[-1],
            numRegions=len(regions),
            views=["context", "isolated", "masked"],
            embeddingNormalization="l2",
            maskEncoding="row-major-rle-u32-le",
            segmentation="SAM 2.1 Hiera tiny",
            pointsPerSide=args.points,
        )
        (folder / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        debug.save(folder / "debug.webp", quality=85)
        print("Built", s["id"], flush=True)


if __name__ == "__main__":
    main()
