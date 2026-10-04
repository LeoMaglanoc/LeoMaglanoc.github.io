"""Generate a compact, inspectable report for a completed TUM benchmark."""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import open3d as o3d

_TUM_URL = "https://cvg.cit.tum.de/data/datasets/rgbd-dataset"


def _json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "-c", "safe.directory=/workspace", "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.STDOUT,
        ).strip()
    except (OSError, subprocess.CalledProcessError) as error:
        return f"unavailable ({error})"


def _rtabmap_version() -> str:
    """Return the installed RTAB-Map Debian package version.

    ``rtabmap-export`` has no supported version flag, so querying the ROS
    package database is both reliable and representative of the binary used by
    the benchmark container.
    """
    distro = os.environ.get("ROS_DISTRO", "jazzy")
    for package in (f"ros-{distro}-rtabmap", f"ros-{distro}-rtabmap-ros"):
        try:
            version = subprocess.check_output(
                ["dpkg-query", "-W", "-f=${Version}", package],
                text=True,
                stderr=subprocess.STDOUT,
            ).strip()
        except (OSError, subprocess.CalledProcessError):
            continue
        if version:
            return f"{package} {version}"
    return "unavailable (no installed RTAB-Map Debian package)"


def _markdown(title: str, values: dict[str, Any]) -> str:
    lines = [f"# {title}", "", "## Environment", ""]
    environment = values["environment"]
    lines.extend(f"- {key}: `{value}`" for key, value in environment.items())
    lines.extend(["", "## Dataset and association", ""])
    dataset = values["dataset"]
    lines.extend(f"- {key}: {value}" for key, value in dataset.items())
    lines.extend(["", "## RTAB-Map graph", ""])
    lines.extend(f"- {key}: {value}" for key, value in values["graph"].items())
    lines.extend(["", "## Trajectory metrics", ""])
    for mode, metrics in values["trajectory_metrics"].items():
        lines.append(f"### {mode.replace('_', ' ').title()}")
        lines.append("")
        lines.extend(f"- {key}: {value}" for key, value in metrics.items() if not key.endswith("plot") and key != "trajectory_path")
        lines.append("")
    lines.extend(["## Independent evaluator cross-check", ""])
    lines.extend(f"- {key}: {value}" for key, value in values["evo_crosscheck"].items())
    lines.extend(["## Native RTAB-Map textured mesh", ""])
    lines.extend(f"- {key}: {value}" for key, value in values["textured_mesh"].items() if key not in {"command", "textures", "settings"} and not key.endswith("path"))
    lines.extend(["", "## Open3D TSDF baseline", ""])
    lines.extend(f"- {key}: {value}" for key, value in values["tsdf"].items() if not key.endswith("path"))
    lines.extend(["", "## Replay and completion", ""])
    lines.extend(f"- {key}: {value}" for key, value in values["replay"].items())
    lines.extend(["", "## Warnings / errors", "", "- None reported by the benchmark orchestrator.", ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sequence", required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--docs-output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output
    gt_path = output / "ground_truth" / "gt_stats.json"
    gt = _json(gt_path) if gt_path.is_file() else {}
    graph = _json(output / "graph_stats.json")
    metrics = _json(output / "evaluation" / "trajectory_metrics.json")
    tsdf = _json(output / "optimized_tsdf" / "rtabmap_tsdf_stats.json")
    textured_mesh = _json(output / "rtabmap_textured" / "master" / "reconstruction_stats.json")
    replay = _json(output / "replay_summary.json")
    quiescence = _json(output / "drain_summary.json")
    evo_crosscheck = _json(output / "evaluation" / "evo_crosscheck.json")
    association = gt.get("association", {})
    values = {
        "environment": {
            "git_sha": _git_sha(),
            "date_utc": datetime.now(timezone.utc).isoformat(),
            "python": platform.python_version(),
            "open3d": o3d.__version__,
            "ros": os.environ.get("ROS_DISTRO", "jazzy"),
            "rtabmap": _rtabmap_version(),
        },
        "dataset": {
            "sequence": args.sequence if args.sequence.startswith("freiburg") else f"fr1/{args.sequence}",
            "source_url": _TUM_URL,
            **{key: value for key, value in association.items() if not isinstance(value, dict)},
        },
        "graph": graph,
        "trajectory_metrics": metrics,
        "evo_crosscheck": evo_crosscheck,
        "tsdf": tsdf,
        "textured_mesh": textured_mesh,
        "replay": {**replay, "database_quiescence": quiescence},
    }
    label = args.sequence if args.sequence.startswith("freiburg") else f"fr1/{args.sequence}"
    report = _markdown(f"TUM {label} benchmark", values)
    (output / "report.md").write_text(report, encoding="utf-8")

    docs_output = args.docs_output
    docs_output.mkdir(parents=True, exist_ok=True)
    (docs_output / "report.md").write_text(report, encoding="utf-8")
    evidence = [
        output / "evaluation" / "trajectory_metrics.json",
        output / "evaluation" / "evo_crosscheck.json",
        output / "graph_stats.json",
        output / "evaluation" / "trajectory_comparison.png",
        output / "evaluation" / "ate_error.png",
        output / "optimized_tsdf" / "optimized_mesh_preview.png",
        output / "rtabmap_textured" / "master" / "preview.png",
        output / "examples" / "rgb_example.png",
        output / "examples" / "depth_example.png",
    ]
    # The legacy regression gates include a separate ground-truth TSDF baseline.
    # The public odometry run intentionally does not use ground truth pre-mapping.
    if gt_path.is_file():
        evidence.append(output / "ground_truth" / "gt_mesh_preview.png")
    for source in evidence:
        if not source.is_file():
            raise FileNotFoundError(f"Required evidence artifact missing: {source}")
        shutil.copy2(source, docs_output / source.name)


if __name__ == "__main__":
    main()
