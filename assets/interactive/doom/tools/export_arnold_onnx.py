#!/usr/bin/env python3
"""Export the pinned recurrent Track-1 module without altering its contract."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from torch import nn

from policy_runtime import initial_state, load_module


ROOT = Path(__file__).resolve().parents[1]


class ExplicitStateArnold(nn.Module):
    """Expose Arnold's LSTM state as explicit ONNX inputs and outputs."""

    def __init__(self, module: nn.Module):
        super().__init__()
        self.module = module

    def forward(self, observation, health, selected_ammo, hidden_in, cell_in):
        q_values, aux_features, (hidden_out, cell_out) = self.module(
            observation,
            [health.to(torch.long), selected_ammo.to(torch.long)],
            (hidden_in, cell_in),
        )
        return q_values[:, 0], aux_features[:, 0], hidden_out, cell_out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "models/arnold_track1.onnx")
    args = parser.parse_args()

    module, _ = load_module()
    export_model = ExplicitStateArnold(module).eval()
    hidden, cell = initial_state()
    observation = torch.zeros((1, 1, 3, 60, 108), dtype=torch.float32)
    variable = torch.zeros((1, 1), dtype=torch.float32)
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with torch.no_grad():
        torch.onnx.export(
            export_model,
            (observation, variable, variable, hidden, cell),
            args.output,
            input_names=["observation", "health", "selected_ammo", "hidden_in", "cell_in"],
            output_names=["q_values", "aux_features", "hidden_out", "cell_out"],
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )
    print(args.output)


if __name__ == "__main__":
    main()
