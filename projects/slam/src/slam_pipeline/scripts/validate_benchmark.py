"""Fail on missing, empty, or non-finite completed benchmark artifacts."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from ..reconstruction.textured_mesh import inspect_textured_obj
from .export_web_demo import inspect_textured_glb


def _require_file(path: Path) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"Required artifact missing or empty: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--require-web-demo", action="store_true")
    args = parser.parse_args()
    output = args.output
    for path in [
        output / "rtabmap.db",
        output / "evaluation" / "optimized_trajectory.txt",
        output / "evaluation" / "evo_crosscheck.json",
        output / "optimized_tsdf" / "optimized_tsdf_mesh.ply",
        output / "optimized_tsdf" / "optimized_pointcloud.ply",
        output / "rtabmap_textured" / "master" / "mesh.obj",
        output / "rtabmap_textured" / "master" / "reconstruction_stats.json",
        output / "report.md",
    ]:
        _require_file(path)
    stats = json.loads((output / "optimized_tsdf" / "rtabmap_tsdf_stats.json").read_text(encoding="utf-8"))
    for key in ("mesh_vertices", "mesh_triangles", "point_count"):
        if int(stats.get(key, 0)) <= 0:
            raise RuntimeError(f"Invalid reconstruction statistic {key}: {stats.get(key)}")
    textured = inspect_textured_obj(output / "rtabmap_textured" / "master" / "mesh.obj")
    if int(textured["mesh_vertices"]) <= 0 or int(textured["mesh_triangles"]) <= 0:
        raise RuntimeError("Native RTAB-Map textured mesh is empty")
    metrics = json.loads((output / "evaluation" / "trajectory_metrics.json").read_text(encoding="utf-8"))
    if int(metrics.get("optimized", {}).get("associated_poses", 0)) <= 0:
        raise RuntimeError("Optimized trajectory has no associated poses")
    evo = json.loads((output / "evaluation" / "evo_crosscheck.json").read_text(encoding="utf-8"))
    if not evo.get("within_1e-5_tolerance", False):
        raise RuntimeError(f"Project trajectory metrics disagree with evo: {evo}")
    if args.require_web_demo:
        demo = Path("web/public/demos/freiburg3_long_office_household")
        for name in ("demo.mp4", "scene.glb", "trajectory.json", "metadata.json", "thumbnail.webp", "attribution.txt"):
            _require_file(demo / name)
        trajectory = json.loads((demo / "trajectory.json").read_text(encoding="utf-8"))
        metadata = json.loads((demo / "metadata.json").read_text(encoding="utf-8"))
        values = [*trajectory.get("samples", []), metadata]
        if not values or "samples" not in trajectory:
            raise RuntimeError("Web trajectory is empty")
        def finite(value: object) -> bool:
            if isinstance(value, dict): return all(finite(item) for item in value.values())
            if isinstance(value, list): return all(finite(item) for item in value)
            return not isinstance(value, float) or math.isfinite(value)
        if not finite(values):
            raise RuntimeError("Web artifacts contain NaN/Inf")
        inspect_textured_glb(demo / "scene.glb")
    print(f"Validated benchmark artifacts: {output}")


if __name__ == "__main__":
    main()
