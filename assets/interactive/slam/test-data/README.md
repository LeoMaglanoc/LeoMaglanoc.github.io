# TUM RGB-D regression data

Raw TUM RGB-D frames and generated videos are ignored by Git. This keeps the website repository lightweight while preserving a reproducible test path.

The recommended sequences are:

- `freiburg1_room` for the main initialization, tracking, and trajectory regression.
- `freiburg2_large_with_loop` as the longer stress sequence.

Download them with:

```bash
python3 scripts/download_tum.py freiburg1_room
python3 scripts/download_tum.py freiburg2_large_with_loop
```

Then create an ordered MP4 from the official `rgb.txt` timestamps:

```bash
python3 scripts/make_video.py tum-fr1-room/source tum-fr1-room/fr1_room.mp4
python3 scripts/make_manifest.py tum-fr1-room/source tum-fr1-room/fr1_room.json
```

The browser's **Developer inputs** panel accepts the resulting MP4 or the ordered image files. The manifest preserves TUM timestamps and avoids relying on filesystem ordering for an algorithm-level harness. During a replay, use **Download pose trace** to export frame-level tracking, pose, feature, and map-point telemetry.
