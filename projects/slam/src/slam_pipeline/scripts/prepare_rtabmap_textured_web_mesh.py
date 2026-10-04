"""Stage a native RTAB-Map OBJ/MTL mesh in the Three.js coordinate basis."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from ..reconstruction.textured_mesh import texture_paths
from .export_web_demo import _convert_obj_to_threejs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    master = args.output / "rtabmap_textured" / "master"
    source = master / "mesh.obj"
    if not source.is_file():
        raise FileNotFoundError(source)
    web = args.output / "rtabmap_textured" / "web"
    web.mkdir(parents=True, exist_ok=True)
    _convert_obj_to_threejs(source, web / "mesh.obj")
    shutil.copy2(master / "mesh.mtl", web / "mesh.mtl")
    for texture in texture_paths(source):
        shutil.copy2(texture, web / texture.name)
    print(web / "mesh.obj")


if __name__ == "__main__":
    main()
