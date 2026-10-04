"""Cross-check project ATE/RPE figures with the independent evo evaluator."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def _metric(output: str, name: str) -> float:
    match = re.search(rf"^\s*{re.escape(name)}\s+([0-9.eE+-]+)$", output, flags=re.MULTILINE)
    if match is None:
        raise RuntimeError(f"evo output did not contain {name!r}:\n{output}")
    return float(match.group(1))


def _run(*command: str) -> str:
    return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("groundtruth", type=Path)
    parser.add_argument("estimate", type=Path)
    parser.add_argument("metrics", type=Path, help="Project trajectory_metrics.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    common = ("--t_max_diff", "0.02", "-a")
    ape_output = _run(
        "evo_ape", "tum", str(args.groundtruth), str(args.estimate),
        "--pose_relation", "trans_part", *common,
    )
    rpe_translation_output = _run(
        "evo_rpe", "tum", str(args.groundtruth), str(args.estimate),
        "-r", "trans_part", "-d", "1", "-u", "f", *common,
    )
    rpe_rotation_output = _run(
        "evo_rpe", "tum", str(args.groundtruth), str(args.estimate),
        "-r", "angle_rad", "-d", "1", "-u", "f", *common,
    )
    project = json.loads(args.metrics.read_text(encoding="utf-8"))["optimized"]
    result = {
        "evo_ape_rmse_m": _metric(ape_output, "rmse"),
        "project_ate_rmse_m": project["ate_rmse_m"],
        "evo_rpe_translation_rmse_m": _metric(rpe_translation_output, "rmse"),
        "project_rpe_translation_rmse_m": project["rpe_translation_rmse_m"],
        "evo_rpe_rotation_rmse_rad": _metric(rpe_rotation_output, "rmse"),
        "project_rpe_rotation_rmse_rad": project["rpe_rotation_rmse_rad"],
    }
    result["ate_rmse_difference_m"] = abs(result["evo_ape_rmse_m"] - float(project["ate_rmse_m"]))
    result["rpe_translation_rmse_difference_m"] = abs(
        result["evo_rpe_translation_rmse_m"] - float(project["rpe_translation_rmse_m"])
    )
    result["rpe_rotation_rmse_difference_rad"] = abs(
        result["evo_rpe_rotation_rmse_rad"] - float(project["rpe_rotation_rmse_rad"])
    )
    result["within_1e-5_tolerance"] = all(
        result[key] <= 1e-5
        for key in ("ate_rmse_difference_m", "rpe_translation_rmse_difference_m", "rpe_rotation_rmse_difference_rad")
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
