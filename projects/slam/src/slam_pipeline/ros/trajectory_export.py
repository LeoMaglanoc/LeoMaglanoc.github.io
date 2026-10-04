"""Compatibility CLI for official RTAB-Map trajectory export."""

from __future__ import annotations

import argparse
from pathlib import Path

from ..rtabmap.export import export_rtabmap_trajectory


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--optimization", choices=("full", "raw"), default="full")
    args = parser.parse_args()
    timestamps, _, _ = export_rtabmap_trajectory(
        args.database, args.output, optimization=args.optimization
    )
    print(f"Exported {len(timestamps)} poses to {args.output}")


if __name__ == "__main__":
    main()
