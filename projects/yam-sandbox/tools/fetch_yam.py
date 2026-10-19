"""Download exactly the public MIT-licensed YAM MJCF and its mesh assets.

No Dream Labs account, code, hardware drivers or policy is needed.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen

# MuJoCo Menagerie main as of 2026-10-19; deliberately pinned.
REV = "62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35"
API = f"https://api.github.com/repos/google-deepmind/mujoco_menagerie/contents/i2rt_yam"
BASE = f"https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/{REV}/i2rt_yam"
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets" / "i2rt_yam"


def get_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "dream-yam-sim/0.1", "Accept": "application/vnd.github+json"})
    with urlopen(req, timeout=45) as response:
        return response.read()


def fetch(destination: Path = DEST) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    assets_dir = destination / "assets"
    assets_dir.mkdir(exist_ok=True)

    listing = json.loads(get_bytes(f"{API}/assets?ref={REV}"))
    files = [("yam.xml", destination / "yam.xml"), ("LICENSE", destination / "LICENSE")]
    for item in listing:
        if item["type"] != "file":
            continue  # Other model variants live in subdirectories; yam.xml uses root meshes.
        name = item["name"]
        if Path(name).name != name:
            raise ValueError(f"Unsafe filename: {name}")
        files.append((f"assets/{name}", assets_dir / name))

    for relative, local in files:
        if local.is_file() and local.stat().st_size > 0:
            print(f"[cached] {relative}")
            continue
        blob = get_bytes(f"{BASE}/{relative}")
        if not blob:
            raise ValueError(f"Empty download: {relative}")
        # Atomic writes avoid incorrectly treating interrupted downloads as cached.
        fd, temp_path = tempfile.mkstemp(dir=local.parent)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(blob)
            os.replace(temp_path, local)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        print(f"[saved] {relative} ({len(blob):,} bytes)")

    print(f"\nDownloaded the official YAM model to {destination}")
    print(f"MIT license: {destination / 'LICENSE'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEST)
    args = parser.parse_args()
    fetch(args.output)
