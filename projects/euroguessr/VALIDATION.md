# Validation — 5 October 2026

## Automated checks

- Five Node tests: haversine distance/score, map projection/bounds, feature-only retrieval, geographic-head selection, and pixel normalization/interpolation.
- Pipeline check: train/validation/test IDs disjoint; train vs held-out sequences disjoint; geographic validation blocks disjoint; minimum train-to-holdout distance 25.256628 km; all 40 public images are attributed held-out images.
- PyTorch vs native ONNX maximum absolute error: 0.0000149012 after fine-tuning.
- Exported ONNX fixture reproduces its embedding/logits.
- Python vs JavaScript preprocessing fixture maximum absolute difference: 0.000000715256.
- Resume smoke check and publication/site-build results are recorded below after completion.

## Chrome computer-use checks

Used the user's Chrome browser through the computer-use agent, rather than substituting a headless browser.

- Model loads and runs on WASM CPU; a worker receives pixels only.
- Pointer map selection enables submit; keyboard Enter and arrow selection work.
- Submission reveals independent AI coordinates, actual position, distances, score, country and contributor link.
- Completed all five rounds; round totals and summary table agree.
- Real 60-second no-guess timeout reveals the answer and awards zero to the human.
- Actual `euroguessr-match.json` download exists and contains all five rounds, fixed game rules and model fingerprint. The browser tool's download notification timed out, but the downloaded file was verified on disk.
- Initial observed inference times in one smoke match: 107, 77, 75, 35, 45 ms. Earlier first prediction: 127 ms. Background training was active. These are not controlled benchmarks.
- `artifacts/chrome-desktop.jpg` preserves desktop evidence. Additional final mobile/published-route checks are appended below.

Synthetic smoke-test guesses are not evidence of human-level performance. No human research matches were collected.

## Final checks

- Resume smoke test copied the saved latest checkpoint into an isolated run and successfully completed epoch 10 with restored optimizer/RNG state.
- Cached distillation contract completed a one-epoch smoke run using explicitly synthetic teacher probabilities. This verifies student loss/cache plumbing only; real GeoCLIP teacher inference remains untested. The synthetic run was never exported or published.
- Mobile viewport 390 × 844: model loaded, map keyboard selection and scoring worked, and document width was 375 px with a 390 px viewport (no horizontal overflow). This is desktop Chrome responsive testing, not a physical phone latency measurement. `artifacts/chrome-mobile.jpg` preserves the full mobile layout.
- Final desktop model information correctly displays 1.09M parameters, 1,027/314/180 split counts, 863 km test median error, FP32 CPU inference and human win rate “Not measured.” Final desktop evidence: `artifacts/chrome-final-desktop.jpg`.
- Public asset synchronization passed: 353 registered runtime files across the repository.
- The first site-build minifier rejected top-level await; initialization was moved into an async function and retested.

- Full Jekyll build succeeded in 129.985 seconds. Compiled/minified JavaScript parsed successfully. Chrome loaded `/euroguessr/`, initialized the iframe’s model, performed a real 57 ms CPU prediction, and revealed correct score/distance fields. The existing compiled demo-list blog links to `/euroguessr/`.

## Saved evidence

![Compiled route after reveal](docs/chrome-built-route.jpg)

Desktop screenshot photograph: Mapillary contributor **richlv**, image `164095439050762`, [original source](https://www.mapillary.com/app/?pKey=164095439050762&focus=photo), CC BY-SA 4.0. Screenshot is a resized rendering of the adapted game photograph.

![Mobile layout](docs/chrome-mobile.jpg)

Mobile screenshot photograph: Mapillary contributor **proxym**, image `133526505475291`, [original source](https://www.mapillary.com/app/?pKey=133526505475291&focus=photo), CC BY-SA 4.0. Screenshot is a resized rendering of the adapted game photograph.

## V2 research and UX checks — 5–6 October 2026

The sections above describe the preserved V1 implementation. V2 uses a real pinned GeoCLIP teacher in Docker, replacing the earlier synthetic-only distillation check. The complete comparison and continuation instructions are in [the measured report](artifacts/geoclip-overnight/REPORT.md) and [RESEARCH_V2.md](RESEARCH_V2.md).

- Eight Node tests pass: original scoring/projection/retrieval/preprocessing plus midpoint anchoring, clamping, pointer-count rebasing, cancellation and no accidental pinch guesses.
- Five Docker distillation contract checks pass, including partial coverage, cache checksum/resume identity, normalized projection, compatible encoder warm-start and grid/deadline contracts.
- Docker integration checks pass: uninterrupted two-epoch training equals one epoch plus optimizer/RNG resume; an expired deadline still creates resumable state and exports; frozen-to-two-tail-block fine-tuning changes the spatial weights and exported reference vectors agree with the complete CNN.
- Six differently shaped image fixtures compare the exact JavaScript CLIP bicubic resize/center crop with the pinned AutoProcessor; maximum absolute difference is 2.384e-7. JPEG decoder differences are a separate browser concern.
- Final research manifest has 8,500 train / 961 validation / 363 fresh test plus 180 legacy inspected test examples. Minimum new training-to-holdout distance is 25.002794 km. Validation/fresh-test holdouts also have a 25.015260 km minimum distance from V1's actual training IDs. No public game photograph enters training or fresh test.
- Both original V1 and all V2 candidate measurements use the identical new validation cohort. Fresh test remains separate from inference-method selection and deployment gating.

Chrome computer-agent testing uses the real Chrome browser through `cua_repl`. Source and compiled Jekyll routes have run real WASM CPU predictions. Tiny and the image-only 8-bit GeoCLIP have each completed five-round matches, with reveal pins, keyboard guesses, no-guess timeouts, totals and actual JSON downloads. Model switching replaces the worker to release the larger WASM heap; Tiny → GeoCLIP → Tiny was exercised in the UI.

The synthetic Pointer Event harness passed all ten checks at desktop size and at a **390×844** viewport: real worker ready, photo pinch/reset, map pinch, no guess with one remaining pointer, coordinate placement after arbitrary transforms, visible city tiers, inward clamping and no horizontal game overflow. Pointer capture is stubbed for synthetic IDs. These are desktop responsive/emulated touch checks; no physical phone has been tested. Evidence: [mobile gesture checks](docs/chrome-v2-mobile-gesture-checks.txt), [mobile screenshot](docs/chrome-v2-mobile-gesture-checks.png), and [desktop gesture checks](docs/chrome-v2-gesture-checks.txt).

The optional model is an explicit approximately 320 MiB download. It uses single-thread WASM and opportunistic SHA-verified caching. Observed early Chrome inference ranged from roughly 6–25 seconds under concurrent research load. These measurements do not establish phone performance. The initial Tiny smoke timings ranged from 80–346 ms. Final deployed-model evidence is recorded below.

The first compiled preview failed because plain nginx returned `.mjs` as `application/octet-stream`. The committed Docker preview config serves `.mjs` as JavaScript and `.wasm` as WebAssembly. Chrome then initialized both modes on `http://127.0.0.1:8800/euroguessr/`; production GitHub Pages already serves the vendor module as JavaScript. The first full V2 Docker Jekyll build succeeded in 246.91 seconds under concurrent teacher inference, including JavaScript minification.

Higher-resolution player imagery was recovered without upscaling: 40 photographs total **2,275,521 bytes**, with a highest available source long edge of **910 px**. Source and exported dimensions/checksums are preserved in `game-image-report.json` and `rounds.json`. City data contains 100 offline-ranked Natural Earth Populated Places records. Synthetic guesses and the inspected public photo pack are UI evidence only, not human evaluation or a fresh model benchmark.

## Quantization backend audit and repair

The first UINT8 dynamic-activation export passed native tests but failed the actual Chrome/native comparison. With identical saved Float32 tensors, native/WASM embedding cosine was approximately 0.9901–0.9906 and location differences were 91–320 km. Dequantizing only the patch convolution worsened parity (cosine 0.9803–0.9839; up to 1,564 km). Both variants were rejected for deployment. The precise kernel cause was not established; the observed activation quantization was also sensitive to one-ULP preprocessing changes.

The replacement retains per-channel UINT8 linear weights for storage, dequantizes them for ordinary FP32 matrix multiplication, and uses FP32 patch convolution and GeoCLIP MLP. Chrome successfully loaded it and ran two real WASM inputs. Native Docker comparison of those exact tensors found maximum embedding errors 2.76e-7 and 5.07e-7, with coordinate differences 0.00065 and 0.00498 km. The gameplay JPEG preprocessing was bit-exact against Pillow/AutoProcessor. Six independent shape fixtures likewise have zero Float32 error. This supports backend consistency for the checked inputs; it does not prove every JPEG decoder or physical phone behaves identically.

Evidence: `docs/geoclip-weight-only-parity.json`, `docs/chrome-v2-weight-only-audit.png`; rejected results are retained in the other `geoclip-*-parity.json` reports. Developer-only `tests/runtime-parity.html` downloads actual Chrome inputs and embeddings; `tests/runtime_parity.py` compares them in Docker and fails below cosine 0.9999. The harness and private research assets are excluded from publication. Direct-model checkpoint bundling preserves compressed actual audit downloads and exporter sources. Both native and browser ORT are version 1.23.2. Download size is 334,930,383 bytes before metadata sealing, approximately 320 MiB; resident execution memory is substantially larger.
