# Continuation checkpoints

## Released inference baseline (immutable)

`public/php-release/student.onnx`: 13,841,549 bytes, SHA-256 `e426c4206181d511b838c76efc48e43636299b76cb5a15183977011589931628`.

`public/php-release/depth_backbone.onnx`: 105,240 bytes, SHA-256 `5b22466a218944e3b0ab0f4f82a910e3eec35375ee03e7fb94eb65fa88431b56`.

The exact pair is also in the published application. Model metadata is embedded in ONNX; native fixtures and the controller preserve its observation/action contract. Never overwrite these files when experimenting. `npm test` validates their hashes.

Upstream source pin, Holosoma terrain pin and npm dependencies are in `upstream.json` and `package-lock.json`. Complete copied scene inputs and native fixtures are tracked. The original browser baseline test/build log is locally retained under ignored `artifacts/baseline/`; essential results are summarized in the tracked validation report. Git commits serve as source/build milestones.

## Future model experiments

1. Branch from this integration checkpoint. Keep the released assets as the comparison baseline.
2. Obtain a real training checkpoint and its experiment config from the researchers, or explicitly start a new training run. The official student-assets-v1 release contains no optimizer state or raw training checkpoint.
3. Save model, optimizer, scheduler, step/epoch, RNG state, replay/dataset version, terrain and robot configs, source revisions, dependency/container digests and training metrics under an experiment ID outside static published assets. Save periodically and on interruption. Do not claim resumability unless reloading all required state is tested.
4. Export candidate policy + depth pair into a separate directory with SHA-256 manifests and the full observation/sensor contract. Default published models must remain the released pair until explicitly approved.
5. Compare native fixtures, full course success/fall rates across repeated seeds/commands, depth timing, inference latency and phone performance. Record failures as well as successes.
6. Keep ONNX exports below GitHub file limits. Large training checkpoints belong in an appropriate artifact store, with a tracked retrieval manifest, version and checksum.

For local inference experiments the retained upstream query options `policy`, `depthPolicy` and `layout` can select a separately hosted compatible pair. They are debugging facilities, not proof that a different model satisfies the released contract.

## Rebuilding terrain

`docker run --rm -v "$PWD":/work -w /work/projects/g1-parkour python:3.10-slim python scripts/import-release-terrain.py`

The exact source OBJ and upstream finish-gate template are tracked. The script checks closed components, preserves original geometry, and recreates the same terrain include and finish-only export. Follow with the Docker contract suite. It does not create new obstacles.

## Git milestones

- `9c6c43f` — isolated simulator, released models and initial integration checkpoint.
- `parkour-release-baseline-2026-10-09` — tag for that baseline.
- `parkour-v1-validated-2026-10-09` — final integration, documentation and test evidence tag.

These tags pin source and inference assets. They do not imply a new training run or a full-course success rate.
