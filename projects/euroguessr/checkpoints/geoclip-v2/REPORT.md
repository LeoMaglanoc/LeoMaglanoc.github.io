# EuroGuessr V2 research report — 5–6 October 2026

## Outcome

**Did GeoCLIP distillation improve the tiny model? YES**

This answer requires a 2% shared-validation median-error gain against both V1 and the matched supervised control, so a larger reference pool alone is not credited to distillation. Deployed Tiny: **distilled**. The separate optional image-only quantized GeoCLIP uses **retrieval-20-t50**. No human win-rate claim is made.

## Comparable geographic evaluation

| Model / cohort | N | Median km | Mean km | ≤25 km | ≤100 km | ≤200 km | ≤500 km | ≤750 km |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| V1 / validation | 961 | 833.4 | 941.7 | 0.00% | 0.42% | 2.60% | 19.25% | 42.25% |
| Supervised A / validation | 961 | 754.2 | 872.6 | 0.10% | 0.73% | 4.47% | 24.25% | 49.53% |
| Distilled B / validation | 961 | 724.1 | 863.0 | 0.00% | 0.52% | 2.71% | 25.29% | 51.30% |
| Embedding-only C / validation | 961 | 741.3 | 865.5 | 0.00% | 0.73% | 2.91% | 25.29% | 50.36% |
| 8-bit GeoCLIP / validation | 961 | 333.3 | 443.0 | 1.77% | 12.90% | 29.76% | 68.89% | 84.50% |
| V1 / fresh test | 363 | 861.3 | 992.5 | 0.00% | 0.55% | 3.31% | 18.46% | 39.12% |
| Supervised A / fresh test | 363 | 807.3 | 918.7 | 0.00% | 1.10% | 4.96% | 22.31% | 44.35% |
| Distilled B / fresh test | 363 | 771.0 | 900.7 | 0.00% | 0.55% | 3.03% | 23.42% | 48.21% |
| Embedding-only C / fresh test | 363 | 787.1 | 912.9 | 0.00% | 0.83% | 3.86% | 22.31% | 47.93% |
| 8-bit GeoCLIP / fresh test | 363 | 372.2 | 522.3 | 1.38% | 7.71% | 23.97% | 64.19% | 81.54% |

Lower errors are better. All methods were selected and the deployment decision saved **before** opening the fresh test. Test results are descriptive; they did not change retrieval parameters or promotion. Country accuracy was not implemented. The constant-location baselines are retained in the student metrics JSON.

## Data and measured compute

- OSV-5M revision `cff33609b56b54d8743b7ee7a416eb8433e9a681`, three source shards per archive split; 8,500 train, 961 validation, 363 fresh test plus 180 legacy inspected test images. 43 countries and 10,004 distinct sequences overall.
- Sampling used country balance, distinct sequences, three-degree geographic validation blocks, and a minimum 25 km new-training/holdout buffer. An additional old-model training buffer removed 39 validation and 237 planned fresh test examples, giving a fairer V1 comparison. All 40 public game photographs remain legacy test-only.
- Teacher: pinned GeoCLIP 1.2.1 / CLIP ViT-L/14. Cold load 91.01 s including initial model download. Best measured batch 2; normalized 512-dimensional embeddings; repeated inference identical; batch differences below 2.4e-7.
- Batch throughput: 1: 1.8881 s/image, 1743 MiB peak RSS, 199.5% CPU, 2: 1.8838 s/image, 1774 MiB peak RSS, 199.7% CPU, 4: 1.8976 s/image, 1838 MiB peak RSS, 199.4% CPU, 8: 1.9923 s/image, 1920 MiB peak RSS, 199.1% CPU.
- Teacher subset: 5,000 country/cell-balanced training images; accumulated cache compute 3.267 h (excludes model loading and paused time). Actual cache interruption/resume was verified against the location-embedding fingerprint.
- Frozen head grid: {'64': {'validation_head_median_km': 825.5367056198947, 'best_epoch': 24}, '96': {'validation_head_median_km': 825.2029596675305, 'best_epoch': 13}, '128': {'validation_head_median_km': 861.301709909544, 'best_epoch': 19}}; selected 96 cells using validation only.
- All scientific computation ran in the pinned Docker image on the laptop CPU, two threads per research process. No cloud/GPU compute. Background jobs affected timings; browser and native timings below are observations, not controlled hardware comparisons.

## Students and deployment assets

| Model | Parameters | ONNX MiB | Reference MiB | Native CPU median / p95 ms | Method |
|---|---:|---:|---:|---:|---|
| Supervised A | 1,394,816 | 5.334 | 18.677 | 10.8 / 14.3 | retrieval-20-t50 |
| Distilled B | 1,394,816 | 5.334 | 9.766 | 5.8 / 7.7 | distilled-50-t10 |
| Embedding-only C | 1,394,816 | 5.334 | 9.766 | 3.7 / 5.3 | distilled-50-t10 |
| 8-bit GeoCLIP | 304,950,528 | 298.209 | 21.205 | 4730.6 / 9197.8 | retrieval-20-t50 |

V1 has 1,087,056 parameters; its original 314-image validation median was 834.7 km and already-inspected 180-image test median was 862.6 km. Those original cohorts are historical, not the comparable evaluation above. Its browser smoke timings ranged from 35–346 ms in different sessions.

- **supervised**: frozen: 34 epochs, 68.4 s; final-block: 25 epochs, 927.6 s; deployed checkpoint last.pt at epoch 58; normalized projected representation cosine to the full-precision teacher: -0.013631 on 100 held-out validation examples. Supervised A's projection is untrained and its cosine is only a control.
- **distilled**: frozen: 35 epochs, 29.5 s; final-block: 33 epochs, 1262.6 s; deployed checkpoint best.pt at epoch 42; normalized projected representation cosine to the full-precision teacher: 0.762877 on 100 held-out validation examples. Supervised A's projection is untrained and its cosine is only a control.
- **embedding-only**: frozen: 34 epochs, 48.2 s; final-block: 28 epochs, 1152.0 s; deployed checkpoint best.pt at epoch 36; normalized projected representation cosine to the full-precision teacher: 0.763905 on 100 held-out validation examples. Supervised A's projection is untrained and its cosine is only a control.

The final spatial residual/SE block and output convolution were fine-tuned with fixed batch-normalization statistics. The distilled objective was 0.5 geographic CE + 0.2 temperature-scaled KL + 0.3 cosine loss, with teacher terms masked for uncached images. The single C ablation uses 0.7 geographic CE + 0.3 embedding cosine and zero soft-target KL, with the same data, initialization and checkpoint comparison. Both native and projected retrieval spaces, geographic head and offline location-gallery retrieval were evaluated on validation. Full candidate tables are in each `metrics.json`.

The optional GeoCLIP download contains 334,930,383 bytes plus small coordinate metadata. Precision: **UINT8 stored linear weights; FP32 activation arithmetic, patch convolution and GeoCLIP MLP**. Constant dequantization uses FP32 matrix multiplication and consumes more browser memory than the stored 8-bit download. Five weight shards are at most 64 MiB each. The browser contains no CLIP text tower or location encoder: it searches 10,857 precomputed European location embeddings.

## Browser and game verification

- Forty player photos total 2,275,521 bytes. Highest available source long edge is 910 px; exports preserve source size and never upscale. The archive cannot supply genuine 1600 px images.
- Pointer Events provide photo zoom 1–4× and map zoom 1–8×, midpoint-anchored pinch/pan, clamping, cancellation and no pinch-created guess. The next photograph alone is preloaded. Natural Earth supplies 100 tiered city labels with collision suppression.
- Chrome computer-agent evidence and actual five-round downloads are saved in `docs/` and summarized in `VALIDATION.md`. Responsive testing at 390×844 is desktop emulation, not a physical-phone benchmark. No human research matches were collected.

## Failures and limitations

- Signed INT8 source initially failed native ONNX Runtime on `ConvInteger`. The unsigned dynamic-activation variant ran but exact-input Chrome/native audits found embedding cosine near 0.99 and geographic differences up to 320 km. A FP32 patch-only repair worsened differences to 1,564 km. Both were rejected. The selected 8-bit stored-weight / FP32 arithmetic variant passed actual Chrome/native checks: maximum embedding error below 5.1e-7, coordinate difference below 0.005 km, and bit-exact JPEG preprocessing for the audit photo. These are two backend audit inputs, not an accuracy benchmark.
- Plain nginx served `.mjs` with the wrong MIME type and initially prevented the compiled game from initializing WASM. The committed Docker preview config fixes `.mjs` and `.wasm` MIME types; GitHub Pages already serves the vendor module as JavaScript.
- Tiny distillation is capacity-limited and the student/reference pack can still make large geographic errors. GeoCLIP needs a substantial explicit download and browser memory; phone performance is unmeasured.
- The public 40-image pack was inspected previously. It is suitable for gameplay and UI checks, not fresh performance claims. Future model improvements require a new test cohort rather than retuning against this one.

## Checkpoints, reproduction and reversal

- `checkpoints/current/` and Git tag `euroguessr-v1-baseline-2026-10-05` preserve V1.
- `checkpoints/geoclip-v2/` preserves all students’ best and last weights, optimizer and RNG state, grid, histories, exact image hashes, pinned dataset revision and teacher/cache archives. Bundle checksums verify continuation inputs.
- `checkpoints/geoclip-direct/` preserves direct-model validation/test and quantization comparisons. Public external weight shards plus hashes preserve the deployed direct predictor.
- Exact Docker commands for teacher generation/resume, student training/resume, verified restore, export, publication and revert are in `RESEARCH_V2.md`. `training/geoclip_overnight.sh` reproduces the main research stages; final test and promotion are separate explicit steps.
- Automated evidence includes eight Node checks, six distillation contract tests, numerically reproducible optimizer/model resume (1e-7 tolerance) and exact RNG restoration, expired-deadline export, wider-tail transition/parity, six exact CLIP preprocessing shapes, leakage/runtime fixtures, asset synchronization and full Docker Jekyll compilation. Final run results and browser scope are recorded in `VALIDATION.md`.

## Final compiled-route Chrome observations

- `geoclip-direct-8bit-europe-bde0a279dc05-baf6293dc9e6`: five real WASM predictions; median 8411.2 ms, range 7580.8–14536.3 ms; maximum native/browser location difference 0.010008 km; all five coordinate/score contracts passed. Evidence: `docs/chrome-v2-final-compiled-geoclip-parity.json`.
- `europe-v2-distilled-42-c4483177ff40-4f2ea6016eb8`: five real WASM predictions; median 95.5 ms, range 74.1–198.4 ms; maximum native/browser location difference 0.000727 km; all five coordinate/score contracts passed. Evidence: `docs/chrome-v2-final-compiled-tiny-parity.json`.

These are laptop Chrome observations, not controlled benchmarks or physical-phone measurements. Synthetic guesses do not measure human skill.
