#!/usr/bin/env python3
"""Run from committed sources; record all outputs and source/config hashes."""

import hashlib
import json
import pathlib
import subprocess
import sys
import datetime
import tomllib

root = pathlib.Path(__file__).resolve().parents[1]
config, output = sys.argv[1:3]


def git(*args):
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


sources = sorted(
    [
        *root.glob("src/**/*.rs"),
        *root.glob("configs/*.toml"),
        root / "Cargo.lock",
        root / "Cargo.toml",
        *root.glob("scripts/*.py"),
    ]
)
if any(git("status", "--porcelain", "--", str(p)) for p in sources):
    raise SystemExit(
        "Commit experiment sources/configs before running so provenance identifies exact source."
    )
out = root / output
if out.exists():
    raise SystemExit("Choose a new output directory; experiment outputs are immutable.")
out.mkdir(parents=True)
metadata = dict(
    git_commit=git("rev-parse", "HEAD"),
    started_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    training_started_from="random initialization",
    architecture="72 → 64 ReLU → (108 logits, 1 tanh); Burn Flex f32",
    training_seed=tomllib.loads((root / config).read_text())["seed"],
    checkpoint_generation=0,
    config=config,
    development_seed=90210,
    holdout_seed=78123,
    checkpoint_selection="Every 5 generations: promote above 55% in paired development arena; final representative round-robin tournament",
    source_hashes={str(p.relative_to(root)): sha(p) for p in sources},
)
(out / "run-metadata.json").write_text(json.dumps(metadata, indent=2))


def run(*args):
    for relative, expected in metadata["source_hashes"].items():
        if sha(root / relative) != expected:
            raise SystemExit(f"Experiment source changed during run: {relative}")
    subprocess.run(
        [
            "docker",
            "compose",
            "run",
            "--rm",
            "rustzero",
            "cargo",
            "run",
            "--locked",
            "--release",
            "--features",
            "training",
            "--bin",
            *args,
        ],
        cwd=root,
        check=True,
    )


run("train", "--", config, output)
run("tournament", "--", output)
run(
    "evaluate",
    "--",
    output,
    f"{output}/metrics/holdout.json",
    sys.argv[3] if len(sys.argv) > 3 else "400",
)
run(
    "fixture",
    "--",
    f"{output}/champion.json",
    f"{output}/metrics/inference-fixture.json",
)
metadata.update(
    training_seed=json.loads((out / "config.json").read_text())["seed"],
    checkpoint_generation=json.loads((out / "champion.json").read_text())["generation"],
    completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
)
for relative, expected in metadata["source_hashes"].items():
    if sha(root / relative) != expected:
        raise SystemExit(f"Experiment source changed during run: {relative}")
metadata["artifact_hashes"] = {
    str(p.relative_to(out)): sha(p)
    for p in sorted(out.rglob("*"))
    if p.is_file() and p.name != "run-metadata.json"
}
(out / "run-metadata.json").write_text(json.dumps(metadata, indent=2))
