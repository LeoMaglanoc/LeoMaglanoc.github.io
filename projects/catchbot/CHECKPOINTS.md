# Checkpoints and continuation

This is frozen zero-shot inference, not training. There is no optimizer state,
fine-tuned model or invented training checkpoint. Everything required to restore
the exact official weights and repeat the experiment is recorded below.

## Source checkpoints

- Architecture/feasibility: `ff85fd8`.
- Playable classical baseline and 26 initial tests: `59d32fa`.
- Later commits add evaluation, fair single-lane latency replay, publication and
  validation. `git log -- projects/catchbot` identifies each reviewable checkpoint.
- `validation/file-manifest.json` inventories final source/result/runtime files
  by SHA-256. It intentionally excludes itself and mutable validation logs.

## Restore the official model

```sh
git clone https://github.com/mistralai/timestral.git /workspace/timestral
git -C /workspace/timestral checkout a534bdbd244d64f3d9d743f46c7bf6fc330ed4ff
mkdir -p /workspace/catchbot-cache
```

Official checkpoint: `mistralai/Timestral-5M`, revision
`bdd20cfc15a3fea0e4cb5ccef37f8d3ca7aa335f`.
`results/timestral-provenance.json` records config, model and license SHA-256.
The model hash is
`7ace108c4987e7f2a99a75a445240019d1d31c2117139d1bd05ffdfd25aca738`.
The public checkpoint is downloaded into the mounted Hugging Face cache, outside
Git. The exact source and checkpoint revisions, rather than mutable `main`, are
used for reproduction. Save/move the cache if offline restoration is wanted;
the pinned public download is sufficient otherwise.

Build the experiment image with README commands. The recorded image ID is in
`validation/environment.json`; the base image is digest-pinned. Python package
versions are in `experiments/requirements.txt` and full installed versions in
`results/environment-lock.txt`. One CPU thread, fp32, seed 0, eval/inference mode,
default symmetric averaging and nonnegative clipping, context [1,2,64], horizon 9.

From the repository root:

```sh
node projects/catchbot/experiments/prepare.mjs
docker run --rm \
  --mount type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/run/ca.pem,readonly \
  -e SSL_CERT_FILE=/run/ca.pem -e REQUESTS_CA_BUNDLE=/run/ca.pem -e HF_HOME=/cache \
  -v /workspace/catchbot-cache:/cache -v /workspace/timestral:/upstream:ro \
  -v "$PWD":/work catchbot-experiments:2026-10-18
node projects/catchbot/experiments/replay.mjs
python3 projects/catchbot/experiments/evaluate.py
```

The first command deterministically regenerates the saved fixtures and causal
windows. The second writes raw quantiles, predictions, timings and provenance.
The last two use the exact browser algorithms to replay all predictors and then
aggregate forecast errors. Accuracy/replay results are reproducible given saved
predictions. Runtime latencies and latency-dependent deployment outcomes vary
with CPU scheduling; repeat latency measurements as a new run, not an overwrite
of the published evidence.

For new human traces, keep original exported JSON unchanged. Mark participant
and recording provenance without personal identifiers; split independent traces
before tuning. Resume boundaries must become separate contexts. Use only events
available at the cutoff. Do not tune the velocity window or horizon on evaluation
traces. Start a new results directory and record new code/config/data hashes.
The current synthetic configuration is fixed and remains the historical baseline.

## Browser export continuation

Run the same Docker command with this command appended:

```sh
python projects/catchbot/experiments/export_onnx.py
# Second, exact operator-mapping probe:
python projects/catchbot/experiments/export_onnx.py --standard-symbolics
```

Both failures are saved: the stock exporter fails on `aten::asinh`; adding an
exact ONNX Asinh mapping then fails on `aten::cummax`. No model graph is shipped.
The script already contains full-output parity probes for diverse saved,
constant and random finite contexts if a future export succeeds. Do not bypass
the official scaler/normalization/symmetry to make export appear to work.
Before integrating: establish full quantile and median parity; run local ORT
WASM in a Worker; measure cold load, peak memory, p50/p95 latency and frame rate;
verify a physical Android phone. Those gates remain unmet. No precomputed trace
can stand in for live inference.

## Experiment corrections retained in the record

An initial 1,455-window run omitted the final forecasts beyond the fixture end;
that was unsuitable for full-duration control comparison. The final run retains
1,485 predictions/model (all 10 Hz requests); only the 1,455 with available future
ground truth enter accuracy metrics. An early provenance-writing command assumed
`git` existed inside the Python image; inference succeeded but provenance failed.
That command was corrected and the complete official inference rerun. The final
saved outputs supersede those preliminary artifacts. An initial browser favicon
404 was fixed. Docker browser networking initially sent the local hostname to
the session proxy; adding local-only NO_PROXY entries resolved it.
