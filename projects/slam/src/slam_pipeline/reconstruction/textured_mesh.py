"""Small, dependency-free inspectors for RTAB-Map textured OBJ exports."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import cv2
import numpy as np


def _obj_material_file(obj_path: Path) -> Path:
    for line in obj_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("mtllib "):
            path = obj_path.parent / line.split(maxsplit=1)[1].strip()
            if path.is_file():
                return path
    raise RuntimeError(f"Textured OBJ has no readable material library: {obj_path}")


def texture_paths(obj_path: Path) -> list[Path]:
    """Return base-color images referenced by an OBJ material library."""
    material = _obj_material_file(obj_path)
    paths: list[Path] = []
    for line in material.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("map_Kd "):
            path = obj_path.parent / line.split(maxsplit=1)[1].strip()
            if not path.is_file() or path.stat().st_size == 0:
                raise RuntimeError(f"Missing or empty texture referenced by {material}: {path}")
            paths.append(path)
    if not paths:
        raise RuntimeError(f"No base-color texture (map_Kd) found in {material}")
    return paths


def inspect_textured_obj(obj_path: Path) -> dict[str, object]:
    """Validate geometry, UVs, materials and images without Open3D fallbacks."""
    vertices: list[list[float]] = []
    normals = 0
    texcoords = 0
    triangles = 0
    uv_faces = 0
    for line in obj_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("v "):
            fields = line.split()
            if len(fields) < 4:
                raise RuntimeError(f"Malformed vertex in {obj_path}: {line}")
            vertices.append([float(value) for value in fields[1:4]])
        elif line.startswith("vn "):
            normals += 1
        elif line.startswith("vt "):
            texcoords += 1
        elif line.startswith("f "):
            fields = line.split()[1:]
            if len(fields) < 3:
                raise RuntimeError(f"Malformed face in {obj_path}: {line}")
            triangles += len(fields) - 2
            if all("/" in field and field.split("/")[1] for field in fields):
                uv_faces += len(fields) - 2
    points = np.asarray(vertices, dtype=np.float64)
    if not len(points) or triangles <= 0 or texcoords <= 0 or uv_faces <= 0:
        raise RuntimeError("Native export is not a non-empty UV-textured mesh")
    if not np.isfinite(points).all():
        raise RuntimeError("Textured mesh contains NaN/Inf vertices")
    textures = texture_paths(obj_path)
    texture_details = []
    for texture in textures:
        image = cv2.imread(str(texture), cv2.IMREAD_COLOR)
        if image is None or image.size == 0:
            raise RuntimeError(f"Texture is not loadable: {texture}")
        texture_details.append({"path": str(texture), "width": int(image.shape[1]), "height": int(image.shape[0]), "bytes": texture.stat().st_size})
    bounds = np.stack([points.min(axis=0), points.max(axis=0)])
    result: dict[str, object] = {
        "mesh_vertices": int(len(points)), "mesh_triangles": triangles,
        "normal_count": normals, "uv_count": texcoords, "uv_triangle_count": uv_faces,
        "bounding_box_min": bounds[0].tolist(), "bounding_box_max": bounds[1].tolist(),
        "bounding_box_size": (bounds[1] - bounds[0]).tolist(),
        "texture_count": len(textures), "textures": texture_details,
        "obj_path": str(obj_path), "mtl_path": str(_obj_material_file(obj_path)),
    }
    if not all(math.isfinite(float(value)) for value in bounds.ravel()):
        raise RuntimeError("Textured mesh bounding box is not finite")
    return result


def write_texture_overview(obj_path: Path, output: Path) -> None:
    """Write a faithful contact sheet of generated texture atlases for review."""
    images = [cv2.imread(str(path), cv2.IMREAD_COLOR) for path in texture_paths(obj_path)]
    if any(image is None for image in images):
        raise RuntimeError("Could not read generated texture atlas")
    width, height = 1200, 675
    previews = [cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA) for image in images]
    overview = np.vstack(previews)
    if not cv2.imwrite(str(output), overview):
        raise RuntimeError(f"Could not write texture overview: {output}")


def write_stats(path: Path, stats: dict[str, object]) -> None:
    path.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
