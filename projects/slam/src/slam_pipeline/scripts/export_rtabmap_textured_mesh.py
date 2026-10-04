"""Create the production UV-textured mesh directly with RTAB-Map."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

import yaml

from ..reconstruction.textured_mesh import inspect_textured_obj, write_stats, write_texture_overview


DEFAULTS: dict[str, object] = {
    "poisson_size_m": 0.02, "max_polygons": 350000, "min_cluster": 500,
    "min_range_m": 0.3, "max_range_m": 5.0, "decimation": 2, "voxel_m": 0.01,
    "edge_bleeding_error_m": 0.02, "texture_size": 4096, "texture_count": 2,
    "texture_range_m": 4.0, "texture_angle_deg": 75, "texture_depth_error_m": 0.03,
    "texture_blur": 50, "gain": 1, "low_gain": 0, "high_gain": 10,
}


def _rtabmap_version(binary: str) -> tuple[str, bool]:
    output = subprocess.run([binary, "--version"], check=False, capture_output=True, text=True).stdout
    version = next((line.strip() for line in output.splitlines() if line.startswith("RTAB-Map:")), "unknown")
    alicevision = any("With Alice Vision:" in line and "true" in line.lower() for line in output.splitlines())
    return version, alicevision


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Root containing master/ and web/ assets")
    args = parser.parse_args()
    if not args.database.is_file() or args.database.stat().st_size == 0:
        raise FileNotFoundError(args.database)
    binary = shutil.which("rtabmap-export")
    if binary is None:
        raise RuntimeError("rtabmap-export is required for native textured reconstruction")
    config = yaml.safe_load(args.config.read_text(encoding="utf-8")) or {}
    settings = {**DEFAULTS, **config.get("rtabmap_textured_mesh", {})}
    master = args.output / "master"
    master.mkdir(parents=True, exist_ok=True)
    command = [
        binary, "--mesh", "--texture", "--output", "mesh", "--output_dir", str(master), "--opt", "0",
        "--poisson_size", str(settings["poisson_size_m"]), "--max_polygons", str(settings["max_polygons"]),
        "--min_cluster", str(settings["min_cluster"]), "--min_range", str(settings["min_range_m"]),
        "--max_range", str(settings["max_range_m"]), "--decimation", str(settings["decimation"]),
        "--voxel", str(settings["voxel_m"]), "--edge_bleeding_error", str(settings["edge_bleeding_error_m"]),
        "--texture_size", str(settings["texture_size"]), "--texture_count", str(settings["texture_count"]),
        "--texture_range", str(settings["texture_range_m"]), "--texture_angle", str(settings["texture_angle_deg"]),
        "--texture_depth_error", str(settings["texture_depth_error_m"]), "--texture_blur", str(settings["texture_blur"]),
        "--gain", str(settings["gain"]), "--low_gain", str(settings["low_gain"]), "--high_gain", str(settings["high_gain"]), str(args.database),
    ]
    subprocess.run(command, check=True)
    # rtabmap-export appends `_mesh` to its output base name. Normalize the
    # public master contract without renaming the texture images referenced by
    # the material file.
    generated_obj = master / "mesh_mesh.obj"
    generated_mtl = master / "mesh_mesh.mtl"
    if not generated_obj.is_file() or not generated_mtl.is_file():
        raise RuntimeError(f"RTAB-Map did not produce a textured OBJ/MTL in {master}")
    obj = master / "mesh.obj"
    mtl = master / "mesh.mtl"
    obj.write_text(
        generated_obj.read_text(encoding="utf-8", errors="replace").replace("mtllib mesh_mesh.mtl", "mtllib mesh.mtl", 1),
        encoding="utf-8",
    )
    shutil.copy2(generated_mtl, mtl)
    stats = inspect_textured_obj(obj)
    version, alicevision = _rtabmap_version(binary)
    stats.update({
        "backend": "rtabmap_textured_mesh", "rtabmap_version": version,
        "alicevision_multiband_available": alicevision,
        "texturing": "standard_gain_compensated_blending",
        "settings": settings, "database": str(args.database), "command": command,
    })
    write_texture_overview(obj, master / "preview.png")
    write_stats(master / "reconstruction_stats.json", stats)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
