import pytest

from slam_pipeline.dataset.association import associate_sorted_unique


def _times(values: list[float]) -> list[tuple[float, float]]:
    return [(value, value) for value in values]


def test_association_exact_match() -> None:
    result = associate_sorted_unique(_times([1.0]), _times([1.0]), 0.01)
    assert [(item.first_index, item.second_index) for item in result.matches] == [(0, 0)]


def test_association_competing_frames_do_not_reuse_depth() -> None:
    result = associate_sorted_unique(_times([1.000, 1.004]), _times([1.002]), 0.01)
    assert len(result.matches) == 1
    assert result.stats.dropped_first == 1
    assert result.stats.dropped_second == 0


def test_association_handles_missing_and_outside_threshold_samples() -> None:
    result = associate_sorted_unique(_times([1.0, 2.0, 3.0]), _times([1.001, 2.1]), 0.01)
    assert [(item.first_index, item.second_index) for item in result.matches] == [(0, 0)]
    assert result.stats.max_residual_s == pytest.approx(0.001)


def test_association_prefers_nearest_and_is_deterministic_on_ties() -> None:
    nearest = associate_sorted_unique(_times([1.009]), _times([1.000, 1.010]), 0.02)
    tie = associate_sorted_unique(_times([1.005]), _times([1.000, 1.010]), 0.02)
    assert nearest.matches[0].second_index == 1
    assert tie.matches[0].second_index == 0


def test_association_requires_sorted_inputs() -> None:
    try:
        associate_sorted_unique(_times([2.0, 1.0]), _times([1.0]), 0.01)
    except ValueError as error:
        assert "sorted" in str(error)
    else:  # pragma: no cover
        raise AssertionError("expected unsorted timestamps to be rejected")
