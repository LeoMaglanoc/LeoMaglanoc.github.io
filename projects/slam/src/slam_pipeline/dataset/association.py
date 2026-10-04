"""Deterministic one-to-one association for sorted timestamped streams."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Generic, Sequence, TypeVar

import numpy as np


T = TypeVar("T")
U = TypeVar("U")


@dataclass(frozen=True)
class TimestampMatch:
    """Indices and residual for a one-to-one timestamp association."""

    first_index: int
    second_index: int
    residual_s: float


@dataclass(frozen=True)
class AssociationStats:
    first_observations: int
    second_observations: int
    matches: int
    dropped_first: int
    dropped_second: int
    max_residual_s: float
    mean_residual_s: float

    def as_dict(self) -> dict[str, int | float]:
        return asdict(self)


@dataclass(frozen=True)
class AssociationResult(Generic[T, U]):
    matches: list[TimestampMatch]
    stats: AssociationStats

    def pairs(
        self, first: Sequence[tuple[float, T]], second: Sequence[tuple[float, U]]
    ) -> list[tuple[tuple[float, T], tuple[float, U]]]:
        return [(first[item.first_index], second[item.second_index]) for item in self.matches]


def associate_sorted_unique(
    first: Sequence[tuple[float, T]],
    second: Sequence[tuple[float, U]],
    max_difference_s: float,
) -> AssociationResult[T, U]:
    """Associate sorted streams in linear time without reusing a sample.

    At each first-stream timestamp the two neighboring unused second-stream
    samples are considered. Ties prefer the earlier second-stream sample. Once
    a later sample is selected, older samples are permanently stale because all
    remaining first-stream timestamps are later too. This gives deterministic,
    chronological, one-to-one correspondence in O(N + M) time.
    """
    if max_difference_s < 0:
        raise ValueError("max_difference_s must be non-negative")
    if any(first[index][0] > first[index + 1][0] for index in range(len(first) - 1)):
        raise ValueError("first stream must be sorted by timestamp")
    if any(second[index][0] > second[index + 1][0] for index in range(len(second) - 1)):
        raise ValueError("second stream must be sorted by timestamp")

    matches: list[TimestampMatch] = []
    second_index = 0
    for first_index, (timestamp, _) in enumerate(first):
        while second_index < len(second) and second[second_index][0] < timestamp - max_difference_s:
            second_index += 1
        if second_index >= len(second):
            break

        # Move to the last unused sample at or before this timestamp, then
        # compare it with its immediate successor. This is the true nearest
        # pair in a sorted stream even when the tolerance spans many samples.
        nearest_index = second_index
        while nearest_index + 1 < len(second) and second[nearest_index + 1][0] <= timestamp:
            nearest_index += 1
        candidates = [nearest_index]
        if nearest_index + 1 < len(second):
            candidates.append(nearest_index + 1)
        candidate = min(
            candidates,
            key=lambda index: (abs(second[index][0] - timestamp), second[index][0], index),
        )
        residual = abs(second[candidate][0] - timestamp)
        if residual > max_difference_s:
            continue
        matches.append(TimestampMatch(first_index, candidate, residual))
        second_index = candidate + 1

    residuals = np.asarray([match.residual_s for match in matches], dtype=np.float64)
    stats = AssociationStats(
        first_observations=len(first),
        second_observations=len(second),
        matches=len(matches),
        dropped_first=len(first) - len(matches),
        dropped_second=len(second) - len(matches),
        max_residual_s=float(residuals.max()) if len(residuals) else 0.0,
        mean_residual_s=float(residuals.mean()) if len(residuals) else 0.0,
    )
    return AssociationResult(matches=matches, stats=stats)
