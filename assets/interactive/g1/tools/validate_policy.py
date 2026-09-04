#!/usr/bin/env python3
"""Validate an exported ONNX actor against the original TorchScript actor."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from torch import nn


ROOT = Path(__file__).resolve().parents[1]


def action_from_output(output):
    return output[0] if isinstance(output, (tuple, list)) else output


class ExplicitStatePolicy(nn.Module):
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
    parser.add_argument("--policy", type=Path, default=ROOT / "models/motion.pt")
    parser.add_argument("--onnx", type=Path, default=ROOT / "models/policy.onnx")
    parser.add_argument("--samples", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    policy = torch.jit.load(args.policy, map_location="cpu").eval()
    stateful_policy = ExplicitStatePolicy(policy).eval()
    session = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    rng = np.random.default_rng(args.seed)
    maximum = 0.0
    hidden = np.zeros((1, 1, 64), dtype=np.float32)
    cell = np.zeros((1, 1, 64), dtype=np.float32)
    policy.hidden_state.zero_()
    policy.cell_state.zero_()
    for _ in range(args.samples):
        observation = rng.standard_normal((1, 47), dtype=np.float32)
        with torch.no_grad():
            direct = action_from_output(policy(torch.from_numpy(observation)))
            expected, expected_hidden, expected_cell = stateful_policy(
                torch.from_numpy(observation),
                torch.from_numpy(hidden),
                torch.from_numpy(cell),
            )
        actual, actual_hidden, actual_cell = session.run(
            None, {input_name: observation, "hidden": hidden, "cell": cell}
        )
        maximum = max(
            maximum,
            float(np.max(np.abs(direct.numpy() - expected.numpy()))),
            float(np.max(np.abs(expected.numpy() - actual))),
            float(np.max(np.abs(expected_hidden.numpy() - actual_hidden))),
            float(np.max(np.abs(expected_cell.numpy() - actual_cell))),
        )
        hidden, cell = actual_hidden, actual_cell
    print(f"validated {args.samples} observations")
    print(f"max_abs_error: {maximum:.9g}")
    if maximum > 1e-5:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
