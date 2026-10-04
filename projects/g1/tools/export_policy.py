#!/usr/bin/env python3
"""Export Unitree's TorchScript G1 actor to ONNX and check numerical parity."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from torch import nn


ROOT = Path(__file__).resolve().parents[1]


def action_from_output(output):
    if isinstance(output, (tuple, list)):
        output = output[0]
    return output


class ExplicitStatePolicy(nn.Module):
    """Expose Unitree's stateful TorchScript actor as a pure tensor function."""

    def __init__(self, policy):
        super().__init__()
        self.memory = nn.LSTM(47, 64)
        self.actor = nn.Sequential(nn.Linear(64, 32), nn.ELU(), nn.Linear(32, 12))
        self.memory.load_state_dict(policy.memory.state_dict())
        self.actor.load_state_dict(policy.actor.state_dict())

    def forward(self, observation, hidden, cell):
        output, (next_hidden, next_cell) = self.memory(
            observation.unsqueeze(0), (hidden, cell)
        )
        return self.actor(output.squeeze(0)), next_hidden, next_cell


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "models/motion.pt")
    parser.add_argument("--output", type=Path, default=ROOT / "models/policy.onnx")
    parser.add_argument("--samples", type=int, default=100)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    policy = torch.jit.load(args.input, map_location="cpu").eval()
    dummy = torch.zeros(1, 47, dtype=torch.float32)
    dummy_hidden = torch.zeros(1, 1, 64, dtype=torch.float32)
    dummy_cell = torch.zeros(1, 1, 64, dtype=torch.float32)
    stateful_policy = ExplicitStatePolicy(policy).eval()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        torch.onnx.export(
            stateful_policy,
            (dummy, dummy_hidden, dummy_cell),
            args.output,
            input_names=["obs", "hidden", "cell"],
            output_names=["action", "next_hidden", "next_cell"],
            dynamic_axes={
                "obs": {0: "batch"},
                "action": {0: "batch"},
                "hidden": {1: "batch"},
                "cell": {1: "batch"},
                "next_hidden": {1: "batch"},
                "next_cell": {1: "batch"},
            },
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )

    session = ort.InferenceSession(str(args.output), providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(args.seed)
    max_error = 0.0
    hidden = dummy_hidden.numpy()
    cell = dummy_cell.numpy()
    for _ in range(args.samples):
        observation = rng.standard_normal((1, 47), dtype=np.float32)
        with torch.no_grad():
            direct_output = action_from_output(policy(torch.from_numpy(observation)))
            torch_output, torch_hidden, torch_cell = stateful_policy(
                torch.from_numpy(observation),
                torch.from_numpy(hidden),
                torch.from_numpy(cell),
            )
        onnx_output, onnx_hidden, onnx_cell = session.run(
            ["action", "next_hidden", "next_cell"],
            {"obs": observation, "hidden": hidden, "cell": cell},
        )
        max_error = max(
            max_error,
            float(np.max(np.abs(direct_output.numpy() - torch_output.numpy()))),
            float(np.max(np.abs(torch_output.numpy() - onnx_output))),
            float(np.max(np.abs(torch_hidden.numpy() - onnx_hidden))),
            float(np.max(np.abs(torch_cell.numpy() - onnx_cell))),
        )
        hidden, cell = onnx_hidden, onnx_cell

    print(f"exported: {args.output}")
    print(f"samples: {args.samples}")
    print(f"max_abs_error: {max_error:.9g}")
    if max_error > 1e-5:
        raise SystemExit("ONNX parity check failed: max_abs_error > 1e-5")


if __name__ == "__main__":
    main()
