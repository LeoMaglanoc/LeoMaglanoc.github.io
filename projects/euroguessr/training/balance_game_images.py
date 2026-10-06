"""Expand country coverage using legacy holdouts only; preserve existing photos.

Run in the research Docker image. Does not use validation, fresh-test, training,
or model predictions to choose photos. Existing fixture image remains unchanged.
"""
import hashlib
import io
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from PIL import Image
from prepare import ROOT, DATA, REVISION, index, source_bytes
from teacher_common import atomic_json


def main():
    pack = json.loads((ROOT / "rounds.json").read_text())
    legacy = [r for r in json.loads((DATA / "manifest.json").read_text())
              if r.get("cohort") == "legacy-inspected" and r["split"] == "test"]
    legacy_ids = {r["id"] for r in legacy}
    assert all(p["id"] in legacy_ids for p in pack)
    counts = Counter(p["country"] for p in pack)
    used = {p["id"] for p in pack}
    selected = []
    for country in sorted({r["country"] for r in legacy}):
        candidates = sorted((r for r in legacy if r["country"] == country and r["id"] not in used),
                            key=lambda r: hashlib.sha256(("game-balance-v2:" + r["id"]).encode()).hexdigest())
        selected.extend(candidates[:max(0, 2 - counts[country])])
    entries = index("test", 0)
    assert all(r["id"] in entries for r in selected)

    def export(pair):
        n, row = pair
        original = source_bytes(row, entries[row["id"]])
        image = Image.open(io.BytesIO(original)).convert("RGB")
        size = image.size
        image.thumbnail((1600, 1600))
        path = ROOT / "images" / f"round-{n:03d}.jpg"
        image.save(path, format="JPEG", quality=90, optimize=True)
        photo = {"image": path.relative_to(ROOT).as_posix(), "id": row["id"],
                 "lat": float(row["latitude"]), "lon": float(row["longitude"]),
                 "country": row["country"], "creator": row["creator_username"],
                 "source": f"https://www.mapillary.com/app/?pKey={row['id']}&focus=photo",
                 "license": "CC BY-SA 4.0", "split": "test",
                 "modified": "aspect ratio preserved; maximum 1600 px without upscaling; JPEG quality 90",
                 "original_dimensions": list(size), "exported_dimensions": list(image.size)}
        proof = {"id": row["id"], "source_sha256": hashlib.sha256(original).hexdigest(),
                 "exported_sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}
        print(row["country"], row["id"], size, flush=True)
        return photo, proof

    with ThreadPoolExecutor(max_workers=6) as pool:
        additions = list(pool.map(export, enumerate(selected, len(pack))))
    pack.extend(photo for photo, _ in additions)
    atomic_json(pack, ROOT / "rounds.json")
    report_path = ROOT / "docs/game-photo-balance.json"
    previous = json.loads(report_path.read_text()) if report_path.exists() else {}
    proofs = {p["id"]: p for p in previous.get("additions", []) if p["id"] in {r["id"] for r in pack}}
    proofs.update({proof["id"]: proof for _, proof in additions})
    atomic_json({"dataset_revision": REVISION, "cohort": "legacy-inspected test only",
                 "selection": "SHA256 game-balance-v2:id order; at least two per country where available; preserve existing photos",
                 "photos": len(pack), "countries": dict(sorted(Counter(p["country"] for p in pack).items())),
                 "additions": list(proofs.values())}, report_path)


if __name__ == "__main__":
    main()
