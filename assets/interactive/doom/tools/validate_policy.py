#!/usr/bin/env python3
"""Require output, action, and recurrent-state parity on native observations."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort

from policy_runtime import load_module


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", type=Path, default=ROOT / "models/arnold_track1.onnx")
    parser.add_argument("--trace", type=Path, default=ROOT / "artifacts/native/track1_reference.npz")
    parser.add_argument("--atol", type=float, default=1e-4)
    args = parser.parse_args()
    if not args.onnx.exists() or not args.trace.exists():
        raise SystemExit("Export an ONNX model and capture a native trace before validating parity.")

    _, params = load_module()
    action_count = params.n_actions
    with np.load(args.trace) as archive:
        trace = {name: archive[name] for name in archive.files}
    session = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    worst = 0.0
    action_mismatches = 0
    state_mismatches = 0
    for index in range(len(trace["action"])):
        outputs = session.run(
            None,
            {
                "observation": trace["observation"][index:index + 1].astype(np.float32),
                "health": trace["health"][index:index + 1].astype(np.float32),
                "selected_ammo": trace["selected_ammo"][index:index + 1].astype(np.float32),
                "hidden_in": trace["hidden_in"][index:index + 1].astype(np.float32),
                "cell_in": trace["cell_in"][index:index + 1].astype(np.float32),
            },
        )
        q_values, _, hidden_out, cell_out = outputs
        expected_q = trace["q_values"][index]
        worst = max(worst, float(np.max(np.abs(q_values[0] - expected_q))))
        worst = max(worst, float(np.max(np.abs(hidden_out[0] - trace["hidden_out"][index]))))
        worst = max(worst, float(np.max(np.abs(cell_out[0] - trace["cell_out"][index]))))
        if int(np.argmax(q_values[0])) != int(trace["action"][index]):
            action_mismatches += 1
        if hidden_out.shape != (1, 1, 512) or cell_out.shape != (1, 1, 512) or q_values.shape != (1, action_count):
            state_mismatches += 1
    print(f"samples: {len(trace['action'])}")
    print(f"max_abs_error: {worst:.9g}")
    print(f"greedy_action_mismatches: {action_mismatches}")
    if worst > args.atol or action_mismatches or state_mismatches:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
