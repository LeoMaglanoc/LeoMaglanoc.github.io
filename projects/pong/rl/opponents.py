"""Scripted opponents used for reproducible baseline training and evaluation."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import constants as C


@dataclass
class OpponentState:
    ball_x: float
    ball_y: float
    ball_vx: float
    ball_vy: float
    paddle_y: float


class Opponent:
    """Interface for an opponent controlling the left paddle."""

    def reset(self, rng: np.random.Generator) -> None:
        self.rng = rng

    def action(self, state: OpponentState) -> int:
        raise NotImplementedError


class EasyOpponent(Opponent):
    """A slow, delayed tracker with small aiming errors."""

    def __init__(self) -> None:
        self.rng = np.random.default_rng()
        self._target = 0.5
        self._ticks = 0

    def reset(self, rng: np.random.Generator) -> None:
        super().reset(rng)
        self._target = 0.5
        self._ticks = 0

    def action(self, state: OpponentState) -> int:
        self._ticks += 1
        if self._ticks % 7 == 0:
            self._target = float(np.clip(state.ball_y + self.rng.normal(0.0, 0.09), 0.0, 1.0))
        difference = self._target - state.paddle_y
        if abs(difference) < 0.045:
            return C.ACTION_STAY
        return C.ACTION_DOWN if difference > 0 else C.ACTION_UP


class TrackingOpponent(Opponent):
    """A capable but bounded tracker that predicts where an incoming ball lands."""

    def __init__(self) -> None:
        self.rng = np.random.default_rng()

    def reset(self, rng: np.random.Generator) -> None:
        super().reset(rng)

    @staticmethod
    def _reflect_y(y: float) -> float:
        # Reflect a point through the top/bottom walls without a loop that can
        # become unstable for an unusually fast ball.
        y = y % 2.0
        return y if y <= 1.0 else 2.0 - y

    def action(self, state: OpponentState) -> int:
        if state.ball_vx < 0:
            time_to_paddle = max((state.ball_x - C.PADDLE_MARGIN) / -state.ball_vx, 0.0)
            predicted = self._reflect_y(state.ball_y + state.ball_vy * time_to_paddle)
        else:
            predicted = 0.5 + (state.ball_y - 0.5) * 0.25
        predicted += float(self.rng.normal(0.0, 0.025))
        difference = predicted - state.paddle_y
        if abs(difference) < 0.025:
            return C.ACTION_STAY
        return C.ACTION_DOWN if difference > 0 else C.ACTION_UP


class PerfectOpponent(Opponent):
    """A player that never misses but varies its collision impact point."""

    perfect_tracking = True

    def __init__(self) -> None:
        self.rng = np.random.default_rng()

    def reset(self, rng: np.random.Generator) -> None:
        super().reset(rng)

    def impact_offset(self) -> float:
        """Return a paddle-half-height offset while preserving guaranteed hits."""

        return float(self.rng.uniform(-C.PERFECT_IMPACT_OFFSET, C.PERFECT_IMPACT_OFFSET))

    def action(self, state: OpponentState) -> int:
        # PongEnv performs the exact alignment after the ball advances. The
        # action is retained to satisfy the same modular opponent interface.
        return C.ACTION_STAY


def make_opponent(name: str) -> Opponent:
    normalized = name.lower()
    if normalized == "easy":
        return EasyOpponent()
    if normalized == "perfect":
        return PerfectOpponent()
    if normalized in {"tracking", "strong"}:
        return TrackingOpponent()
    raise ValueError(f"Unknown opponent {name!r}; choose easy, tracking, or perfect")
