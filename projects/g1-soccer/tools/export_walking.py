"""Pure tensor wrapper for Unitree's stateful TorchScript walking policy.

Expose recurrent state explicitly for deterministic ONNX/browser inference.
Adapted from this website's existing G1 exporter; no walking weights are trained.
"""

from torch import nn


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
