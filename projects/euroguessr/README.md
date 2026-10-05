# EuroGuessr AI

Five European street photographs, 60 seconds per round. Place a map pin and compare distance and score against a vision model that runs locally on the browser CPU. Play at **[/euroguessr/](https://leomaglanoc.github.io/euroguessr/)**.

The default is a tiny MobileNet model. An explicit **GeoCLIP 8-bit** option downloads approximately 318 MiB of image-only model/gallery assets. It uses quantized CLIP ViT-L/14 plus GeoCLIP's exact projection, with an offline Europe location gallery. It can take several seconds per photograph on a laptop. The model chooser displays the download size; no large model downloads automatically. Both modes use a worker and single-thread ONNX Runtime Web/WASM. No API key, inference backend, GPU, WebGPU or live map tiles are required.

This is a working research game. Human win rate has **not been measured**. Automated smoke-test guesses are not human evaluation.

## Research results and checkpoints

The measured V2 comparison, teacher throughput, dataset, accuracy, latency, failed experiments and deployment decision are in **[the run report](artifacts/geoclip-overnight/REPORT.md)**. Full implementation rationale and exact reproduce/resume/publish/revert commands are in **[RESEARCH_V2.md](RESEARCH_V2.md)**.

- `checkpoints/geoclip-v2/`: immutable V2 continuation bundle, both supervised and distilled `best.pt`/`last.pt`, optimizer and RNG states, exact manifest/image hashes, cells, teacher-cache archives, validation/test reports and source fingerprints.
- `checkpoints/current/`: preserved V1 continuation bundle.
- Git tag `euroguessr-v1-baseline-2026-10-05`: original model and photo pack.
- Ignored `artifacts/geoclip-overnight/`: full local logs, prefix features, source snapshots and live runs. Ignored `data/`: raw/transformed research photos and download cache. These are excluded from public assets.

V1 had 1,027 training / 314 validation / 180 inspected test images and a 1,087,056-parameter FP32 MobileNetV3-Small encoder/head. Its selected ten-neighbor retrieval achieved **835 km validation / 863 km test median error**. Its INT8 trial regressed to 861 / 1,040 km, so FP32 was retained. Those historical numbers use a different cohort; V2 reevaluates the preserved model on the same new validation cohort as the candidates. Historical precision comparisons remain in `models/experiments.json`.

V2 recomputes training-only cells, compares supervised CE with GeoCLIP CE/KL/embedding distillation, and evaluates native and projected retrieval. Teacher losses apply only to covered training examples. Validation selects the grid, checkpoint and inference strategy; fresh test metrics do not choose deployment. Tiny-model promotion requires at least 2% validation improvement over V1 on the identical cohort. All measured research runs use Docker with CPU-only PyTorch, pinned dependencies, two CPUs, 6 GiB memory and no container swap.

## Data and game behavior

Photos come from [OSV-5M](https://huggingface.co/datasets/osv5m/osv5m), revision `cff33609b56b54d8743b7ee7a416eb8433e9a681`, under CC BY-SA 4.0. Europe sampling is country-balanced and sequence-deduplicated, with hashed 3° validation blocks and a ≥25 km training/holdout buffer. New evaluation holdouts also exclude neighbors of the preserved V1 training references. This is a custom balanced experiment, not the full OSV-5M benchmark. Pretrained GeoCLIP's upstream training overlap cannot be independently ruled out.

The 40 public game photos remain legacy test-only. They use the highest resolution present in the pinned source archive, capped at 1600 px without upscaling; dimensions and modifications are recorded. Archive resolution limits mean some source photos remain below 1600 px. Contributor links, license and attribution remain visible. Only the next photograph is preloaded.

Photo and map support midpoint-anchored two-pointer pinch, one-pointer pan, wheel zoom and +/−/reset controls. Map keyboard arrows/Enter remain available. Pinching and pointer cancellation never create a guess. Photo zoom is clamped from fitted size to 4×, map zoom to 8×. The map uses local Natural Earth boundaries and 100 offline-ranked city labels, with display tiers/collision suppression and no runtime tile requests.

The worker receives pixels and a request token only, never photo IDs, country or answer GPS. Tiny retrieval references contain training images only; direct GeoCLIP references are an independent regular GPS grid. Tiny preprocessing uses matched half-pixel bilinear resizing; GeoCLIP uses matched Pillow bicubic short-side resize and center crop. Both reduce the same photograph to 224×224 internally. Digital zoom cannot add source detail.

Score is `round(5000 * exp(-distance_km / 1500))`, maximum 25,000 per match. Answers reveal after submission or timeout; no pin at timeout scores zero. Prediction failures stop the round. The static answer pack is inspectable, so this is a casual game. Results stay in local storage; JSON exports contain no account/name, and nothing is uploaded.

## Preview and verification

From repository root:

```bash
python3 projects/euroguessr/training/register_assets.py
python3 scripts/publish-project-assets.py
python3 -m http.server 8790 --bind 127.0.0.1
# Open http://localhost:8790/assets/interactive/euroguessr/index.html
node --test projects/euroguessr/tests/*.test.mjs
python3 scripts/publish-project-assets.py --check
```

From `projects/euroguessr/`:

```bash
docker compose build
docker compose run --rm research python tests/pipeline.py
docker compose run --rm research python tests/distillation.py
docker compose run --rm research python tests/training_integration.py
docker compose run --rm research python tests/clip_preprocess.py
```

Tests cover held-out IDs/sequences/blocks/distances, real ONNX fixtures, JavaScript/Python prediction/preprocessing parity, partial teacher coverage/cache resume/checksums, warm start, normalized projection, exact uninterrupted-versus-resumed training, deadline finalization and gestures. **[VALIDATION.md](VALIDATION.md)** records Chrome computer-agent five-round, result-export, pointer/keyboard and responsive 390×844 checks. Synthetic two-pointer events test the actual handlers; physical-phone performance is unmeasured.

Restore a new working copy while preserving immutable saved checkpoints:

```bash
docker compose run --rm research python training/restore_experiment.py \
  --bundle checkpoints/geoclip-v2 --run-root artifacts/geoclip-overnight-restored
```

Use the same objective/cache and stage recorded in the checkpoint to resume. `--epochs` means additional epochs. Warm-start a new run when changing the dataset/objective. See RESEARCH_V2 for exact commands and safeguards. The older `training/overnight.sh` is the historical V1 workflow; use `training/geoclip_overnight.sh` for V2 and update its dated deadlines for future work.

## Future evaluation

Collect consented independent five-round JSON exports from casual players before claiming a win rate. `training/human_benchmark.py` checks model/rules consistency and reports wins, ties and a Wilson interval; self-reported exports do not independently verify player skill or independence. Use a new game/test cohort for a serious follow-up. Useful next experiments include distance-aware targets, broader final-block fine-tuning, geographic error breakdowns, and a modestly larger CPU encoder. Preserve validation/test separation and compare each change empirically.
