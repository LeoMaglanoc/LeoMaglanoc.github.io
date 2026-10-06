import json, numpy as np, torch, argparse
from PIL import Image, ImageDraw
from common import ASSETS, PROJECT, load_model

ap = argparse.ArgumentParser()
ap.add_argument("--scene", default="workshop")
ap.add_argument("--query", default="something used to tighten screws")
a = ap.parse_args()
m, _, tok = load_model()
folder = ASSETS / "data" / a.scene
meta = json.loads((folder / "manifest.json").read_text())
regions = json.loads((folder / "regions.json").read_text())
e = np.fromfile(folder / "embeddings.bin", dtype="<f4")[meta["embeddingDim"] :].reshape(
    meta["numRegions"], 3, meta["embeddingDim"]
)
with torch.inference_mode():
    z = m.encode_text(tok([a.query]), normalize=True).numpy()[0]
scores = np.max(e @ z, axis=-1)
rank = np.argsort(-scores)
print([(int(i + 1), float(scores[i]), regions[i]["bbox"]) for i in rank[:5]])
im = (
    Image.open(folder / "scene.webp")
    .convert("RGBA")
    .resize((meta["maskWidth"], meta["maskHeight"]))
)
rle = np.fromfile(folder / "masks.bin", dtype="<u4")
r = regions[rank[0]]
counts = rle[r["rleOffset"] : r["rleOffset"] + r["rleLength"]]
mask = np.repeat(np.arange(len(counts)) % 2, counts).reshape(
    meta["maskHeight"], meta["maskWidth"]
)
layer = np.zeros((meta["maskHeight"], meta["maskWidth"], 4), dtype=np.uint8)
layer[mask == 1] = [85, 255, 150, 130]
im = Image.alpha_composite(im, Image.fromarray(layer))
ImageDraw.Draw(im).text(
    (10, 10),
    f"{a.query}\nRegion {r['id']}: {scores[rank[0]]:.3f}",
    fill="white",
    stroke_fill="black",
    stroke_width=2,
)
im.convert("RGB").save(PROJECT / "artifacts/reference.jpg")
