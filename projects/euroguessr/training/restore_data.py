"""Restore only the checkpoint's exact image IDs, without redownloading metadata."""

import argparse, json, hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from prepare import DATA, index, fetch

p = argparse.ArgumentParser()
p.add_argument(
    "--manifest",
    type=Path,
    default=Path(__file__).resolve().parents[1] / "checkpoints/current/manifest.json",
)
p.add_argument("--shards", type=int, default=1)
args = p.parse_args()
rows = json.loads(args.manifest.read_text())
DATA.mkdir(exist_ok=True)
(DATA / "images").mkdir(exist_ok=True)
for split in ["train", "test"]:
    entries = {}
    for shard in range(args.shards):
        entries.update(index(split, shard))
    selected = [r for r in rows if r["source_split"] == split]
    missing = [r["id"] for r in selected if r["id"] not in entries]
    if missing:
        raise ValueError(
            f"{len(missing)} IDs not found; pass the original --shards count"
        )
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = [pool.submit(fetch, (r, entries[r["id"]])) for r in selected]
        for i, future in enumerate(as_completed(jobs)):
            future.result()
            if (i + 1) % 100 == 0:
                print(split, i + 1, "/", len(selected), flush=True)
checksum_path = args.manifest.parent / "image-sha256.json"
if checksum_path.exists():
    expected = json.loads(checksum_path.read_text())
    for row in rows:
        actual = hashlib.sha256(
            (DATA / "images" / f"{row['id']}.jpg").read_bytes()
        ).hexdigest()
        if expected[row["id"]] != actual:
            raise ValueError(f"Restored image differs from checkpoint: {row['id']}")
(DATA / "manifest.json").write_text(json.dumps(rows, indent=2))
