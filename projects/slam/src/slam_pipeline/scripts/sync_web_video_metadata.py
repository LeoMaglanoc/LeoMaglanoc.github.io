"""Synchronize browser-video details into an existing web demo manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def video_details(info: dict) -> dict:
    stream = next((entry for entry in info.get("streams", []) if entry.get("codec_name") == "h264"), {})
    return {
        "duration_s": float(info.get("format", {}).get("duration", 0.0)),
        "width": int(stream.get("width", 0)),
        "height": int(stream.get("height", 0)),
        "codec": stream.get("codec_name"),
        "framerate": stream.get("r_frame_rate"),
    }


def sync_metadata(metadata_path: Path, rgb_info_path: Path, depth_info_path: Path) -> None:
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    rgb_info = json.loads(rgb_info_path.read_text(encoding="utf-8"))
    depth_info = json.loads(depth_info_path.read_text(encoding="utf-8"))
    metadata["video"] = video_details(rgb_info)
    metadata["depth_video"] = {
        **video_details(depth_info),
        "visualization": "Turbo colorized metric depth; black pixels are invalid measurements.",
    }
    metadata.setdefault("assets", {})["depth_video"] = "depth.mp4"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--rgb-info", type=Path, required=True)
    parser.add_argument("--depth-info", type=Path, required=True)
    args = parser.parse_args()
    sync_metadata(args.metadata, args.rgb_info, args.depth_info)


if __name__ == "__main__":
    main()
