# Validation and publication evidence

## Physics and parity

| Check | Cube | Cylinder |
|---|---:|---:|
| Native fresh nominal resets | 20/20 | 20/20 |
| Native predeclared ±5 mm offsets | 10/10 | 10/10 |
| Browser fresh nominal resets | 10/10 | 10/10 |
| Disabled object contacts | FAILED as expected | FAILED as expected |
| Saved lifted checkpoint resumed to verified placement | Passed | Passed |

`results/native-evaluation.json` has every trial's phase-boundary poses, velocity, control targets, joint errors, grip position, contact counts and failure reasons. `results/browser-evaluation.json` uses the same success oracle; the final20 runs were repeated against the actual Jekyll/minified output after fixing scene-byte preservation. The disabled-contact negative control never reports Success. Native tests additionally remove contact after a verified lift and require a lost-grasp failure. The six unit tests pass in the final pinned Docker image.

`results/parity.json` records componentwise native/browser differences across all ten phase boundaries. Timings, controls and contact counts are identical; cube matches to floating-point roundoff, cylinder maximum position difference ~0.021 mm, joint difference ~0.000028 rad and velocity difference ~0.000280 m/s. These small numerical/solver differences remain far below declared comparison tolerances (1 mm position, .001 rad joints, .01 m/s velocity). Nothing is corrected or snapped to improve agreement.

## Browser validation

Installed Chromium154 + pinned Playwright1.58.2 on cloud Linux, with SwiftShader software WebGL. The user accepted viewport/touch emulation in place of physical Android. There was no Chrome computer-agent tool or phone attached. No physical-phone FPS or peak process memory claim is made.

Desktop1440×900, phone portrait390×844, and landscape844×390 all completed Cube and Cylinder using live MuJoCo. Automated checks cover visible44 px controls, no horizontal overflow, pause freezing sim time exactly, resume, reset clearing the controller/returning to the settled initial scene, selector switching, About, no missing requests or page exceptions. Landscape camera framing was adjusted after visual inspection so the grasp is visible. Screenshots: `results/{desktop,phone-portrait,phone-landscape}{,-grasp,-placed}.png`.

`results/browser-contracts.json` covers40 resets with stable WASM heap/render-object counts, persisted pagehide, Back navigation, a scrollable landscape About panel, and deliberate503 scene loading producing a meaningful error with disabled Run. Two real-time CDP Chrome screencasts (no pose replay) are `results/cube-screen-recording.webm` and `cylinder-screen-recording.webm`, with actual timestamps encoded using ffmpeg. They show both objects reaching verified placement.

Rendering was optimized separately from physics: original~104,574 triangles per arm →15,303 triangles per arm using render-only3 mm vertex clustering. All original STL files, exact MuJoCo model/collisions and the physical oracle are unchanged. The phone canvas pixel ratio is bounded at.85 (desktop1); CSS controls retain native resolution. The original renderer produced approximately1–3 FPS under software rendering while other validation jobs ran; before/after raw observations are retained. Rendering uses a bounded fixed-step accumulator; overload slows simulation pace, never increases physics timestep or skips controller phases.

`results/viewport-validation.json` contains the functional/visual run's frame samples, load times, memory and complete resource sizes. It included concurrent build/recording work and missed the25 FPS target in this software environment. `results/performance-isolated.json` records a separate six-second per-viewport measurement against the actual Jekyll/minified output without concurrent builds or recordings. JS and WASM peak values are **sampled** once per second during that interval; they are not peak browser RSS or Android memory. See the measured table below; it is generated from those raw results. Network transfer/load figures are for local Docker HTTP, not mobile WAN.

| Viewport | Render FPS | Physics pace | Local ready (ms) | Sampled JS peak (MiB) | WASM heap (MiB) |
|---|---:|---:|---:|---:|---:|
| desktop | 15.0 | 1.00× | 953 | 21.6 | 125.1 |
| phone-portrait | 25.2 | 1.00× | 936 | 20.0 | 125.1 |
| phone-landscape | 23.2 | 1.01× | 960 | 21.7 | 125.1 |

Uncompressed local runtime resources total approximately18.2 MB (including the reused10.1 MB MuJoCo WASM). The25 FPS aim was met in portrait and narrowly missed in landscape on SwiftShader; desktop software rendering is slower at its larger resolution. This is not a physical Android performance claim.

## Website build and checks

The existing site's asset publisher and its --check mode pass. Jekyll production build runs inside the Ruby3.3.5 Docker image using the committed Gemfile.lock; the native physics image uses a pinned Python3.12 digest and exact Python dependencies. Existing SLAM production build/unit/assets checks and Party Panic production build/104 tests pass with no tracked changes to those projects.

Two production-only issues were found and fixed: Terser rejected top-level await (startup now uses an async function); Jekyll XML minification changed scene bytes and invalidated the scene/reference SHA256 contract (YAM scene assets are excluded from minification). The site link checker additionally verifies the published scene hash so this cannot silently recur. The final build/link logs are `results/jekyll-build.log` and `results/site-links.log`; all18 public routes and62 HTML dependencies plus runtime manifests pass. Existing Sass deprecation/IPython lexer warnings are unrelated to this change.

The one existing demo list in `_blogs/2025-12-28-AI-coding-agent-case-study.md` links to `/yam-sandbox/`. No shared renderer, existing demo source, or model weights are modified. Checkpoint commits A/B/C/D preserve baseline, native controller, browser port and integration/evidence respectively. The user explicitly requested direct push of all commits to main after initial feature-branch checkpoints; no PR approval gate is required.

## Commands and evidence map

Actually run (see README for portable commands):

- Pinned-model download; attachment structural tests; original scene `run_sim.py --headless --seconds 4` in Docker; scene baseline inspection.
- `docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -t yam-sandbox:lab projects/yam-sandbox`.
- Native scene/reference generation, trial diagnostics, full evaluation (rerun after lost-contact review correction), six unit tests, checkpoint save/restore.
- Browser20-run evaluation and negative controls, native/browser comparison, three-viewport functional/visual tests, lifecycle/resource/load-error contracts, CDP recordings, isolated performance measurements against built assets.
- `python3 scripts/publish-project-assets.py` and `--check`; pinned Ruby Docker dependency install and `JEKYLL_ENV=production bundle exec jekyll build`; existing SLAM/Party Panic build/tests; final site route/runtime/hash check.
- `python3 projects/yam-sandbox/tools/check_artifacts.py`, JS syntax checks and `git diff --check`.

## Remaining scope

Fixed scripted targets only; arbitrary positions, different object sizes, simultaneous arms and learned-policy inference are unsupported. Larger perturbations can fail and report a timeout or lost grasp. Physical Android performance, mobile WAN load time, peak process memory and broad GPU/browser coverage remain unmeasured. Future model/controller changes require new native/browser evaluations and new version-matched checkpoints.
