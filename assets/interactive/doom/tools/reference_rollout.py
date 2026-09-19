#!/usr/bin/env python3
"""Capture an actual native Track-1 rollout for PyTorch/ONNX parity testing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch

from policy_runtime import create_track1_game, initial_state, load_module


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=512)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/native/track1_reference.npz")
    args = parser.parse_args()
    if args.steps < 32:
        raise SystemExit("Capture at least 32 control steps for meaningful parity coverage.")

    module, params = load_module()
    game = create_track1_game(params, visible=False)
    hidden, cell = initial_state()
    last_states = []
    rows = {key: [] for key in ("observation", "health", "selected_ammo", "hidden_in", "cell_in", "q_values", "action", "hidden_out", "cell_out")}

    game_stats = None
    try:
        with torch.no_grad():
            for _ in range(args.steps):
                if game.is_player_dead():
                    game.respawn_player()
                    hidden, cell = initial_state()
                game.observe_state(params, last_states)
                state = last_states[-1]
                observation = torch.from_numpy(state.screen.astype(np.float32, copy=False)).view(1, 1, 3, 60, 108)
                health = torch.tensor([[state.variables[0]]], dtype=torch.float32)
                ammo = torch.tensor([[state.variables[1]]], dtype=torch.float32)
                q_values, _, (next_hidden, next_cell) = module(
                    observation, [health.long(), ammo.long()], (hidden, cell)
                )
                action = int(q_values[0, 0].argmax().item())
                rows["observation"].append(observation.numpy()[0])
                rows["health"].append(health.numpy()[0])
                rows["selected_ammo"].append(ammo.numpy()[0])
                rows["hidden_in"].append(hidden.numpy()[0])
                rows["cell_in"].append(cell.numpy()[0])
                rows["q_values"].append(q_values.numpy()[0, 0])
                rows["action"].append(action)
                rows["hidden_out"].append(next_hidden.numpy()[0])
                rows["cell_out"].append(next_cell.numpy()[0])
                hidden, cell = next_hidden, next_cell
                game.make_action(action, frame_skip=3)
        game_stats = dict(game.statistics[1])
    finally:
        game.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.output, **{key: np.asarray(value) for key, value in rows.items()})
    metadata = {
        "steps": args.steps,
        "frame_skip": 3,
        "policy_hz": 35 / 3,
        "bots": 10,
        "action_histogram": {str(index): int(count) for index, count in enumerate(np.bincount(rows["action"], minlength=35))},
        "game_statistics": game_stats,
    }
    args.output.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(args.output)


if __name__ == "__main__":
    main()
