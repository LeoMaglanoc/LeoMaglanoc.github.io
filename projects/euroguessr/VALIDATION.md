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
