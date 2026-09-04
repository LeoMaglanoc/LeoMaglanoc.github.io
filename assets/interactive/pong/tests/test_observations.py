import numpy as np

from rl import constants as C


def test_observation_transform_matches_documented_ranges():
    observation = C.normalized_observation(0, 0, -C.MAX_BALL_SPEED, C.MAX_BALL_SPEED, 0)
    assert observation == [-1.0, -1.0, -1.0, 1.0, -1.0]


def test_generated_config_matches_python_constants(tmp_path):
    import json

    output = tmp_path / "pong_config.json"
    C.write_config(output)
    assert json.loads(output.read_text()) == C.config_dict()


def test_committed_browser_config_matches_python_constants():
    import json
    from pathlib import Path

    config_path = Path("assets/pong/pong_config.json")
    assert json.loads(config_path.read_text()) == C.config_dict()
