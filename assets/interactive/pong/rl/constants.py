"""Shared Pong physics and observation constants.

The browser consumes the generated ``assets/pong/pong_config.json`` file,
which is produced from this module. Coordinates are expressed in a unit
square, with y increasing downwards.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

WIDTH = 1.0
HEIGHT = 1.0
PADDLE_WIDTH = 0.025
PADDLE_HEIGHT = 0.20
PADDLE_MARGIN = 0.045
PADDLE_SPEED = 0.82
BALL_RADIUS = 0.018
BALL_SPEED = 0.58
MAX_BALL_SPEED = 1.15
BALL_SPEEDUP = 1.035
CONTROL_DT = 0.02
MAX_SCORE = 7
MAX_STEPS = 5000
HIT_REWARD = 0.1
MISS_REWARD = -1.0
PERFECT_IMPACT_OFFSET = 0.75
ACTION_UP = 0
ACTION_STAY = 1
ACTION_DOWN = 2


def config_dict() -> dict[str, float | int]:
    """Return all values needed by the browser simulation."""

    return {
        "WIDTH": WIDTH,
        "HEIGHT": HEIGHT,
        "PADDLE_WIDTH": PADDLE_WIDTH,
        "PADDLE_HEIGHT": PADDLE_HEIGHT,
        "PADDLE_MARGIN": PADDLE_MARGIN,
        "PADDLE_SPEED": PADDLE_SPEED,
        "BALL_RADIUS": BALL_RADIUS,
        "BALL_SPEED": BALL_SPEED,
        "MAX_BALL_SPEED": MAX_BALL_SPEED,
        "BALL_SPEEDUP": BALL_SPEEDUP,
        "CONTROL_DT": CONTROL_DT,
        "MAX_SCORE": MAX_SCORE,
        "MAX_STEPS": MAX_STEPS,
    }


def normalized_observation(
    ball_x: float,
    ball_y: float,
    ball_vx: float,
    ball_vy: float,
    ai_paddle_y: float,
) -> list[float]:
    """Convert the canonical state to the five RL inputs."""

    return [
        2.0 * ball_x / WIDTH - 1.0,
        2.0 * ball_y / HEIGHT - 1.0,
        ball_vx / MAX_BALL_SPEED,
        ball_vy / MAX_BALL_SPEED,
        2.0 * ai_paddle_y / HEIGHT - 1.0,
    ]


def write_config(path: str | Path) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(config_dict(), indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Write the browser Pong configuration")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write_config(args.output)
