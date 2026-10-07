# TinyEgoVLA validation record

Date: 2026-10-07. Browser: installed Google Chrome, controlled through the Chrome computer-use agent. Viewport overrides test responsive layout; these are not physical-phone hardware or touch-performance measurements.

## Browser checks during development

- Desktop: 1440 × 1000.
- Phone portrait: 390 × 844, plus narrower 320 × 740.
- Phone landscape: 844 × 390.
- Real human/expert MP4s decode and advance; recorded overlays follow playback.
- Human clip selection changes source and train/validation attribution. Overlay mode controls work.
- Human held-out prediction navigation advances the recorded example; architecture disclosure shows actual parameters, loss and CPU time.
- Learned policy replay selects the requested held-out start; playback is synchronized, with shorter episodes holding their final frame. Speed persists across selection changes; restart and keyboard timeline controls are checked.
- Adaptation explains which weights transfer and which output head is discarded. Practice is explicitly marked not performed.

Issues found and fixed through Chrome:

1. Long checkpoint SHA in the method drawer widened portrait layout: permit wrapping and allow grid children to shrink.
2. Large title overflowed the 320-pixel viewport: clamp the mobile title size.
3. Old overlay could linger during asynchronous clip switching: clear the canvas immediately and ignore stale label requests.
4. Changing a rollout reset playback to 1× while showing 2×: preserve default playback rate across video loads.
5. Stage switching during asynchronous playback could leave stale control state: invalidate stale playback requests.
6. Pipeline navigation now scrolls the selected stage into view.
7. Landscape policy frames and metrics are compact enough to inspect alongside playback controls without cropping the actual square robot camera.
8. Seeking against Python’s basic HTTP server was unsupported (Chrome reported zero seekable range). Rechecked using `http-server@14.1.1`, which supports byte ranges: both videos seek exactly to their own final frame and restart at zero. Playback controls remain disabled until both video metadata records load.

The local UI preview uses only completed, real records and is prominently labeled incomplete. Both the experiment tests and production route checker reject preview exports. Final full-export, built-route and live deployment checks are recorded below when complete.

## Offline verification completed before final export

- All 23 best/last checkpoint pairs reload; optimizer states are finite, RNG generators restore, and the selected epoch matches the first exact validation minimum.
- Completed human and paired robot resume calls preserve weights and metrics byte for byte; changing configuration is rejected before training or writes. One interrupted robot run also resumed from epoch 59 through epoch 100.
- All restored/existing raw source files match their original SHA-256 manifest, whose bytes remain unchanged.
- Human clip first/middle/last frames align with the labeled source (RGB mean absolute error about 1.5–2.0 from recompression), with exact frame counts.
- Exact original training-core source files are recoverable from Git using the hashes recorded in every run; they are included in the local continuation bundle.

## Publishing capacity and existing-demo regression checks

GitHub Pages permits a published site up to 1 GB. The existing demo collection plus the new replay grid would exceed that budget if duplicated runtimes were retained. The build now excludes two byte-identical 39,514,754-byte Godot WASM copies; Scrap Orbit and Block Temple explicitly load Block World's engine while retaining their own JS loader and game pack. The source binaries remain in Git. Both export templates use the shared path, and the deployment checker rejects any future binary mismatch.

LanguageVision retains its matching ONNX JS wrapper and shares EuroGuessr's byte-identical 11.35 MiB WASM binary. Its original source binary also remains in Git and is hash-checked during deployment. Three unused legacy Doom engine files were removed from the public manifest; the active root worker and engine remain unchanged. These changes recover approximately 96 MiB.

Chrome source-route regression checks: Scrap Orbit reached its rendered salvage menu and reported `menu, DOCKED`; Block Temple rendered the temple and reached `Enter temple`. Neither reported console errors. Doom reached `READY · LOCAL GAME · BOTS 10` using its retained root worker; no console errors. LanguageVision completed local inference for “something used to tighten screws,” returning region 34 with similarity 0.245 (417 ms); no console errors. The final built-site size is recorded below.

Reference: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

The remaining full-budget evaluator was relaunched after another execution-session termination. Completed episode JSON/NPZ records were retained and validated against the evaluation checkpoint before skipping. The process was then moved to the transient local user service `tinyegovla-evaluation` to decouple it from terminal-session lifetime; it is collected automatically on exit. This changes process management, not the experiment configuration. Public low-resolution replays are compressed at CRF 28 (a sampled RGB MAE of 1.88–2.64 versus the original); originals remain in the local bundle.
