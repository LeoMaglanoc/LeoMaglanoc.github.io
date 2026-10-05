"""Aggregate consented, exported five-round matches; skill is externally verified."""

import argparse, json, math
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("files", nargs="+", type=Path)
args = p.parse_args()
matches = []
for path in args.files:
    data = json.loads(path.read_text())
    if data["schemaVersion"] != 1 or len(data["rounds"]) != 5:
        raise ValueError(f"Invalid match: {path}")
    if data["rules"] != {
        "region": "Europe",
        "rounds": 5,
        "seconds": 60,
        "movement": False,
        "score": "round(5000 * exp(-distance_km / 1500))",
    }:
        raise ValueError("Mixed rules")
    matches.append(data)
if len({(m["modelVersion"], m["modelManifest"], m["method"]) for m in matches}) != 1:
    raise ValueError("Mixed models")
win = sum(
    sum(r["aiScore"] for r in m["rounds"]) > sum(r["humanScore"] for r in m["rounds"])
    for m in matches
)
tie = sum(
    sum(r["aiScore"] for r in m["rounds"]) == sum(r["humanScore"] for r in m["rounds"])
    for m in matches
)
n = len(matches)
phat = win / n
z = 1.96
den = 1 + z * z / n
mid = (phat + z * z / (2 * n)) / den
half = z * math.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n)) / den
print(
    json.dumps(
        {
            "matches": n,
            "ai_wins": win,
            "ties": tie,
            "ai_win_rate": phat,
            "wilson_95_percent_interval": [mid - half, mid + half],
            "caution": "Participants and independence are unverified. Browser answers are inspectable. Not evidence about all humans.",
        },
        indent=2,
    )
)
