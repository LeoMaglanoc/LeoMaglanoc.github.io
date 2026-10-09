# Featured demo integration validation

Validated October 9, 2026 using Docker containers and the Chrome computer agent.
No model weights, game rules, policy code or training artifacts changed.

## Delivered changes

- Homepage fourth card now points to `/rustzero/`, with an authentic 960×600
  gameplay WebP (~32 KiB), concise description and alt text. The first three
  entries, shared Liquid template and responsive CSS remain unchanged.
- Root README now has a demo comparison, four technical chapters (overview,
  architecture, subsystem I/O, algorithms, training, deployment and limitations),
  Docker setup, browser/deployment notes and provenance/credits. Existing other
  experiments, repository map and editing instructions are retained.
- The blog already linked RustZero. Its single existing entry now explains that
  it is 6×6 Breakthrough against a locally trained self-play AI; BlockTemple stays
  linked and deployed.
- Root Docker preview now mounts `scripts/nginx-preview.conf`, serving `.mjs`
  as JavaScript and `.wasm` as WebAssembly. The stock nginx MIME configuration
  prevented the dexterous actor's module import. The same fix was already used
  by EuroGuesser's dedicated preview. No production runtime change was needed.

## Chrome checks

| Page                       | Desktop                | Phone portrait         | Phone landscape      | Interaction/result                                                                                                                   |
| -------------------------- | ---------------------- | ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Homepage                   | 1440×1100; two columns | 390×844; single column | 844×390; two columns | Exactly four expected cards, 960 px source images, RustZero alt/link/description; no horizontal overflow                             |
| RustZero                   | 1440×1100              | 390×844                | 844×390              | Champion loaded, 1024 root visits; legal human moves and AI replies at each size; portrait Undo/Redo restored the continuation       |
| Humanoid Walking           | 1440×900               | 390×844                | 844×390              | Physical scene and actor loaded; push counter advanced, Pause displayed, controls/rendering fit each size                            |
| Dexterous Cube Orientation | 1440×900               | 390×844                | 844×390              | Loaded after MIME correction; initial goal reached, Random changed target error, Pause worked; physical hand/cube and target visible |
| EuroGuesser AI             | 1440×900               | 390×844                | 844×390              | Tiny model ready, real photo inference, keyboard map pin and scored reveal; attribution and map visible in responsive layouts        |

The homepage link was followed to RustZero. Blog navigation was checked against
its generated demo list; there is one RustZero link and BlockTemple remains.
Phone checks use Chrome viewport overrides on the desktop, not physical phones.
Long games/pages scroll vertically in short landscape viewports.

RustZero and humanoid checks showed no application console errors. The hand
runtime emitted an ONNX Runtime CPU-vendor warning through an error-level console
entry; inference still initialized and reached a goal. The original MIME import
failure was reproduced, fixed at the preview server and confirmed with a fresh
local origin (`127.0.0.1`) to avoid Chrome's cached invalid module response.
This smoke test does not repeat the full historical robotics success studies or
download the optional 320 MiB GeoCLIP model.

## Docker commands and results

Commands are run from the repository root:

```bash
docker compose run --rm jekyll bundle exec jekyll build
docker compose up -d preview

docker compose -f projects/rustzero/docker-compose.yml run --rm rustzero \
  cargo test --locked --release --features training -j 3

docker compose run --rm site-tools sh -c \
  'node projects/rustzero/scripts/check-wasm.mjs && node projects/rustzero/scripts/check-worker.mjs && node --test projects/g1/tests/*.test.mjs projects/euroguessr/tests/*.test.mjs'

docker compose -f projects/dexterous-rl/compose.yaml run --rm research \
  python projects/dexterous-rl/tools/verify.py

docker compose -f projects/euroguessr/compose.yaml run --rm research \
  python tests/distillation.py

docker run --rm -v "$PWD:/work:ro" -w /work python:3.10-slim \
  python scripts/publish-project-assets.py --check
```

- Jekyll built successfully; existing Sass deprecation/nbconvert lexer warnings
  are unrelated to this change.
- Rust native training/rules/search/history tests: **18 passed**.
- Actual WASM inference parity: **passed**, max policy-logit error
  0.00000762939453125; complete legal WASM game: 35 plies. Worker local history,
  AI history and abandoned-search cancellation: **passed**.
- G1/EuroGuesser Node checks: **16 passed**.
- Dexterous checkpoint/archive hashes, policy metadata, native MuJoCo 3.11.0
  scene, `[1,207]` → `[1,20]` actor and 35 unchanged meshes: **passed**.
- EuroGuesser distillation tests: **6 passed**.
- Publication manifest: **548 runtime files checked**.

The all-project link checker expects CI's separately built SLAM route, which a
Jekyll-only build omits. The SLAM Vite build and asset tests passed in the tools
container (411 trajectory samples, four ICL sequences, 15 sweep results and
three held-out finalists). Its generated `dist/` is copied into `_site/slam/`
exactly as the deploy workflow does. The workflow's `purgecss@6.0.0` step is
also run in Docker before `scripts/check-project-links.py`; the unpurged
preview is slightly above the checker's 1 GB budget.
This assembly changes only ignored build output. The final checker passed:
**22 public project URLs, 90 HTML dependencies, all manifest files**, with a
**999,365,110-byte** published tree, below the configured 1 GB budget. Chrome
rechecked the homepage columns and lack of horizontal overflow after CSS purging.

Markdown/local links, formatted files and whitespace are checked before commit.
The root README's relative file links resolve; its four subsystem tables and
separate offline/online diagrams are rendered with the Docker image's GFM parser
for visual inspection. The source audit records the evidence and missing upstream
run details in [featured-demo-evidence.md](featured-demo-evidence.md).

## Verified learning claims and remaining gaps

- G1: released recurrent PPO actor; local export/inference/servo contract verified.
  Original checkpoint-specific rewards, optimizer/run settings and curves absent.
- Wuji: released PPO actor/config, hand/cube environment and reward implementations
  retained. Release settings and evaluation are verifiable; original run history
  and realized curriculum are absent. No local retraining or distillation.
- EuroGuesser: local OSV-5M student supervision plus covered GeoCLIP CE/KL/cosine
  distillation, matched deployment and recorded geographic error. GeoCLIP/CLIP
  pretraining is external; overlap with evaluation data cannot be ruled out.
- RustZero: local CPU self-play, search-visit policy targets, terminal-outcome value
  targets, equal CE/MSE loss and Adam; saved run/evaluation evidence. Exact CPU
  model/core allocation is missing; held-out results are one seed/fixed openings.
