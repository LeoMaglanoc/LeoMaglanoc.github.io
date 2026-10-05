# EuroGuessr V2 research and continuation

The full measured outcome is in `artifacts/geoclip-overnight/REPORT.md` and the
tracked continuation bundle under `checkpoints/geoclip-v2/`. This document explains
the implementation and reproducible workflow. The original checkpoint bundle
`checkpoints/current/` is preserved. Git tag `euroguessr-v1-baseline-2026-10-05`
retains the deployed V1 model and original game pack.

## Assessment and accepted changes

The plan is scientifically sound: use GeoCLIP as an offline teacher, compare a
supervised baseline, enforce spatial holdouts, select only on validation, and
preserve the existing static app. Distillation success is an experiment, not a
promise. The original 180-image test set was already inspected in V1, so V2 labels
it **legacy-inspected** and samples a separate fresh final test cohort. All 40
public game images remain legacy test-only. V2 validation/fresh-test neighbors of
V1 training are discarded before selection, so comparisons share the same
spatial isolation policy.

The user's later request adds a direct, quantized image-only GeoCLIP browser
candidate. This explicitly supersedes the plan's prohibition on deploying
GeoCLIP itself. The default mode remains tiny; the large model is an opt-in
comparison with a displayed download size. Both modes use the existing worker
and WASM CPU. There is no backend, cloud compute, GPU, WebGPU requirement, live
map tiles, or automatic device-based model download.

The important implementation choices are:

- Recompute 64/96/128 adaptive cells using training GPS only; choose the count by
  validation head median. The teacher and both students share the selected grid.
- Cache the frozen MobileNet prefix to disk. Fine-tuning unfreezes the final spatial residual/SE block plus output
  convolution (`--tail-blocks 2`). This changes training scope without adding
  parameters or browser operators. Final-block fine-tuning remains real
  gradient training, but avoids decoding and forwarding every image through the
  frozen layers on every epoch. Frozen batch-normalization statistics remain fixed.
- Use a native 576 → 256 → N geographic head and a normalized 576 → 512 projection.
  The supervised model uses CE only; the main student starts with weights
  0.5 CE + 0.2 temperature-scaled KL + 0.3 cosine loss. Teacher losses apply only
  to covered training examples. CE still applies to every training example.
- Cache immutable compressed teacher chunks and an atomic index. Resume checks
  manifest, selected IDs, image bytes, teacher/preprocessing version, grid,
  temperature, role, embedding norms, probability sums, and chunk checksums.
  A separate `role=val` cache is used only for representation audits.
- Save `last.pt` and validation-selected `best.pt` atomically, with optimizer,
  Python/NumPy/PyTorch RNG, IDs, cells, arguments, objective/cache fingerprints,
  history and environment. Changed objectives or caches are rejected on resume.
- Deadlines and signals stop at an epoch boundary and continue to private export
  when `--export` is supplied. An already-expired deadline also saves and exports
  a valid initial checkpoint. Interrupting preparation requires rerunning it;
  already downloaded images are reused.
- Choose geographic head, native retrieval or distilled-to-teacher retrieval
  or the offline GeoCLIP location gallery on validation. Retune K = 1/3/5/10/20/50 and similarity weights = 10/20/50.
  Evaluate each final selected configuration on the fresh test once, with a
  selection lock over model, references, method and data. Never use those test results to decide deployment.
- Require at least 2% median validation improvement over the preserved deployed
  model evaluated on the **same new validation cohort** before tiny-model promotion.
  Exports stay under the run directory until this explicit gate passes.

## Docker

All measured teacher, dataset, student and ONNX work runs in Docker. The initial
host virtual-environment setup was stopped before the actual Docker benchmark.
`Dockerfile` pins a Python base digest and `training/research-lock.txt` locks the
complete Python environment. The runtime includes Node for Python/JS parity tests.
Only CPU PyTorch wheels are installed. A runtime identity hashes the graph, external weights, both reference files,
preprocessing and selected strategy. Graph-only hashes cannot identify external
weight changes. Match exports include this identity; human aggregation refuses
mixed identities/methods and supports pretrained models without a local
training-manifest field. Compose limits a research container to
2 CPUs, 6 GiB RAM and no container swap. The repository and model-download cache
are bind-mounted, so experiments survive container removal.

From `projects/euroguessr/`:

```bash
mkdir -p data/model-cache
docker compose build
docker compose run --rm research python tests/distillation.py
docker compose run --rm research python tests/training_integration.py
docker compose run --rm research python tests/clip_preprocess.py
```

`UID`/`GID` default to 1000 in Compose; set them if your local account differs.
The full workflow is `bash training/geoclip_overnight.sh`. Its default deadlines
are specific to the original overnight run: **6 October 2026 08:25 +02:00** for
training and **01:15 +02:00** for teacher caching. Set `RUN_ROOT` to a new
experiment directory and optionally `WARM_START` to another saved encoder. Set `STOP_AT` and
`TEACHER_STOP_AT` to new timezone-aware dates for a future run. Reusing an existing
run intentionally preserves its fixed dataset plan; use a new run root and a
fresh final test cohort for new model-selection experiments. The sampler excludes
previously inspected test IDs/sequences from tracked checkpoint manifests; pass
`--exclude-test-manifest` for additional externally archived tests.

## Exact experiment commands

Run these inside `docker compose run --rm research python ...`:

```bash
training/benchmark_teacher.py
training/prepare_experiment.py --train 8500 --val 1000 --test 600 --shards 3
training/validate_manifest.py --manifest artifacts/geoclip-overnight/manifest.json
training/plan_teacher.py --run-root artifacts/geoclip-overnight
training/cache_teacher.py \
  --manifest artifacts/geoclip-overnight/manifest.json \
  --cells artifacts/geoclip-overnight/cells.json \
  --output artifacts/geoclip-overnight/teacher-cache \
  --batch-size 2 --count 5000 \
  --stop-at 2026-10-06T01:15:00+02:00
```

To replay the saved run, restore its immutable manifest first. Calling the
sampler after publication intentionally selects a new final test cohort, rather
than reproducing an already inspected test. V2 teacher chunks belong to
`student_train.py`; the historical `train.py`/`quantize.py` workflows use V1
contracts and should not be used for V2 projection/gallery exports.

Use the measured batch/count in `teacher-budget.json` rather than assuming these
example values. Rerun the **same cache command** to resume; changing a deadline
is allowed, changing the cache identity is not.

```bash
training/student_train.py \
  --manifest artifacts/geoclip-overnight/manifest.json \
  --run-dir artifacts/geoclip-overnight/distilled \
  --cell-definition artifacts/geoclip-overnight/cells.json \
  --warm-start checkpoints/current/best.pt \
  --prefix-cache artifacts/geoclip-overnight/prefix.npy \
  --teacher-cache artifacts/geoclip-overnight/teacher-cache \
  --geo-weight 0.5 --kd-weight 0.2 --embed-weight 0.3 \
  --epochs 80 --patience 20 --stop-at 2026-10-06T08:25:00+02:00

training/student_train.py \
  --manifest artifacts/geoclip-overnight/manifest.json \
  --run-dir artifacts/geoclip-overnight/distilled --resume --finetune --tail-blocks 2 \
  --prefix-cache artifacts/geoclip-overnight/prefix-tail2.npy \
  --teacher-cache artifacts/geoclip-overnight/teacher-cache \
  --geo-weight 0.5 --kd-weight 0.2 --embed-weight 0.3 \
  --epochs 100 --patience 25 --stop-at 2026-10-06T08:25:00+02:00 --export
```

`--epochs` means additional epochs. For supervised training, use the `supervised`
run directory and omit teacher/cache objective options. For a new experiment,
warm-start only the compatible encoder; old cells and classifier are never
silently retained. For continuation, keep the same objective weights/cache/tail scope and
use `--resume`. Changing tail scope is allowed only at the frozen-to-fine-tuned
stage transition, which starts a new optimizer. Private export always rebuilds
features from the validation-selected best checkpoint’s own prefix scope. An explicit `--learning-rate` overrides the restored rate while
retaining optimizer moments; otherwise the saved rate is preserved. Prefix caches have manifest and encoder fingerprints plus a file
checksum. They are rebuildable and remain ignored; raw images also remain ignored.

The orchestration records successful final training stages with
`supervised-finetune.done` / `distilled-finetune.done`, so restarting the shell
workflow does not silently add another hundred fine-tuning epochs. For deliberate
continuation, invoke the student trainer directly. A stopped cache is a fixed
training input: extending it changes the objective fingerprint and requires a
new warm-started student run.

```bash
training/evaluate_student.py --run-dir artifacts/geoclip-overnight/distilled \
  --audit-teacher artifacts/geoclip-overnight/validation-teacher
training/fingerprint_runtime.py --models artifacts/geoclip-overnight/distilled/models \
  --metrics-out artifacts/geoclip-overnight/distilled/metrics.json
# Compare the training head-best and last snapshots using deployed validation retrieval:
training/select_student_checkpoint.py --run-dir artifacts/geoclip-overnight/supervised \
  --audit-teacher artifacts/geoclip-overnight/validation-teacher
training/select_student_checkpoint.py --run-dir artifacts/geoclip-overnight/distilled \
  --audit-teacher artifacts/geoclip-overnight/validation-teacher
# Only after validation has fixed the checkpoint and method:
training/select_deployment.py --run-root artifacts/geoclip-overnight
training/evaluate_student.py --run-dir artifacts/geoclip-overnight/distilled --test
training/promote_student.py --run-dir artifacts/geoclip-overnight/distilled \
  --baseline-report artifacts/geoclip-overnight/baseline-comparison.json \
  --backup artifacts/geoclip-overnight/pre-promotion
training/bundle_experiment.py --run-root artifacts/geoclip-overnight
```

The updated orchestration performs this checkpoint comparison automatically when no selection exists. The explicit commands above are the equivalent for a fresh manually trained run; do not rerun them on a sealed selection. The checkpoint bundle also preserves exact ONNX graphs, galleries and runtime metadata for both selected students, including the candidate that is not deployed. Re-exporting from weights can introduce small CPU rounding changes in reference features; preserve the original runtime bytes when reproducing locked test results. The checkpoint comparison preserves `best.pt` and `last.pt`, writes both `best-evaluation/` and `last-evaluation/` reports, and copies the validation winner’s runtime assets to the run root. `checkpoint-selection.json` records the choice. Both students receive the same comparison. Resume training from the original saved state; `selected_checkpoint` identifies which weights produced the deployed export. Never rerun selection after a fresh test has been opened.

Choose supervised instead if it wins validation. Final test reports describe the
selected method only, not a test-based sweep.

## Restore a fresh clone

```bash
docker compose run --rm research python training/restore_experiment.py \
  --bundle checkpoints/geoclip-v2 \
  --run-root artifacts/geoclip-overnight-restored
```

This verifies bundle checksums, restores exact attributed source images by ID
from the pinned OSV-5M ZIP ranges, verifies transformed-image checksums, extracts
immutable teacher chunks, and rebinds checkpoint filesystem paths. It never
rewrites model/optimizer/RNG/objective state. Resume with the restored paths and
the objective/stage recorded in `last.pt` arguments. A rebuilt prefix cache is
expected on the first restored run. To intentionally change a dataset or teacher
cache, create a new run and warm-start the encoder instead.

For the saved distilled final-block stage, this continues the exact optimizer,
RNG and cached-teacher objective for up to 30 additional epochs. The larger
patience allows continuation after the original plateau; validation still
protects `best.pt`.

```bash
docker compose run --rm research python training/student_train.py \
  --manifest artifacts/geoclip-overnight-restored/manifest.json \
  --run-dir artifacts/geoclip-overnight-restored/distilled \
  --resume --finetune --tail-blocks 2 \
  --prefix-cache artifacts/geoclip-overnight-restored/prefix-tail2.npy \
  --teacher-cache artifacts/geoclip-overnight-restored/teacher-cache \
  --geo-weight 0.5 --kd-weight 0.2 --embed-weight 0.3 \
  --epochs 30 --patience 100 --export
```

For supervised continuation, change the run directory to `supervised` and omit
the teacher/cache objective options. Add a new timezone-aware `--stop-at` when
using a wall-clock budget. Restored best and last checkpoints use prefix paths
for their own tail scope; a frozen best and fine-tuned last can safely coexist.
Re-export and seal the predictor after training; obtain a new test cohort before
making another test-based accuracy claim.

## Direct GeoCLIP export and validation

The source is the pinned [Xenova image-only 8-bit conversion](https://huggingface.co/Xenova/clip-vit-large-patch14/tree/c307790166907339eed5a9a53a249af534102536/onnx),
not the full CLIP model. The exporter adds the exact GeoCLIP MLP and L2
normalization, freezes the input shape, and shards external weights at no more than 64 MiB.
The selected export uses `--weight-only`: per-channel UINT8 linear weights are dequantized for FP32 matrix multiplication, and patch convolution is FP32. This preserves the small download while removing dynamic activation quantization, whose native/WASM predictions failed parity. Runtime memory is substantially larger than download size. The location encoder runs offline over a regular 0.5° Europe GPS grid. The export
records source checksums and projection provenance. Runtime files are served
locally with the site; Hugging Face is only a development download source.

```bash
docker compose run --rm research python training/export_geoclip_direct.py --weight-only
docker compose run --rm research python training/evaluate_geoclip_direct.py \
  --manifest checkpoints/current/manifest.json --count 100 --compare-fp32
docker compose run --rm research python training/evaluate_geoclip_direct.py \
  --manifest artifacts/geoclip-overnight/manifest.json
docker compose run --rm research python training/fingerprint_runtime.py \
  --models artifacts/geoclip-direct/models
# After the validation-selected gallery retrieval method is fixed:
docker compose run --rm research python training/evaluate_geoclip_direct.py \
  --manifest artifacts/geoclip-overnight/manifest.json --test
docker compose run --rm research python training/bundle_direct.py
```

The browser implements Pillow's bicubic RGB resize and CLIP center crop explicitly;
using MobileNet's stretched bilinear input for GeoCLIP would be incorrect.
`tests/clip_preprocess.py` compares it with GeoCLIP's actual `AutoProcessor`.
JPEG decoder differences may still exist across browsers. Large-model files are
SHA-256 checked and opportunistically cached with Cache API. Network/cache URLs
include the file digest so an updated deployment does not reuse old HTTP bytes.
Switching models replaces the worker to release the large WASM heap; quota failure falls
back to ordinary loading. The user chooses this download explicitly. Mobile
performance is not inferred from desktop Python timing.

## Game UX and checks

Player photos are recovered from the highest resolution in the pinned OSV-5M
archives, exported at up to 1600 px without upscaling and with preserved aspect
ratio. Original/exported dimensions and source checksums are recorded. Both
models and humans still receive the same photograph; only preprocessing differs.
Only the next round image is preloaded.

`src/gestures.js` manages two active pointers, incremental midpoint-anchored zoom,
pan, bounds and pointer-count rebasing. A pinch remains non-tapping until every
pointer has ended. Pointer cancellation also suppresses guesses. Photo zoom
ranges from fitted size to 4×; map zoom reaches 8×. Wheel zoom anchors at the
cursor, and reset/keyboard controls remain available.

`cities.json` is generated from Natural Earth Populated Places 5.1.2. Its 100
cities are ranked by dataset capital/scale/population fields. Three display tiers,
collision suppression and country-label fading prevent dense overlaps. City
labels never intercept pointer events.

Chrome computer-use checks cover real WASM inference, five rounds, scores, pins,
keyboard and pointer input, JSON export, explicit direct-model loading, and
390 × 844 layout. `tests/gesture-harness.html` exercises the actual app handlers
with synthetic two-pointer events; pointer capture is stubbed for synthetic IDs.
These are emulated touch checks, **not a physical-phone test**. The harness is not
published. Unit tests separately check midpoint anchoring, clamping, rebasing,
cancellation and accidental-guess prevention.

## Compiled Docker preview

From repository root, publish assets and run
`docker compose run --rm --no-deps --entrypoint /bin/sh jekyll -lc 'bundle exec jekyll build'`.
Then from this project, run `docker compose --profile preview up -d preview` and
open `http://localhost:8800/euroguessr/`. Stop it with
`docker compose --profile preview stop preview`. The preview binds localhost
only and explicitly serves `.mjs` as JavaScript and `.wasm` as WebAssembly;
plain Nginx 1.27 otherwise serves `.mjs` as octet-stream and Chrome rejects it.

## Publish and revert

From repository root, after measured promotion and Chrome checks:

```bash
python3 projects/euroguessr/training/register_assets.py
python3 scripts/publish-project-assets.py
python3 scripts/publish-project-assets.py --check
```

Only runtime files are registered. Datasets, teacher training caches, Python,
containers and continuation bundles are excluded from the site.

To restore the original model/photo pack without reverting V2 interactions:

```bash
git restore --source=euroguessr-v1-baseline-2026-10-05 -- \
  projects/euroguessr/models/metadata.json projects/euroguessr/models/model.onnx \
  projects/euroguessr/models/references.json projects/euroguessr/models/references.f32 \
  projects/euroguessr/models/fixture.json projects/euroguessr/rounds.json \
  projects/euroguessr/images
python3 scripts/publish-project-assets.py
```

Commit that explicit revert and push normally; never force-push shared history.
