"""Export a metric RTAB-Map/Open3D run as static Three.js demo assets.

The conversion is deliberately performed here, once, rather than in browser
code. Both the GLB and trajectory use Three.js's Y-up coordinate convention.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import shutil
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import yaml
from scipy.spatial.transform import Rotation

from ..evaluation.trajectory import read_tum_trajectory
from ..reconstruction.textured_mesh import inspect_textured_obj, texture_paths
from .sync_web_video_metadata import video_details


_TUM_DATASET_URL = "https://cvg.cit.tum.de/data/datasets/rgbd-dataset"
_CV_TO_THREE = np.diag([1.0, -1.0, -1.0, 1.0])


def convert_pose_to_threejs(T_world_camera: np.ndarray) -> np.ndarray:
    """Convert a right-handed OpenCV/robotics pose to the shared web basis."""
    pose = np.asarray(T_world_camera, dtype=np.float64)
    if pose.shape != (4, 4) or not np.isfinite(pose).all():
        raise ValueError("Expected a finite 4x4 camera pose")
    return _CV_TO_THREE @ pose @ _CV_TO_THREE


def _finite(value: Any) -> bool:
    if isinstance(value, dict):
        return all(_finite(item) for item in value.values())
    if isinstance(value, list):
        return all(_finite(item) for item in value)
    return not isinstance(value, float) or math.isfinite(value)


def _asset_path(public_dir: Path, value: str) -> Path:
    path = public_dir / value
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"Required browser artifact missing or empty: {path}")
    return path


def _convert_obj_to_threejs(source: Path, destination: Path) -> None:
    """Apply the shared CV→Three basis while retaining OBJ UV/material data."""
    converted: list[str] = []
    for line in source.read_text(encoding="utf-8", errors="replace").splitlines():
        fields = line.split()
        if fields and fields[0] in {"v", "vn"} and len(fields) >= 4:
            values = [float(value) for value in fields[1:4]]
            tail = " " + " ".join(fields[4:]) if len(fields) > 4 else ""
            converted.append(f"{fields[0]} {values[0]:.9g} {-values[1]:.9g} {-values[2]:.9g}{tail}")
        else:
            converted.append(line)
    destination.write_text("\n".join(converted) + "\n", encoding="utf-8")


def _glb_document(path: Path) -> dict[str, Any]:
    with path.open("rb") as stream:
        header = stream.read(12)
        if len(header) != 12 or header[:4] != b"glTF":
            raise RuntimeError(f"Not a binary glTF: {path}")
        _, version, length = struct.unpack("<4sII", header)
        if version != 2 or length != path.stat().st_size:
            raise RuntimeError(f"Invalid GLB header: {path}")
        chunk_length, chunk_type = struct.unpack("<I4s", stream.read(8))
        if chunk_type != b"JSON":
            raise RuntimeError(f"GLB has no JSON document: {path}")
        return json.loads(stream.read(chunk_length).decode("utf-8").rstrip(" \t\r\n\0"))


def inspect_textured_glb(path: Path) -> dict[str, int]:
    """Reject accidental vertex-color/untextured fallbacks in deployable GLB."""
    document = _glb_document(path)
    meshes, materials = document.get("meshes", []), document.get("materials", [])
    textures, images = document.get("textures", []), document.get("images", [])
    primitives = [primitive for mesh in meshes for primitive in mesh.get("primitives", [])]
    if not meshes or not primitives or not materials or not textures or not images:
        raise RuntimeError("GLB is missing mesh, material, texture, or image")
    if not all("TEXCOORD_0" in primitive.get("attributes", {}) for primitive in primitives):
        raise RuntimeError("GLB is missing TEXCOORD_0")
    used_materials = {primitive.get("material") for primitive in primitives}
    if None in used_materials or any(
        "baseColorTexture" not in materials[index].get("pbrMetallicRoughness", {}) for index in used_materials
    ):
        raise RuntimeError("GLB primitive does not have a texture-backed base-color material")
    accessors = document.get("accessors", [])
    triangles = 0
    for primitive in primitives:
        index = primitive.get("indices")
        count = int(accessors[index]["count"]) if index is not None else int(accessors[primitive["attributes"]["POSITION"]]["count"])
        triangles += count // 3
    return {"mesh_count": len(meshes), "primitive_count": len(primitives), "triangle_count": triangles, "texture_count": len(textures), "image_count": len(images)}


def _load_textured_web_mesh(output: Path, public: Path) -> tuple[Path, dict[str, object], dict[str, object]]:
    master = output / "rtabmap_textured" / "master"
    source, source_stats = master / "mesh.obj", master / "reconstruction_stats.json"
    if not source.is_file() or not source_stats.is_file():
        raise FileNotFoundError("Native RTAB-Map textured master mesh has not been generated")
    web = output / "rtabmap_textured" / "web"
    staged_obj, scene = web / "mesh.obj", web / "scene.glb"
    if not staged_obj.is_file() or not scene.is_file():
        raise FileNotFoundError("Run prepare_rtabmap_textured_web_mesh and the pinned web obj2gltf conversion first")
    staged_stats = inspect_textured_obj(staged_obj)
    glb_stats = inspect_textured_glb(scene)
    shutil.copy2(scene, public / "scene.glb")
    source_details = json.loads(source_stats.read_text(encoding="utf-8"))
    web_details: dict[str, object] = {**staged_stats, "glb_size_bytes": scene.stat().st_size, "glb": glb_stats, "source_master": str(source), "scene_path": str(scene)}
    (web / "web_reconstruction_stats.json").write_text(json.dumps(web_details, indent=2) + "\n", encoding="utf-8")
    return public / "scene.glb", source_details, web_details


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--public-dir", type=Path, required=True)
    args = parser.parse_args()

    config = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    output, public = args.output, args.public_dir
    public.mkdir(parents=True, exist_ok=True)
    textured_master = output / "rtabmap_textured" / "master"
    source_preview = textured_master / "preview.png"
    trajectory_source = output / "evaluation" / "optimized_trajectory.txt"
    for required in (source_preview, trajectory_source):
        if not required.is_file() or required.stat().st_size == 0:
            raise FileNotFoundError(required)

    scene_path, master_details, web_details = _load_textured_web_mesh(output, public)

    timestamps, poses = read_tum_trajectory(trajectory_source)
    first_timestamp = float(timestamps[0])
    samples = []
    for timestamp, pose in zip(timestamps, poses):
        converted = convert_pose_to_threejs(pose)
        quaternion = Rotation.from_matrix(converted[:3, :3]).as_quat()
        samples.append({
            "timestamp": float(timestamp - first_timestamp),
            "position": [float(value) for value in converted[:3, 3]],
            "quaternion": [float(value) for value in quaternion],
        })
    trajectory = {
        "units": "meters",
        "coordinate_convention": "threejs_world",
        "source": "rtabmap_global_pose_graph_optimized",
        "samples": samples,
    }
    if not samples or not _finite(trajectory):
        raise RuntimeError("Trajectory export is empty or non-finite")
    (public / "trajectory.json").write_text(json.dumps(trajectory, indent=2) + "\n", encoding="utf-8")

    image = cv2.imread(str(source_preview), cv2.IMREAD_COLOR)
    if image is None or not cv2.imwrite(str(public / "thumbnail.webp"), image, [cv2.IMWRITE_WEBP_QUALITY, 82]):
        raise RuntimeError("Could not write thumbnail.webp")
    metrics = json.loads((output / "evaluation" / "trajectory_metrics.json").read_text(encoding="utf-8"))
    graph = json.loads((output / "graph_stats.json").read_text(encoding="utf-8"))
    replay = json.loads((output / "replay_summary.json").read_text(encoding="utf-8"))
    video_info_path = output / "rgb_video_info.json"
    depth_video_info_path = output / "depth_video_info.json"
    if not video_info_path.is_file() or not depth_video_info_path.is_file():
        raise RuntimeError("Prepare RGB and depth videos with scripts/prepare_demo_video.sh before exporting the web demo")
    video_info = json.loads(video_info_path.read_text(encoding="utf-8"))
    depth_video_info = json.loads(depth_video_info_path.read_text(encoding="utf-8"))
    metadata = {
        "title": "TUM RGB-D — freiburg3_long_office_household",
        "dataset": {"name": "freiburg3_long_office_household", "family": "TUM RGB-D", "url": _TUM_DATASET_URL},
        "slam": {
            "input_frames": int(replay.get("published_rgb_frames", 0)),
            "odometry_poses": sum(1 for _ in (output / "odometry_poses.txt").open(encoding="utf-8")),
            "graph_nodes": int(graph.get("node_count", 0)), "graph_links": int(graph.get("link_count", 0)),
            "global_loop_closures": int(graph.get("global_loop_closure_count", 0)),
            "local_space_closures": int(graph.get("local_space_closure_count", 0)),
            "local_time_closures": int(graph.get("local_time_closure_count", 0)),
        },
        "accuracy": {
            "ate_rmse_m": float(metrics["optimized"]["ate_rmse_m"]),
            "rpe_translation_rmse_m": float(metrics["optimized"]["rpe_translation_rmse_m"]),
            "rpe_rotation_rmse_rad": float(metrics["optimized"]["rpe_rotation_rmse_rad"]),
        },
        "mesh": {
            "vertices": int(web_details["mesh_vertices"]), "triangles": int(web_details["mesh_triangles"]),
            "original_vertices": int(master_details["mesh_vertices"]), "original_triangles": int(master_details["mesh_triangles"]),
            "uv_count": int(web_details["uv_count"]),
        },
        "reconstruction": {
            "backend": "rtabmap_textured_mesh", "texturing": str(master_details["texturing"]),
            "alicevision_multiband_available": bool(master_details["alicevision_multiband_available"]),
            "texture_count": int(master_details["texture_count"]),
            "texture_resolution": max(int(item["width"]) for item in master_details["textures"]),
            "master_triangles": int(master_details["mesh_triangles"]), "web_triangles": int(web_details["mesh_triangles"]),
        },
        "video": video_details(video_info),
        "depth_video": {**video_details(depth_video_info), "visualization": "Turbo colorized metric depth; black pixels are invalid measurements."},
        "assets": {"video": "demo.mp4", "depth_video": "depth.mp4", "mesh": "scene.glb", "trajectory": "trajectory.json", "thumbnail": "thumbnail.webp"},
    }
    metadata["mesh"]["glb_size_bytes"] = scene_path.stat().st_size
    if not _finite(metadata):
        raise RuntimeError("Metadata contains a non-finite number")
    (public / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (public / "attribution.txt").write_text(
        "Canonical example: TUM RGB-D Dataset — freiburg3_long_office_household\n"
        f"Source: {_TUM_DATASET_URL}\n"
        "The official TUM RGB AVI and colorized TUM depth frames are transcoded for browser playback.\n",
        encoding="utf-8",
    )
    # Video probe data has been embedded in metadata; keep the public bundle
    # limited to the documented browser-facing files.
    video_info_path.unlink()
    depth_video_info_path.unlink()
    for asset in ("demo.mp4", "depth.mp4", "scene.glb", "trajectory.json", "metadata.json", "thumbnail.webp", "attribution.txt"):
        _asset_path(public, asset)
    print(json.dumps({"public_dir": str(public), "trajectory_samples": len(samples), "glb_size_bytes": scene_path.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
