"""Evaluate INT8 against FP32; promote only with limited validation regression."""

import argparse, json, shutil, time
from pathlib import Path
import numpy as np
import onnxruntime as ort
from onnxruntime.quantization import (
    CalibrationDataReader,
    quantize_static,
    QuantFormat,
    QuantType,
)
from train import ROOT, DATA, tensor, distance, nearest, metrics

p = argparse.ArgumentParser()
p.add_argument("--run-dir", type=Path, default=ROOT / "artifacts")
p.add_argument("--promote", action="store_true")
args = p.parse_args()
models = ROOT / "models"
meta = json.loads((models / "metadata.json").read_text())
rows = json.loads((args.run_dir / "manifest.json").read_text())
import torch

state = torch.load(args.run_dir / "best.pt", weights_only=False)
lookup = {r["id"]: r for r in rows}
train = [lookup[i] for i in state["train_ids"]]
val = [lookup[i] for i in state["val_ids"]]
test = [lookup[i] for i in state["test_ids"]]


class Reader(CalibrationDataReader):
    def __init__(self):
        self.items = iter(train[:64])

    def get_next(self):
        row = next(self.items, None)
        return (
            {"image": tensor(DATA / "images" / f"{row['id']}.jpg").unsqueeze(0).numpy()}
            if row
            else None
        )


backup = args.run_dir / "model-fp32.onnx"
shutil.copy2(models / "model.onnx", backup)
quantized = args.run_dir / "model-int8.onnx"
quantize_static(
    str(backup),
    str(quantized),
    Reader(),
    quant_format=QuantFormat.QDQ,
    activation_type=QuantType.QUInt8,
    weight_type=QuantType.QInt8,
    per_channel=True,
    op_types_to_quantize=["Conv", "MatMul", "Gemm"],
)
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
sess = ort.InferenceSession(
    str(quantized), sess_options=options, providers=["CPUExecutionProvider"]
)
zs = []
ls = []
latencies = []
for i, row in enumerate(train + val + test):
    x = tensor(DATA / "images" / f"{row['id']}.jpg").unsqueeze(0).numpy()
    start = time.perf_counter()
    z, l = sess.run(None, {"image": x})
    latencies.append((time.perf_counter() - start) * 1000)
    zs.append(z[0])
    ls.append(l[0])
    if i % 200 == 0:
        print("INT8 evaluation", i, flush=True)
z = np.array(zs)
logits = np.array(ls)
n = len(train)
v = len(val)
train_gps = np.array([[float(r["latitude"]), float(r["longitude"])] for r in train])
centers = np.asarray(meta["centers"])
report = {
    "fp32_bytes": backup.stat().st_size,
    "int8_bytes": quantized.stat().st_size,
    "native_cpu_median_ms": float(np.median(latencies)),
    "method": meta["method"],
    "validation_regression_limit": 0.01,
}
for name, start, end, group in [("val", n, n + v, val), ("test", n + v, len(z), test)]:
    gps = np.array([[float(r["latitude"]), float(r["longitude"])] for r in group])
    pred = (
        centers[logits[start:end].argmax(1)]
        if meta["method"] == "head"
        else nearest(z[start:end], z[:n], train_gps, int(meta["method"].split("-")[1]))
    )
    report[name] = metrics(pred, gps)
report["eligible"] = (
    report["val"]["median_km"]
    <= meta["candidates"][meta["method"]]["val"]["median_km"] * 1.01
)
report["promoted"] = args.promote and report["eligible"]
(args.run_dir / "quantization.json").write_text(json.dumps(report, indent=2))
if report["promoted"]:
    shutil.copy2(quantized, models / "model.onnx")
    refs = z[:n] / (np.linalg.norm(z[:n], axis=1, keepdims=True) + 1e-8)
    refs.astype("<f4").tofile(models / "references.f32")
    (models / "references.json").write_text(
        json.dumps(
            {
                "feature_file": "references.f32",
                "count": n,
                "dimensions": 576,
                "gps": train_gps.tolist(),
            },
            separators=(",", ":"),
        )
    )
    meta["precision"] = "INT8 QDQ"
    meta["quantization"] = report
    meta["candidates"][meta["method"]]["fp32_val"] = meta["candidates"][meta["method"]][
        "val"
    ]
    meta["candidates"][meta["method"]]["fp32_test"] = meta["candidates"][
        meta["method"]
    ]["test"]
    meta["candidates"][meta["method"]]["val"] = report["val"]
    meta["candidates"][meta["method"]]["test"] = report["test"]
    (models / "metadata.json").write_text(json.dumps(meta, indent=2))
    fixture = json.loads((models / "fixture.json").read_text())
    x = tensor(ROOT / fixture["image"]).unsqueeze(0).numpy()
    out = sess.run(None, {"image": x})
    fixture["embedding"] = out[0][0].tolist()
    fixture["logits"] = out[1][0].tolist()
    (models / "fixture.json").write_text(json.dumps(fixture, indent=2))
print(json.dumps(report, indent=2))
