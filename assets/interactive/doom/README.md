# AI Doom Deathmatch — feasibility implementation

This directory is a reproducible Phase 0–6 implementation of the requested Arnold Track-1 deployment path. It is **not a shipped browser demo**: the required legal and browser-environment gates remain open. See [docs/FEASIBILITY.md](docs/FEASIBILITY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The site intentionally has no `/doom/` route or homepage link until it can truthfully satisfy the complete plan.

```text
UPSTREAM / LOCAL DOCKER ONLY

Arnold Track-1 PyTorch checkpoint
             │
             │ exact RGB + variables + LSTM state contract
             ▼
    arnold_track1.onnx (ignored; not redistributable)
             │
             ▼
 native ViZDoom reference trace (ignored)
             │
             ▼
 PyTorch ↔ ONNX parity validation

BLOCKED BEFORE BROWSER DEPLOYMENT

unverified Arnold/WAD redistribution rights
                 +
no tested browser engine capable of the Track-1 deathmatch
```

## Docker-only workflow

Run every command from this directory. Nothing is installed into the host Python or Node environment.

```bash
make build       # build the pinned local reproduction image
make inspect     # inspect checkpoint tensors and exact action order
make native      # run the upstream ./run.sh track1 --n_bots 10 in Xvfb
make export      # create an ignored, local ONNX derivative
```

Capture the reference trace and validate it:

```bash
docker compose run --rm doom-tools python tools/reference_rollout.py --steps 512
docker compose run --rm doom-tools python tools/validate_policy.py
docker compose run --rm doom-tools python tools/benchmark_policy.py
docker compose run --rm doom-tools pytest -q tests
```

The generated model and trace live under `models/` and `artifacts/` but are ignored by Git. Their checksums and provenance status are recorded in [models/policy_metadata.json](models/policy_metadata.json).

## What has been verified

- Exact upstream revision and SHA-256 checkpoint load in Docker.
- Native Track-1 configuration: `hist_size=4`, LSTM, frame skip 3, RGB 60×108 policy input, two game variables, and 35 discrete action combinations.
- Native one-agent-versus-ten-bot rollout produces movement, combat, kills, deaths, pickups, respawn, and varied actions.
- Explicit-state ONNX export has zero greedy-action mismatches across a 512-step native trace.
- Local Docker CPU ONNX benchmark: 1.69 ms median / 1.97 ms p95 for inference only; this is not browser or Android performance.

## What remains before any web UI is allowed

- Written redistribution permission or an explicit licence for Arnold source, weights, conversion, and scenario assets.
- A browser Doom implementation that passes an extended live closed-loop comparison against the native trace.
- Browser controls, AI/HUMAN/RESET state machine, mobile landscape UI, Web E2E/soak testing, and physical Android testing only after the model/environment can be legally and faithfully served.

No model training or fine-tuning occurs in this project.
