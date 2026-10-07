"""Self-contained local continuation bundle. Never add this archive to Git.
Contains exact code/config, trainable weights, frozen encoder, cached feature arrays,
pseudo-labels, run metrics and raw rollouts. Raw source videos/HDF5 remain separate.
"""

from common import *
import tarfile, datetime


def snapshot_training_sources():
    core = {
        "common.py",
        "models.py",
        "datasets.py",
        "train_ego.py",
        "train_robot_bc.py",
    }
    needed = {
        (name, digest)
        for metric in CKPT.glob("*/metrics.json")
        for name, digest in json.loads(metric.read_text())["provenance"][
            "source_sha256"
        ].items()
        if name in core
    }
    entries, records = [], []
    for name, digest in sorted(needed):
        relative = str((PROJECT / "tools" / name).relative_to(ROOT))
        revisions = subprocess.check_output(
            ["git", "log", "--format=%H", "--", relative], cwd=ROOT, text=True
        ).splitlines()
        for revision in revisions:
            blob = subprocess.check_output(
                ["git", "show", f"{revision}:{relative}"], cwd=ROOT
            )
            if hashlib.sha256(blob).hexdigest() == digest:
                path = ART / "training-sources" / digest / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(blob)
                entries.append(path)
                records.append(
                    {
                        "file": name,
                        "sha256": digest,
                        "git_commit": revision,
                        "snapshot": str(path.relative_to(PROJECT)),
                    }
                )
                break
        else:
            raise ValueError(
                f"Exact original training source missing from Git: {name} {digest}"
            )
    save_json(ART / "training-source-manifest.json", records)
    return entries


def bundle():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = ART / f"TinyEgoVLA-continuation-{stamp}.tar.gz"
    entries = snapshot_training_sources()
    for folder in [
        PROJECT / "tools",
        PROJECT / "configs",
        PROJECT / "validation",
        CKPT,
    ]:
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
        "rollout-audit.json",
        "resume-audit.json",
        "human-media-audit.json",
        "human-prediction-audit.json",
        "media-audit.json",
        "results-summary.json",
        "VALIDATION.md",
    ]:
        p = PROJECT / name
        if p.exists():
            entries.append(p)
    entries.extend(p for p in (ART / "rollouts").rglob("*") if p.is_file())
    entries.extend(
        p
        for p in ART.glob("*.json")
        if "bundle" not in p.name and p.name != "continuation-manifest.json"
    )
    entries.extend(
        p for p in ART.glob("*.log") if p.stat().st_size and "bundle" not in p.name
    )
    entries.extend(ART.glob("*.jpg"))
    if (ART / "demonstration.mp4").exists():
        entries.append(ART / "demonstration.mp4")
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
