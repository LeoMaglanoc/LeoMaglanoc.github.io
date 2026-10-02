from collections import deque
import numpy as np
import torch


class Replay:
    """Episodes have N+1 observations and N transitions; samples never cross resets."""

    def __init__(self, capacity=100_000, seed=0):
        self.episodes = deque()
        self.current = None
        self.capacity = capacity
        self.rng = np.random.default_rng(seed)

    def begin(self, observation):
        self.current = {
            "obs": [observation.copy()],
            "action": [],
            "reward": [],
            "continue": [],
        }

    def add(self, action, reward, continuation, observation, done):
        for k, v in (
            ("obs", observation.copy()),
            ("action", np.asarray(action, np.float32).copy()),
            ("reward", [reward]),
            ("continue", [continuation]),
        ):
            self.current[k].append(v)
        if done:
            self.episodes.append(
                {k: np.asarray(v, np.float32) for k, v in self.current.items()}
            )
            self.current = None
            while sum(len(e["action"]) for e in self.episodes) > self.capacity:
                self.episodes.popleft()

    def sample(self, batch, length):
        candidates = [e for e in self.episodes if len(e["action"]) >= length]
        if self.current is not None and len(self.current["action"]) >= length:
            candidates.append(self.current)
        if not candidates:
            raise ValueError("Replay needs a sequence of sufficient length")
        # Weight by available windows, rather than biasing toward short episodes.
        counts = np.array([len(e["action"]) - length + 1 for e in candidates])
        selected = self.rng.choice(len(candidates), batch, p=counts / counts.sum())
        result = {k: [] for k in ("obs", "action", "reward", "continue")}
        for index in selected:
            e = candidates[index]
            start = self.rng.integers(len(e["action"]) - length + 1)
            for k in result:
                result[k].append(
                    np.asarray(e[k][start : start + length + (k == "obs")], np.float32)
                )
        return {k: torch.from_numpy(np.stack(v)) for k, v in result.items()}
