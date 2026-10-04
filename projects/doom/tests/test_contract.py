"""Container checks for the pinned, local-only Arnold integration tooling."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from policy_runtime import ARNOLD_DIR, build_params, initial_state, load_module


ROOT = Path(__file__).resolve().parents[1]


def test_track1_checkpoint_and_model_contract():
    module, params = load_module()
    checkpoint = ARNOLD_DIR / "pretrained/vizdoom_2017_track1.pth"
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == "08a59e88fb7c69d27f8326f7b724b6ef876758aa74e4d71686db637d37c8d36f"
    assert params.n_actions == 35
    assert params.game_variables == [("health", 101), ("sel_ammo", 301)]
    hidden, cell = initial_state()
    with torch.no_grad():
        q_values, features, next_state = module(
            torch.zeros((1, 1, 3, 60, 108)),
            [torch.zeros((1, 1), dtype=torch.long), torch.zeros((1, 1), dtype=torch.long)],
            (hidden, cell),
        )
    assert q_values.shape == (1, 1, 35)
    assert features.shape == (1, 1, 2)
    assert next_state[0].shape == next_state[1].shape == (1, 1, 512)


def test_exact_action_order_is_stable():
    params = build_params()
    from src.doom.actions import ActionBuilder

    actions = ActionBuilder(params).available_actions
    assert actions[0] == ["MOVE_FORWARD"]
    assert actions[8] == ["ATTACK"]
    assert actions[-1] == ["MOVE_RIGHT", "TURN_RIGHT", "MOVE_BACKWARD"]
    assert len(actions) == 35


def test_exported_onnx_contract_if_a_local_export_exists():
    path = ROOT / "models/arnold_track1.onnx"
    if not path.exists():
        return
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    assert [item.name for item in session.get_inputs()] == [
        "observation", "health", "selected_ammo", "hidden_in", "cell_in"
    ]
    assert [item.name for item in session.get_outputs()] == [
        "q_values", "aux_features", "hidden_out", "cell_out"
    ]


def test_metadata_records_the_mvp_permission_assumption():
    metadata = json.loads((ROOT / "models/policy_metadata.json").read_text())
    assert metadata["redistribution_status"] == "assumed_permitted_for_mvp_by_project_plan"
    assert metadata["checkpoint"]["sha256"] == "08a59e88fb7c69d27f8326f7b724b6ef876758aa74e4d71686db637d37c8d36f"
