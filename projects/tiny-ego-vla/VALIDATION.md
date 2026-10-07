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
8. Portrait chart labels were too small after SVG scaling: larger mobile labels and wider axis margins improve readability.
9. Seeking against Python’s basic HTTP server was unsupported (Chrome reported zero seekable range). Rechecked using `http-server@14.1.1`, which supports byte ranges: both videos seek exactly to their own final frame and restart at zero. Playback controls remain disabled until both video metadata records load.

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

Additional responsive QA: expanding the exact-results table preserves the document width on the 390-pixel source route (`clientWidth = scrollWidth = 375`, accounting for Chrome's scrollbar). Mobile SVG text was enlarged and axis/legend positions adjusted after a screenshot showed the original labels were too small. Chrome's standard visible-tab capture was used when the CDP clipped capture timed out.

Production layout build: Jekyll completed successfully in 146.129 s using `amirpourmand/al-folio:v0.14.7`, with existing upstream Sass/notebook warnings. Its container lacks Node/npx, so the normal deployment PurgeCSS step was run with the host's Node runtime against the generated `_site`; SLAM's existing built distribution was copied into `/slam/`, matching the deployment workflow. The complete final experiment export is staged into the built static-media directory after its offline audit, then the whole artifact is checked and exercised in Chrome before pushing. CI repeats the Jekyll build from the committed complete export.

## Complete experiment export

- All 180 saved action sequences replayed independently. Every control-step simulator state matched exactly (maximum absolute error 0.0); first-success timing and all official outcomes matched. Three restored-final-pose goal checks differ, as documented in the timing audit and exported data.
- All 180 policy replays plus the three human clips passed H.264/yuv420p, 10 fps, exact frame-count, fast-start, metadata and sampled-frame correspondence checks.
- The transient user service's final Node check initially used system Node 12, which lacks `node:assert/strict`. The same test passes under the project's terminal Node 22.22.0. The finishing script now requires Node 18+ before starting expensive work and supports `TINYEGO_NODE` for service environments. No models, episodes or metrics changed.

## Final built-site Chrome validation

The complete export contains 180 unique rollouts, with preview disabled. Node 22 experiment tests and the deployment route checker pass (21 routes, 92 HTML dependencies). The final built artifact totals 990,271,388 bytes. `validation/build-record.json` records the source checkpoint and hashes.

Chrome computer use tested desktop 1440 × 1000, portrait 390 × 844 and landscape 844 × 390 on the production layout at `http://localhost:8766/tiny-ego-vla/`. All three budget totals, seed/task/start selection, speed persistence, synchronized playback, final-frame seeking and restart passed. Human overlays, held-out prediction navigation, architecture comparison, transfer explanation and the explicit future-RL disclosure passed. The portrait exact-results table stays within the viewport (390/390 document client/scroll width); landscape also has no horizontal overflow. Both landscape policy videos decoded and advanced together. Rapid selector changes briefly disable playback while metadata loads, then recover with no media errors. No console errors were recorded. Screenshots and machine-readable observations are in `validation/built-*.jpg` and `validation/chrome-built.json`.

## Live deployment

[Pages run 37655625548](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/37655625548) successfully deployed commit `0486584dd4bd4cbb66c595775e7ce5c9f5cb9bbc`. Jekyll, TinyEgoVLA export verification, SLAM tests/build, all stable routes and the Pages upload/deployment passed. Scrap Orbit and CodeQL also passed. Repository-wide formatting and external broken-link workflows remain red; both were already failing at the preceding remote commit. A local whole-repository formatting check reports existing vendor/demo warnings and a missing `prettier-plugin-svelte`; TinyEgoVLA authored files and validation JSON were checked separately. These checks do not gate Pages.

The published blog has TinyEgoVLA first in the demo list. Chrome followed that link to [the live exhibit](https://leonardo-maglanoc.com/tiny-ego-vla/); the GitHub Pages hostname redirects to this custom domain. Published `results.json` matches the full audited local file byte for byte (SHA-256 in `validation/live-artifact.json`).

Chrome computer use exercised live desktop, portrait and landscape layouts, including paired playback, alternate seed/task/start selection, expanded exact results and the human timeline/overlays. No console or video errors were observed. This domain has a 1.1 device-pixel scale: initial overrides produced CSS viewports 1309×909, about 355×767 and 767×354 The observed inner dimensions and final adjusted checks are retained in `validation/chrome-live.json`; final screenshots use adjusted overrides to obtain CSS viewports 1440×1000, 390×844 and 844×390. The extra scaled-width checks also showed no horizontal overflow. The browser viewport override was reset after testing. Screenshots are `validation/desktop.jpg`, `portrait.jpg`, `landscape.jpg` and `live-blog.jpg`.

## Sealed continuation checkpoint

`checkpoint-record.json` identifies the local 837,293,053-byte continuation archive at Git checkpoint `ab0d264e573e9e67ab1f94857e51e832f6dbd360`. Read-only verification passed for the whole archive SHA-256 (`b12bddfacce4fb2438fd051c2eb68cc197f37a79b0d7a15f39bcd74990c472b3`) and all 865 internal payload hashes. The archive includes its 866th file, the internal manifest itself. All 46 model best/last files, frozen encoder weights, cached features, pseudo-labels, raw rollout records, exact original training sources and validation evidence are retained. Raw source datasets are restored separately with pinned downloads and SHA verification. The subsequent record/documentation commit intentionally sits outside the archive, avoiding a circular self-hash. Restoration and continuation instructions are in `README.md`.
