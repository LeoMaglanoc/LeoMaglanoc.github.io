#!/usr/bin/env python3
"""Sequentially measure Arnold's sensitivity to health and selected ammo.

This replays the validated native trace through ONNX with the *ablated*
hidden/cell state feeding the next decision. It never evaluates frames
independently. Episode boundaries are recovered from the zero initial LSTM
state written by ``reference_rollout.py``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort


ROOT = Path(__file__).resolve().parents[1]
HEALTHS = (100, 80, 50, 20)
AMMOS = (0, 5, 10, 20, 50, 100, 300)
STALE_PERIODS = (2, 4, 8, 16)


def reset_points(trace: dict[str, np.ndarray]) -> set[int]:
    """Use the recorded zero LSTM input, including the initial decision."""
    hidden = trace["hidden_in"]
    return set(np.flatnonzero(np.max(np.abs(hidden), axis=(1, 2)) == 0).tolist())


def margin(q_values: np.ndarray) -> float:
    ordered = np.partition(q_values, -2, axis=1)
    return float(np.mean(ordered[:, -1] - ordered[:, -2]))


def replay(
    session: ort.InferenceSession,
    trace: dict[str, np.ndarray],
    health: np.ndarray,
    ammo: np.ndarray,
) -> dict[str, float | int]:
    resets = reset_points(trace)
    hidden = np.zeros((1, 1, 512), dtype=np.float32)
    cell = np.zeros((1, 1, 512), dtype=np.float32)
    q_rows: list[np.ndarray] = []

    for index in range(len(trace["action"])):
        if index in resets:
            hidden.fill(0)
            cell.fill(0)
        q_values, _, hidden, cell = session.run(
            None,
            {
                "observation": trace["observation"][index:index + 1].astype(np.float32),
                "health": health[index:index + 1].astype(np.float32),
                "selected_ammo": ammo[index:index + 1].astype(np.float32),
                "hidden_in": hidden,
                "cell_in": cell,
            },
        )
        q_rows.append(q_values[0])

    q = np.asarray(q_rows)
    baseline = trace["q_values"].astype(np.float32)
    mismatches = int(np.count_nonzero(np.argmax(q, axis=1) != trace["action"]))
    return {
        "greedy_action_mismatches": mismatches,
        "greedy_action_mismatch_pct": 100 * mismatches / len(q),
        "mean_abs_delta_q": float(np.mean(np.abs(q - baseline))),
        "max_abs_delta_q": float(np.max(np.abs(q - baseline))),
        "mean_baseline_winning_action_margin": margin(baseline),
    }


def fixed(values: np.ndarray, value: int) -> np.ndarray:
    return np.full_like(values, value, dtype=np.float32)


def stale(values: np.ndarray, trace: dict[str, np.ndarray], period: int) -> np.ndarray:
    result = np.empty_like(values, dtype=np.float32)
    starts = sorted(reset_points(trace)) + [len(values)]
    for start, end in zip(starts, starts[1:]):
        for index in range(start, end):
            source = start + ((index - start) // period) * period
            result[index] = values[source]
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--onnx", type=Path, default=ROOT / "models/arnold_track1.onnx")
    parser.add_argument("--trace", type=Path, default=ROOT / "artifacts/native/track1_reference.npz")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/native/game_variable_ablation.json")
    args = parser.parse_args()
    with np.load(args.trace) as archive:
        trace = {name: archive[name] for name in archive.files}
    session = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    true_health = trace["health"].astype(np.float32)
    true_ammo = trace["selected_ammo"].astype(np.float32)

    pairs = {
        f"health={health},ammo={ammo}": replay(session, trace, fixed(true_health, health), fixed(true_ammo, ammo))
        for health in HEALTHS for ammo in AMMOS
    }
    fixed_health_true_ammo = {
        str(health): replay(session, trace, fixed(true_health, health), true_ammo)
        for health in HEALTHS
    }
    true_health_fixed_ammo = {
        str(ammo): replay(session, trace, true_health, fixed(true_ammo, ammo))
        for ammo in AMMOS
    }
    stale_rows = {
        str(period): replay(session, trace, stale(true_health, trace, period), stale(true_ammo, trace, period))
        for period in STALE_PERIODS
    }
    ranked_pairs = sorted(pairs.items(), key=lambda item: (item[1]["greedy_action_mismatches"], item[1]["mean_abs_delta_q"]))
    result = {
        "trace_decisions": len(trace["action"]),
        "lstm_reset_decisions": sorted(reset_points(trace)),
        "constant_pairs": pairs,
        "constant_pairs_ranked_by_agreement": [name for name, _ in ranked_pairs],
        "fixed_health_true_ammo": fixed_health_true_ammo,
        "true_health_fixed_ammo": true_health_fixed_ammo,
        "stale_both_variables": stale_rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")

    print(f"trace_decisions: {result['trace_decisions']}")
    print(f"lstm_reset_decisions: {result['lstm_reset_decisions']}")
    print("best_constant_pairs:")
    for name in result["constant_pairs_ranked_by_agreement"][:5]:
        row = pairs[name]
        print(f"  {name}: {row['greedy_action_mismatches']} ({row['greedy_action_mismatch_pct']:.2f}%)")
    print("stale_both_variables:")
    for period, row in stale_rows.items():
        print(f"  every {period}: {row['greedy_action_mismatches']} ({row['greedy_action_mismatch_pct']:.2f}%)")


if __name__ == "__main__":
    main()
