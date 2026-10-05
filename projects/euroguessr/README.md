# EuroGuessr AI

Five European street-view images, 60 seconds per round, no movement. Place a pin and compare your distance and score with an independent vision model. The app runs entirely on the browser CPU, with no API key, inference server, WebGPU, paid service, or map tile requests.

Play at **[/euroguessr/](https://leomaglanoc.github.io/euroguessr/)**. The link is also in the existing [AI Coding Agent Case Study demo list](https://leomaglanoc.github.io/blog/AI-coding-agent-case-study/).

**Status: working research baseline, not a demonstrated human-beating AI.** The first session built the game, real inference, data pipeline, model comparisons, quantization experiment, and continuation checkpoints. It did not establish the requested 70% win rate against casual players. The current accuracy is coarse and needs substantial improvement.

## What changed from `plan.md`

The plan's Europe specialization, CPU training and ONNX/WASM deployment are sensible. Its strongest uncertainty is whether a tiny ImageNet encoder can retain enough geographic information to beat people. Dataset preparation and trustworthy evaluation are also substantial parts of the work.

- Compare a supervised geographic head with nearest-image retrieval before selecting an approach. The head uses 48 adaptive geographic cells; the retrieval system averages the ten most similar training locations with exponential similarity weights.
- Select models using spatial validation. Save a separate test report. Do not choose images that flatter the model.
- Use an attributed, local OSV-5M/Mapillary photo pack instead of a live navigable Mapillary integration. This version requires no token and lets the human and AI see the same pixels.
- Keep FP32 when INT8 damages accuracy. Compression is useful only if the resulting model still performs well.
- Provide optional cached teacher distillation, but do not label a supervised model “distilled.” The GeoCLIP teacher path is implemented but was **not run in the first session**.
- Remove the suggestion to weaken the AI deliberately. Strength is an empirical goal, not a parameter-count claim.

## Measured first-session results

Hardware: Intel i7-8565U, 16 GB RAM. Training and export use two CPU threads. Browser inference uses a dedicated worker and one WASM CPU thread; this works on static GitHub Pages without cross-origin-isolation headers.

The selected FP32 model is **MobileNetV3-Small's feature encoder plus a 576 → 256 → 48 geographic head**, totaling **1,087,056 parameters**. This excludes the original ImageNet classification head; it is not TorchVision's full 2.54M-parameter classifier. The last convolutional block was fine-tuned for ten epochs after frozen-feature head training.

| Candidate                                             | Validation median error | Test median error |
| ----------------------------------------------------- | ----------------------: | ----------------: |
| Frozen encoder, trained head                          |                  850 km |            929 km |
| Frozen encoder, retrieval 10                          |                  841 km |            862 km |
| Partially fine-tuned encoder, trained head            |                  865 km |            982 km |
| Partially fine-tuned encoder, retrieval 10 — selected |              **835 km** |        **863 km** |
| Constant median training coordinate                   |                  906 km |            907 km |
| Selected retrieval model, INT8 trial                  |                  861 km |          1,040 km |

Selection uses validation median error; the small test difference between frozen and refined retrieval does not determine selection. INT8 reduced the ONNX file from **4,361,489 bytes to 1,416,805 bytes**, but increased validation error by about 3.2%. An initial local experiment allowed up to 5% regression; this was tightened to 1% because FP32 already ran fast enough. The deployed model remains FP32. Full precision-specific reports are in `models/experiments.json`; future tuning should use a new final test sample rather than repeatedly treating this inspected set as untouched.

Chrome desktop smoke testing observed real predictions around **35–127 ms** during the first five-round test, including retrieval, while training was running. These are observations, not a controlled latency benchmark or a phone measurement. The final runtime is the WASM-only ONNX Runtime Web 1.23.2 distribution. Accuracy and latencies on other devices must be measured.

## Data and leakage controls

Data source: [OSV-5M](https://huggingface.co/datasets/osv5m/osv5m), pinned upstream revision `cff33609b56b54d8743b7ee7a416eb8433e9a681`. Dataset license: CC BY-SA 4.0; full attribution and image modifications are described in `THIRD_PARTY_NOTICES.md` and `rounds.json`.

`prepare.py` streams metadata and filters a Europe country allowlist and bounding box (34–72° N, 25° W–45° E). It reads ZIP central directories through HTTP byte ranges, fetches selected JPEGs only, checks their ZIP CRCs, resizes to at most 640 px, and caches them. It deduplicates sequences and interleaves countries in stable SHA-256 order. Sampling is intentionally country-balanced, not population- or road-density-representative. Coverage includes only available dataset images and this bounded Europe region.

The initial download selected 1,600 source-training images and 180 source-test images from shard 00. Validation uses stable hashed **3° geographic blocks**, rather than random image splits. Training images within **25 km** of validation or test images are excluded. The resulting retained sets are **1,027 train / 314 validation / 180 test**. Closest retained train-to-holdout distance: **25.2566 km**. A sequence-overlap check also passed. The 40 game images are an uncurated ID-sorted prefix of the selected test set, never used for training or retrieval references. Do not compare these results directly with the full OSV-5M benchmark: the samples, domain, balance and splitting differ.

Raw images, slim Europe metadata, cached embeddings, logs and intermediate experiments remain in ignored `data/` and `artifacts/` directories. First-session retained data occupies roughly 555 MB. Streaming the full source-training CSV transferred about 2.9 GB without saving that CSV. The overnight sampler reuses cached metadata.

## Browser architecture

```text
JPEG → shared bilinear preprocessing → normalized RGB NCHW [1,3,224,224]
     → worker → ONNX encoder + head → embedding / logits
     → selected geographic head or visual retrieval → hidden AI coordinate

human map pin → submit / timeout → haversine distance → score → reveal
```

Preprocessing uses explicit half-pixel bilinear resizing without antialiasing, identical in `training/train.py` and `src/preprocess.js`. Mean `[0.485,0.456,0.406]`, standard deviation `[0.229,0.224,0.225]`. A numerical fixture verified Python/JS interpolation to below `1e-6`. Real browser JPEG decoders may have small pixel differences; that fixture isolates interpolation using PNG.

The inference worker receives only normalized pixels and a request token. It never receives image ID, country or ground-truth GPS. Retrieval reference features and coordinates are from the retained **training** set. Answers are revealed only after a human submission or timeout. A prediction failure stops the round rather than producing a substitute guess.

Scoring is `round(5000 * exp(-distance_km / 1500))`, with a maximum of 25,000 per five-round match. This is the app's own score curve, not a claim of exact GeoGuessr scoring. No pin at timeout gives the human zero. Ties are shown explicitly. Map clicks, keyboard arrows/Enter, touch, zoom, pan, digital photo zoom, credits and result export are supported. Digital zoom adds no image information.

The game is casual: its static answer pack is inspectable by visitors. It does not provide a secure competition or independently verified human benchmark. Results and the recent-image pool stay in local storage; exported JSON has no name or account identifier. Nothing is uploaded.

## Preview and tests

From repository root:

```bash
python3 scripts/publish-project-assets.py
python3 -m http.server 8790 --bind 127.0.0.1
```

Open `http://localhost:8790/assets/interactive/euroguessr/index.html`. The Jekyll wrapper is `/euroguessr/`; the generated asset directory is registered in `scripts/project-assets.json`.

```bash
node --test projects/euroguessr/tests/*.test.mjs
projects/euroguessr/.venv/bin/python projects/euroguessr/tests/pipeline.py
python3 scripts/publish-project-assets.py --check
```

`tests/pipeline.py` verifies split disjointness, sequence isolation, geographic buffer, game-image attribution, ONNX numerical fixture, and Python/JS preprocessing. It uses the tracked checkpoint manifest and also checks the real retrieval pack's Python/JavaScript prediction parity.

Chrome computer-use validation covers initialization, real CPU inference, map selection, keyboard selection, round reveal, scores, all five rounds, no-guess timeout, summary, actual JSON download, model information and responsive layout. See `VALIDATION.md` for the completed checks and evidence. Smoke-test guesses are synthetic actions; they do not count toward a human win-rate claim.

## Install the CPU training environment

```bash
cd projects/euroguessr
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Dependencies are pinned; PyTorch and TorchVision use CPU wheels. An ImageNet initialization is downloaded by TorchVision on first use. Set `--threads 2` for this laptop; there is no GPU branch in the training code.

## Continue from saved checkpoints

**Tracked, restorable continuation bundle:** `checkpoints/current/`.

- `best.pt`: selected refinement run's best validation-head checkpoint, used to export the final encoder.
- `last.pt`: latest refinement epoch, including optimizer state and Python/NumPy/PyTorch RNG states.
- `manifest.json`: exact rows, split/block assignments, image IDs and contributor provenance.
- `dataset-revision.json`: pinned source snapshot.
- `image-sha256.json`: checksums of the exact transformed training/evaluation images; restoration rejects mismatches.
- `bundle.json`: file checksums, source fingerprints, environment and state summary.

The bundle is intentionally outside the public browser-runtime manifest. Raw images are not committed to the training bundle; the browser has only its 40 licensed game images. On a fresh clone, restore the checkpoint's exact source images without downloading the full CSV:

```bash
cd projects/euroguessr
.venv/bin/python training/restore_data.py
mkdir -p artifacts/continued
cp checkpoints/current/{last.pt,best.pt} artifacts/continued/
.venv/bin/python training/train.py \
  --manifest checkpoints/current/manifest.json \
  --run-dir artifacts/continued --resume --finetune \
  --epochs 10 --threads 2 --export
```

`--epochs` means **additional epochs**. Resume refuses a changed manifest or teacher cache. Checkpoints are atomically saved at every epoch. Ctrl+C/SIGTERM requests a stop at the next epoch boundary; it can take a minute on a larger dataset. For an expanded dataset, use a new run directory and `--warm-start`, which retains model weights and cell centers but resets optimizer state. Never overwrite a previous checkpoint bundle before reviewing the new validation report.

Local first-session archives: `artifacts/best.pt`, `artifacts/last.pt`, `artifacts/features.npz`, `artifacts/refined/`, `artifacts/bootstrap-models/`, `artifacts/refined/model-fp32.onnx`, `artifacts/refined/model-int8.onnx`, logs and Chrome screenshots. The tracked bundle preserves the final continuation state even if ignored experiment files are removed.

## Overnight run — ready, not automatically started

From repository root:

```bash
bash projects/euroguessr/training/overnight.sh
```

This samples up to **12,000 source-training images and 600 source-test images**, snapshots a new manifest, warm-starts the tracked checkpoint, and runs **40 epochs of final-block fine-tuning** on two CPU threads. Re-running continues the same run if `artifacts/overnight/last.pt` exists. Dataset availability/sequence deduplication can yield fewer images. Download latency and CPU thermals determine runtime; no completion time or human-level accuracy is promised.

The script exports models and refreshes public assets after a successful training run, **but does not commit or push**. Review validation, test error, browser latency and image attribution before promoting. It does not start a GeoCLIP teacher, change the saved first-session checkpoint bundle, or run a paid service. Save an improved bundle with:

```bash
.venv/bin/python training/bundle_checkpoint.py --run-dir artifacts/overnight
```

Training metadata is streamed rather than downloading the many-gigabyte image archives. This one-shard run should fit comfortably in the agreed 20 GB storage budget, but long experiments and additional shards can grow; retain only experiments you need. Keep the machine plugged in, prevent sleep for the manually chosen run, and monitor temperature/resource use.

## Optional cached teacher distillation

This path is implemented as a follow-up experiment and **has not been run with GeoCLIP in this session**. A large teacher can take much longer on this CPU and requires an additional pretrained-weight download. Evaluate teacher accuracy in this street-view domain before assuming it helps. It is never used in the browser.

```bash
.venv/bin/python -m pip install geoclip==1.2.1
.venv/bin/python training/cache_teacher.py \
  --checkpoint checkpoints/current/best.pt \
  --manifest checkpoints/current/manifest.json \
  --output artifacts/teacher.json
.venv/bin/python training/train.py \
  --manifest checkpoints/current/manifest.json \
  --run-dir artifacts/distilled \
  --warm-start checkpoints/current/best.pt \
  --teacher-cache artifacts/teacher.json --kd-weight 0.2 \
  --finetune --epochs 10 --export
```

The optional package can add dependencies beyond the pinned base environment; use a separate virtual environment for this experiment if dependency resolution changes PyTorch. GeoCLIP package/API compatibility and its full teacher download/inference are not claimed as verified. Teacher location embeddings are computed once for the saved cells; each training image's temperature-2 soft distribution is saved atomically and skipped on rerun. The student minimizes `0.8 * supervised_CE + 0.2 * 4 * KL(teacher || student_at_T2)`. Teacher cache centers, data fingerprint, probability normalization, completeness and checksum are validated. Only training IDs are queried. No teacher probabilities are generated for validation or test images by this script.

## Quantization and human evaluation

INT8 can be reevaluated in a separate run:

```bash
.venv/bin/python training/quantize.py --run-dir artifacts/refined
```

Add `--promote` only when its validation gate passes. The current gate allows at most **1% median validation regression**, and human-quality goals take priority over file size. The quantizer calibrates on training images only, recomputes training reference features in the new precision and reports validation/test errors. Review a fresh Chrome parity/latency check before publication. Keep FP32 backups: running a quantizer against an already quantized export is not a supported workflow.

To measure human performance, collect consented independent five-round JSON exports from casual players under the fixed rules. Record verified skill and repeat-player status separately. Then:

```bash
.venv/bin/python training/human_benchmark.py path/to/matches/*.json
```

The tool rejects mixed model versions or rules and reports AI match wins, ties, win rate and a Wilson 95% interval. Exports are inspectable and self-reported, so this does not automatically verify player identity, skill, independence or absence of answer inspection. Use a fresh image pack for a serious study. Define the target population first; “most humans” is otherwise not a measurable claim.

## Next improvement priorities

1. Expand genuinely distinct training sequences and country/region coverage; preserve the spatial split and data provenance.
2. Measure a geolocation-aware teacher, then compare supervised and distilled students on validation rather than assuming a gain.
3. Test geographic distance-aware targets, larger late-block fine-tuning and a somewhat larger CPU encoder if the tiny network plateaus.
4. Add country/region accuracy, calibration and country-stratified error reports; current metrics are distances and threshold rates.
5. Gather actual casual-player matches with uncertainty intervals. The target remains 70% match wins, not a result.
6. Only then consider a navigable Mapillary mode, a live-image API token, worldwide coverage or a stronger browser model.
