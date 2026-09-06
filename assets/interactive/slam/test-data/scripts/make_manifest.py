#!/usr/bin/env python3
"""Create an ordered JSON frame manifest from a TUM RGB-D sequence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Extracted TUM sequence directory")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    rgb_txt = args.source / "rgb.txt"
    if not rgb_txt.exists():
        nested = next(args.source.glob("*/rgb.txt"), None)
        if nested is None:
            raise SystemExit(f"Could not find rgb.txt below {args.source}")
        args.source = nested.parent

    frames = []
    for line in (args.source / "rgb.txt").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        timestamp, filename = line.split(maxsplit=1)
        frames.append({"timestamp": float(timestamp), "file": str(args.source / filename)})

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"source": str(args.source), "frames": frames}, indent=2) + "\n")
    print(f"Wrote {args.output} with {len(frames)} ordered RGB frames")


if __name__ == "__main__":
    main()
