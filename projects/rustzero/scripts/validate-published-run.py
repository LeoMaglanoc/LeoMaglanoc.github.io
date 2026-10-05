#!/usr/bin/env python3
import hashlib
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
web = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "web"
m = json.loads((web / "metrics/run-metadata.json").read_text())
assert m["training_started_from"] == "random initialization"
assert len(m["git_commit"]) == 40
for relative, expected in m["artifact_hashes"].items():
    p = web / relative
    assert p.is_file(), f"Missing {p}"
    assert hashlib.sha256(p.read_bytes()).hexdigest() == expected, f"Hash mismatch: {p}"
c = json.loads((web / "metrics/config.json").read_text())
w = json.loads((web / "models/final.json").read_text())
t = json.loads((web / "metrics/training.json").read_text())
h = json.loads((web / "metrics/holdout.json").read_text())
assert m["config"] in m["source_hashes"], "Training configuration source hash missing"
assert c["seed"] == w["seed"] == m["training_seed"]
assert w["generation"] == m["checkpoint_generation"]
assert w["steps"] == w["generation"] * c["steps"]
assert w["architecture"] == m["architecture"]
assert (
    len(t) == c["generations"] and t[-1]["global_step"] == c["generations"] * c["steps"]
)
assert m["development_seed"] != m["holdout_seed"] != m["training_seed"]
assert all(
    r["seed"] == m["holdout_seed"]
    and r["games"] % 2 == 0
    and r["wins"] + r["losses"] == r["games"]
    and r["wins_as_white"] + r["wins_as_black"] == r["wins"]
    and abs(r["win_rate"] - r["wins"] / r["games"]) < 1e-6
    and r["opening_protocol"].startswith("paired")
    for r in h
)
# Verify exact committed source independently of today's checkout.
for relative, expected in m["source_hashes"].items():
    data = subprocess.check_output(
        ["git", "show", f"{m['git_commit']}:projects/rustzero/{relative}"], cwd=root
    )
    assert hashlib.sha256(data).hexdigest() == expected, f"Source mismatch: {relative}"
print(
    f"PASS: generation {w['generation']}, {c['generations']} generations; provenance and artifact hashes agree"
)
