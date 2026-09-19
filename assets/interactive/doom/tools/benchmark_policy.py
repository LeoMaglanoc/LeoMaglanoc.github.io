#!/usr/bin/env python3
"""Measure local ONNX control-step latency on captured native observations."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", type=Path, default=ROOT / "models/arnold_track1.onnx")
    parser.add_argument("--trace", type=Path, default=ROOT / "artifacts/native/track1_reference.npz")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/native/policy_benchmark.json")
    args = parser.parse_args()
    if not args.onnx.exists() or not args.trace.exists():
        raise SystemExit("Export an ONNX model and capture a native trace before benchmarking.")

    with np.load(args.trace) as archive:
        trace = {name: archive[name] for name in archive.files}
    session = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    latencies = []
    for index in range(len(trace["action"])):
        inputs = {
            "observation": trace["observation"][index:index + 1].astype(np.float32),
            "health": trace["health"][index:index + 1].astype(np.float32),
            "selected_ammo": trace["selected_ammo"][index:index + 1].astype(np.float32),
            "hidden_in": trace["hidden_in"][index:index + 1].astype(np.float32),
            "cell_in": trace["cell_in"][index:index + 1].astype(np.float32),
        }
        started = time.perf_counter()
        session.run(None, inputs)
        latencies.append((time.perf_counter() - started) * 1000)
    report = {
        "samples": len(latencies),
        "median_ms": float(np.median(latencies)),
        "p95_ms": float(np.percentile(latencies, 95)),
        "max_ms": float(np.max(latencies)),
        "control_budget_ms": 1000 * 3 / 35,
        "environment": "Docker CPUExecutionProvider; not browser performance",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
