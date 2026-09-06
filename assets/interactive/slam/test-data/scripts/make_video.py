#!/usr/bin/env python3
"""Create a deterministic 30 fps MP4 from a TUM RGB-D directory."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Extracted sequence directory containing rgb.txt")
    parser.add_argument("output", type=Path)
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()

    rgb_txt = args.source / "rgb.txt"
    if not rgb_txt.exists():
        nested = next(args.source.glob("*/rgb.txt"), None)
        if nested is None:
            raise SystemExit(f"Could not find rgb.txt below {args.source}")
        args.source = nested.parent

    frames = args.output.parent / f"{args.output.stem}-frames"
    frames.mkdir(parents=True, exist_ok=True)
    entries = [line.split() for line in (args.source / "rgb.txt").read_text().splitlines() if line and not line.startswith("#")]
    for index, (_, filename) in enumerate(entries):
        destination = frames / f"{index:06d}.png"
        if not destination.exists():
            destination.symlink_to((args.source / filename).resolve())

    args.output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-y", "-framerate", str(args.fps), "-i", str(frames / "%06d.png"),
        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(args.output)
    ], check=True)
    print(f"Wrote {args.output} from {len(entries)} ordered RGB frames")


if __name__ == "__main__":
    main()
