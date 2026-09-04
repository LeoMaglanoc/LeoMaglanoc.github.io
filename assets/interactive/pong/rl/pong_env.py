"""A compact Gymnasium Pong environment with state observations."""

from __future__ import annotations

from typing import Any

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from . import constants as C
from .opponents import OpponentState, make_opponent


class PongEnv(gym.Env[np.ndarray, np.int64]):
    """Pong where the learning agent controls the right paddle.

    A game lasts until either player reaches ``MAX_SCORE`` or the simulation
    reaches ``MAX_STEPS``. Rewards are intentionally sparse: +1 for the agent
    scoring, -1 for conceding, and 0 during rallies.
    """

    metadata = {"render_modes": []}

    def __init__(self, opponent: str = "easy", render_mode: str | None = None) -> None:
        super().__init__()
        self.opponent_name = opponent
        self.opponent = make_opponent(opponent)
        self.render_mode = render_mode
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(5,), dtype=np.float32)
        self.action_space = spaces.Discrete(3)
        self.np_random = np.random.default_rng()
        self.state: dict[str, float | int] = {}
        self._steps = 0

    def _random_ball_velocity(self, direction: int | None = None) -> tuple[float, float]:
        sign = direction if direction in (-1, 1) else (1 if self.np_random.random() < 0.5 else -1)
        angle = float(self.np_random.uniform(-0.55, 0.55))
        return sign * C.BALL_SPEED * np.cos(angle), C.BALL_SPEED * np.sin(angle)

    def _reset_ball(self, direction: int | None = None) -> None:
        vx, vy = self._random_ball_velocity(direction)
        self.state.update(ball_x=0.5, ball_y=0.5, ball_vx=vx, ball_vy=vy)

    def _observation(self) -> np.ndarray:
        values = C.normalized_observation(
            float(self.state["ball_x"]),
            float(self.state["ball_y"]),
            float(self.state["ball_vx"]),
            float(self.state["ball_vy"]),
            float(self.state["ai_paddle_y"]),
        )
        # Keep terminal observations valid even when the solo environment
        # leaves the ball just beyond the right boundary on a miss.
        return np.asarray(np.clip(values, -1.0, 1.0), dtype=np.float32)

    def _move_paddle(self, name: str, action: int) -> None:
        y = float(self.state[name])
        if int(action) == C.ACTION_UP:
            y -= C.PADDLE_SPEED * C.CONTROL_DT
        elif int(action) == C.ACTION_DOWN:
            y += C.PADDLE_SPEED * C.CONTROL_DT
        half = C.PADDLE_HEIGHT / 2.0
        self.state[name] = float(np.clip(y, half, C.HEIGHT - half))

    def _opponent_action(self) -> int:
        return self.opponent.action(
            OpponentState(
                ball_x=float(self.state["ball_x"]),
                ball_y=float(self.state["ball_y"]),
                ball_vx=float(self.state["ball_vx"]),
                ball_vy=float(self.state["ball_vy"]),
                paddle_y=float(self.state["human_paddle_y"]),
            )
        )

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        self.np_random = self.np_random  # Gymnasium replaces this on seeded resets.
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
        self.opponent.reset(self.np_random)
        self._reset_ball()
        return self._observation(), {"opponent": self.opponent_name}

    def _paddle_hit(self, side: str) -> bool:
        x = float(self.state["ball_x"])
        y = float(self.state["ball_y"])
        vx = float(self.state["ball_vx"])
        paddle_y = float(self.state[f"{side}_paddle_y"])
        if side == "human":
            overlaps = vx < 0 and x - C.BALL_RADIUS <= C.PADDLE_MARGIN + C.PADDLE_WIDTH
            if overlaps and y + C.BALL_RADIUS >= paddle_y - C.PADDLE_HEIGHT / 2 and y - C.BALL_RADIUS <= paddle_y + C.PADDLE_HEIGHT / 2:
                self.state["ball_x"] = C.PADDLE_MARGIN + C.PADDLE_WIDTH + C.BALL_RADIUS
                return True
        else:
            paddle_x = C.WIDTH - C.PADDLE_MARGIN - C.PADDLE_WIDTH
            overlaps = vx > 0 and x + C.BALL_RADIUS >= paddle_x
            if overlaps and y + C.BALL_RADIUS >= paddle_y - C.PADDLE_HEIGHT / 2 and y - C.BALL_RADIUS <= paddle_y + C.PADDLE_HEIGHT / 2:
                self.state["ball_x"] = paddle_x - C.BALL_RADIUS
                return True
        return False

    def _bounce_from_paddle(self, side: str) -> None:
        paddle_y = float(self.state[f"{side}_paddle_y"])
        relative = (float(self.state["ball_y"]) - paddle_y) / (C.PADDLE_HEIGHT / 2)
        vx = float(self.state["ball_vx"])
        new_vx = abs(vx) if side == "human" else -abs(vx)
        new_vy = float(self.state["ball_vy"]) + relative * 0.18
        speed = min(float(np.hypot(new_vx, new_vy)) * C.BALL_SPEEDUP, C.MAX_BALL_SPEED)
        direction_x = 1.0 if side == "human" else -1.0
        direction = np.array([direction_x, new_vy], dtype=np.float64)
        direction /= max(float(np.linalg.norm(direction)), 1e-8)
        self.state["ball_vx"] = float(direction[0] * speed)
        self.state["ball_vy"] = float(direction[1] * speed)

    def step(self, action: int):
        action = int(action)
        if not self.action_space.contains(action):
            raise ValueError(f"Invalid action {action}; expected 0, 1, or 2")
        self._steps += 1
        self._move_paddle("ai_paddle_y", action)
        self._move_paddle("human_paddle_y", self._opponent_action())

        self.state["ball_x"] = float(self.state["ball_x"]) + float(self.state["ball_vx"]) * C.CONTROL_DT
        self.state["ball_y"] = float(self.state["ball_y"]) + float(self.state["ball_vy"]) * C.CONTROL_DT
        if float(self.state["ball_y"]) - C.BALL_RADIUS <= 0 and float(self.state["ball_vy"]) < 0:
            self.state["ball_y"] = C.BALL_RADIUS
            self.state["ball_vy"] = abs(float(self.state["ball_vy"]))
        elif float(self.state["ball_y"]) + C.BALL_RADIUS >= C.HEIGHT and float(self.state["ball_vy"]) > 0:
            self.state["ball_y"] = C.HEIGHT - C.BALL_RADIUS
            self.state["ball_vy"] = -abs(float(self.state["ball_vy"]))

        if getattr(self.opponent, "perfect_tracking", False):
            half = C.PADDLE_HEIGHT / 2.0
            offset = self.opponent.impact_offset() * half
            self.state["human_paddle_y"] = float(np.clip(float(self.state["ball_y"]) + offset, half, C.HEIGHT - half))

        if self._paddle_hit("human"):
            self._bounce_from_paddle("human")
        elif self._paddle_hit("ai"):
            self._bounce_from_paddle("ai")

        reward = 0.0
        point_scored = None
        if float(self.state["ball_x"]) < -C.BALL_RADIUS:
            self.state["ai_score"] = int(self.state["ai_score"]) + 1
            reward = 1.0
            point_scored = "ai"
            self._reset_ball(direction=1)
        elif float(self.state["ball_x"]) > C.WIDTH + C.BALL_RADIUS:
            self.state["human_score"] = int(self.state["human_score"]) + 1
            reward = -1.0
            point_scored = "human"
            self._reset_ball(direction=-1)

        terminated = int(self.state["ai_score"]) >= C.MAX_SCORE or int(self.state["human_score"]) >= C.MAX_SCORE
        truncated = self._steps >= C.MAX_STEPS and not terminated
        info = {
            "score": (int(self.state["ai_score"]), int(self.state["human_score"])),
            "point_scored": point_scored,
            "rally_steps": self._steps,
        }
        return self._observation(), reward, terminated, truncated, info

    def render(self):
        return None
