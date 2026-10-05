"""Verify checkpoint/data contracts, real ONNX execution and shared preprocessing."""

import json, subprocess, sys
from pathlib import Path
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "training"))
from train import ROOT, DATA, distance, tensor, nearest
import onnxruntime as ort

meta = json.loads((ROOT / "models/metadata.json").read_text())
bundle = ROOT / meta.get("checkpoint_bundle", "checkpoints/current")
state = torch.load(bundle / "best.pt", weights_only=False)
manifest = bundle / "manifest.json"
if not manifest.exists(): manifest = bundle.parent / "manifest.json"
rows = json.loads(manifest.read_text())
lookup = {r["id"]: r for r in rows}
sets = {k: set(state[k + "_ids"]) for k in ["train", "val", "test"]}
assert not sets["train"] & sets["val"]
assert not sets["train"] & sets["test"]
assert not sets["val"] & sets["test"]
assert not {lookup[i]["sequence"] for i in sets["train"]} & {
    lookup[i]["sequence"] for i in sets["val"] | sets["test"]
}
coords = lambda ids: np.array(
    [[float(lookup[i]["latitude"]), float(lookup[i]["longitude"])] for i in ids]
)
a, b = coords(sets["train"]), coords(sets["val"] | sets["test"])
minimum = min(
    distance(a[s : s + 256, None], b[None]).min() for s in range(0, len(a), 256)
)
assert minimum >= 25
assert {lookup[i]["block"] for i in sets["train"]}.isdisjoint(
    {lookup[i]["block"] for i in sets["val"]}
)
pack = json.loads((ROOT / "rounds.json").read_text())
assert len(pack) >= 5
assert all(
    r["id"] in sets["test"]
    and r["creator"]
    and r["source"]
    and r["license"] == "CC BY-SA 4.0"
    for r in pack
)
options = ort.SessionOptions()
options.intra_op_num_threads = 2
sess = ort.InferenceSession(
    str(ROOT / "models/model.onnx"),
    sess_options=options,
    providers=["CPUExecutionProvider"],
)
fixture = json.loads((ROOT / "models/fixture.json").read_text())
out = sess.run(None, {"image": tensor(ROOT / fixture["image"]).unsqueeze(0).numpy()})
assert np.allclose(out[0][0], fixture["embedding"], atol=1e-5)
assert np.allclose(out[1][0], fixture["logits"], atol=1e-5)
if "projection" in fixture: assert np.allclose(out[2][0], fixture["projection"], atol=1e-5)
outputs = dict(zip([v.name for v in sess.get_outputs()], out))
z = outputs[meta.get("embedding_output", "embedding")]
# Verify the real exported retrieval pack has identical JS/Python predictions.
meta = json.loads((ROOT / "models/metadata.json").read_text())
ref = json.loads((ROOT / "models/references.json").read_text())
if meta["method"].startswith(("retrieval", "distilled")):
    matrix = np.fromfile(ROOT / "models" / ref["feature_file"], dtype="<f4").reshape(
        ref["count"], ref["dimensions"]
    )
    gps = np.asarray(ref["gps"])
    script = "import {selectPrediction} from './projects/euroguessr/src/geo.js';let s='';for await(const c of process.stdin)s+=c;const a=JSON.parse(s);process.stdout.write(JSON.stringify(selectPrediction(a.z,a.logits,a.meta,a.refs)));"
    raw = subprocess.check_output(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT.parents[1],
        input=json.dumps(
            {
                "z": z[0].tolist(),
                "logits": out[1][0].tolist(),
                "meta": meta,
                "refs": {"features": matrix.tolist(), "gps": gps.tolist()},
            }
        ).encode(),
    )
    prediction = json.loads(raw)
    expected = nearest(z, matrix, gps, int(meta["method"].split("-")[1]), meta.get("retrieval_temperature",20))[0]
    assert set(ref["ids"]).issubset(sets["train"])
    assert np.allclose([prediction["lat"], prediction["lon"]], expected, atol=1e-5)
# Use a PNG to separate interpolation math from JPEG decoder differences.
from PIL import Image

rng = np.random.default_rng(42)
rgb = rng.integers(0, 256, (31, 47, 3), dtype=np.uint8)
path = ROOT / "artifacts" / "preprocess-test.png"
Image.fromarray(rgb).save(path)
rgba = np.concatenate([rgb, np.full((31, 47, 1), 255, dtype=np.uint8)], 2)
script = "import {resizeNormalize} from './projects/euroguessr/src/preprocess.js';let s='';for await(const c of process.stdin)s+=c;const a=JSON.parse(s);process.stdout.write(JSON.stringify(Array.from(resizeNormalize(a.pixels,a.width,a.height))));"
javascript = subprocess.check_output(
    ["node", "--input-type=module", "-e", script],
    cwd=ROOT.parents[1],
    input=json.dumps(
        {"pixels": rgba.ravel().tolist(), "width": 47, "height": 31}
    ).encode(),
)
actual = np.array(json.loads(javascript))
error = float(np.max(np.abs(actual - tensor(path).numpy().ravel())))
assert error < 1e-6, error
print(
    json.dumps(
        {
            "split_contract": "passed",
            "minimum_train_holdout_km": float(minimum),
            "onnx_fixture": "passed",
            "preprocessing_max_error": error,
            "public_test_images": len(pack),
        },
        indent=2,
    )
)
