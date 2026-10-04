"""Solo training environment for learning right-paddle ball tracking.

The left player is replaced by a reflecting wall. This removes opponent
policy behavior from the learning problem while preserving the ball, wall,
and agent-paddle physics used by the browser. Episodes end when the ball
misses the agent at the right wall or when the step cap is reached.
"""

from __future__ import annotations

from typing import Any

import gymnasium as gym

from . import constants as C
from .pong_env import PongEnv


class SoloPongEnv(PongEnv):
    """Train the right paddle against a reflecting left wall."""

    def __init__(self, render_mode: str | None = None) -> None:
        # The parent owns the shared physics helpers; no scripted opponent is
        # consulted by this environment's step method.
        super().__init__(opponent="easy", render_mode=render_mode)
        self.opponent_name = "wall"

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        gym.Env.reset(self, seed=seed)
        self._steps = 0
        self.state = {
            "ball_x": 0.5,
            "ball_y": 0.5,
            "ball_vx": 0.0,
            "ball_vy": 0.0,
            "ai_paddle_y": 0.5,
            "human_paddle_y": 0.5,
            "ai_score": 0,
            "human_score": 0,
        }
        self._reset_ball(direction=1)
        return self._observation(), {"opponent": "wall", "training": "solo"}

    def step(self, action: int):
        action = int(action)
        if not self.action_space.contains(action):
            raise ValueError(f"Invalid action {action}; expected 0, 1, or 2")
        self._steps += 1
        self._move_paddle("ai_paddle_y", action)
        self.state["ball_x"] = float(self.state["ball_x"]) + float(self.state["ball_vx"]) * C.CONTROL_DT
        self.state["ball_y"] = float(self.state["ball_y"]) + float(self.state["ball_vy"]) * C.CONTROL_DT

        if float(self.state["ball_y"]) - C.BALL_RADIUS <= 0 and float(self.state["ball_vy"]) < 0:
            self.state["ball_y"] = C.BALL_RADIUS
            self.state["ball_vy"] = abs(float(self.state["ball_vy"]))
        elif float(self.state["ball_y"]) + C.BALL_RADIUS >= C.HEIGHT and float(self.state["ball_vy"]) > 0:
            self.state["ball_y"] = C.HEIGHT - C.BALL_RADIUS
            self.state["ball_vy"] = -abs(float(self.state["ball_vy"]))

        hit = self._paddle_hit("ai")
        if hit:
            self._bounce_from_paddle("ai")
            reward = C.HIT_REWARD
            terminated = False
            event = "hit"
        elif float(self.state["ball_x"]) - C.BALL_RADIUS <= 0 and float(self.state["ball_vx"]) < 0:
            self.state["ball_x"] = C.BALL_RADIUS
            self.state["ball_vx"] = abs(float(self.state["ball_vx"]))
            reward = 0.0
            terminated = False
            event = None
        elif float(self.state["ball_x"]) > C.WIDTH + C.BALL_RADIUS:
            reward = C.MISS_REWARD
            terminated = True
            event = "miss"
        else:
            reward = 0.0
            terminated = False
            event = None

        truncated = self._steps >= C.MAX_STEPS and not terminated
        info = {"point_scored": event, "paddle_hit": hit, "rally_steps": self._steps}
        return self._observation(), reward, terminated, truncated, info
