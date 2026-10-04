"""Wait until an RTAB-Map database has stopped gaining graph nodes."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from ..rtabmap.database import inspect_database


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--stable-polls", type=int, default=5)
    parser.add_argument("--poll-s", type=float, default=1.0)
    parser.add_argument("--timeout-s", type=float, default=90.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.stable_polls < 1 or args.poll_s <= 0 or args.timeout_s <= 0:
        raise ValueError("stable-polls, poll-s, and timeout-s must be positive")

    deadline = time.monotonic() + args.timeout_s
    previous_count: int | None = None
    stable_polls = 0
    observations: list[dict[str, int | float | None]] = []
    while time.monotonic() < deadline:
        try:
            stats = inspect_database(args.database)
        except (FileNotFoundError, OSError):
            time.sleep(args.poll_s)
            continue
        observations.append(stats)
        count = int(stats["node_count"])
        if count > 0 and count == previous_count:
            stable_polls += 1
        else:
            stable_polls = 0
        previous_count = count
        if count > 0 and stable_polls >= args.stable_polls:
            result = {
                "stable": True,
                "stable_polls": stable_polls,
                "node_count": count,
                "elapsed_s": args.timeout_s - max(0.0, deadline - time.monotonic()),
                "database": stats,
            }
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(result, indent=2))
            return
        time.sleep(args.poll_s)
    raise TimeoutError(f"RTAB-Map database did not become stable within {args.timeout_s}s")


if __name__ == "__main__":
    main()
