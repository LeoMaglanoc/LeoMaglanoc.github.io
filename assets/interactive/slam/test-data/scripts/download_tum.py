#!/usr/bin/env python3
"""Download one official TUM RGB-D sequence into the local ignored test-data tree."""

from __future__ import annotations

import argparse
import shutil
import tarfile
import urllib.request
from pathlib import Path

SEQUENCES = {
    "freiburg1_room": (
        "https://cvg.cit.tum.de/rgbd/dataset/freiburg1/rgbd_dataset_freiburg1_room.tgz",
        "tum-fr1-room",
    ),
    "freiburg2_large_with_loop": (
        "https://cvg.cit.tum.de/rgbd/dataset/freiburg2/rgbd_dataset_freiburg2_large_with_loop.tgz",
        "tum-fr2-large-loop",
    ),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sequence", choices=sorted(SEQUENCES))
    parser.add_argument("--output", type=Path, default=Path(__file__).parents[1])
    args = parser.parse_args()

    url, directory = SEQUENCES[args.sequence]
    target = args.output / directory
    target.mkdir(parents=True, exist_ok=True)
    archive = target / "source.tgz"
    print(f"Downloading {url}")
    with urllib.request.urlopen(url) as response, archive.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    print(f"Extracting into {target / 'source'}")
    with tarfile.open(archive) as tar:
        tar.extractall(target / "source", filter="data")
    print(f"Ready: {target}")


if __name__ == "__main__":
    main()
