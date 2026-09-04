from pathlib import Path

import pytest

from onnx_parity import check_parity


def test_onnx_matches_sb3():
    model = Path("models/pong_ppo.zip")
    onnx = Path("assets/pong/pong_policy.onnx")
    if not model.exists() or not onnx.exists():
        pytest.skip("Train and export a model first: make train && make export")
    check_parity(model, onnx, samples=1000)
