#!/usr/bin/env python3
"""Print a machine-readable inspection of the actual pinned Track-1 checkpoint."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from policy_runtime import ARNOLD_DIR, build_params, load_module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    module, params = load_module()
    checkpoint = ARNOLD_DIR / "pretrained/vizdoom_2017_track1.pth"
    action_builder = __import__("src.doom.actions", fromlist=["ActionBuilder"]).ActionBuilder(params)
    report = {
        "upstream_revision": "86af06d2fdb35c4bf552ecacfe8fe6ac1abd8cd4",
        "checkpoint_sha256": sha256(checkpoint),
        "checkpoint_bytes": checkpoint.stat().st_size,
        "screen": {"layout": "N,T,C,H,W", "shape": [1, 1, 3, 60, 108], "range": "0..255"},
        "variables": [{"name": name, "values": values} for name, values in params.game_variables],
        "lstm_state_shape": [1, 1, 512],
        "actions": action_builder.available_actions,
        "state_dict": {name: list(value.shape) for name, value in module.state_dict().items()},
    }
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
