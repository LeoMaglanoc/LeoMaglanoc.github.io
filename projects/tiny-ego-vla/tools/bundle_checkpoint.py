"""Self-contained local continuation bundle. Never add this archive to Git.
Contains exact code/config, trainable weights, frozen encoder, cached feature arrays,
pseudo-labels, run metrics and raw rollouts. Raw source videos/HDF5 remain separate.
"""

from common import *
import tarfile, datetime


def bundle():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = ART / f"TinyEgoVLA-continuation-{stamp}.tar.gz"
    entries = []
    for folder in [PROJECT / "tools", PROJECT / "configs", CKPT]:
        entries.extend(
            p for p in folder.rglob("*") if p.is_file() and "__pycache__" not in p.parts
        )
    entries.extend(DATA.glob("*_embeddings.npz"))
    entries.extend(DATA.glob("*_demo_*.npz"))
    entries.extend(DATA.glob("*_labels.json"))
    for name in [
        "README.md",
        "EXPERIMENTS.md",
        "requirements.txt",
        "environment-lock.txt",
        "data-manifest.json",
        "integrity-report.json",
        "sim-parity-report.json",
        "checkpoint-audit.json",
        "results-summary.json",
        "VALIDATION.md",
    ]:
        p = PROJECT / name
        if p.exists():
            entries.append(p)
    entries.extend(p for p in (ART / "rollouts").rglob("*") if p.is_file())
    entries.extend(p for p in ART.glob("*.json") if "bundle" not in p.name)
    manifest = {
        "created_utc": stamp,
        "git_commit": revision(),
        "files": [
            {
                "path": str(p.relative_to(PROJECT)),
                "bytes": p.stat().st_size,
                "sha256": sha(p),
            }
            for p in sorted(set(entries))
        ],
    }
    save_json(ART / "continuation-manifest.json", manifest)
    entries.append(ART / "continuation-manifest.json")
    with tarfile.open(path, "w:gz", compresslevel=1) as archive:
        for p in sorted(set(entries)):
            archive.add(p, arcname=str(p.relative_to(PROJECT)), recursive=False)
    record = {
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha(path),
        "created_utc": stamp,
        "git_commit": revision(),
        "files": len(entries),
        "restore": "Extract into a separate TinyEgoVLA project folder, verify continuation-manifest.json, recreate the pinned environment, then use --resume. Raw source datasets can be restored with tools/prepare.py.",
    }
    save_json(PROJECT / "checkpoint-record.json", record)
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    bundle()
