# Side projects

Each project owns its source, runtime assets, documentation, tests and tooling.
The website's `_projects/` directory is for write-ups, not application source.

- Games: `block-world` (Robot World), `scrap-orbit`, `dustfall-outpost`, `doom`,
  `pong`, `race`, `robot-runner`, `flappy`, `llm-city-guard`.
- Robotics and learning: `mobile-sorting`, `tiny-dreamer`, `painter`,
  `drone-racing`, `g1`, `slam`.
- Personal assistant: `ask-leo`.

## Publishing and previewing

From the repository root, run `python3 scripts/publish-project-assets.py` before
starting a static preview or building Jekyll. Plain HTML/JS projects are copied
according to `scripts/project-assets.json` into `assets/interactive/<name>/`;
Ask Leo retains `assets/js/ask-leo/`. Add new runtime files to the manifest.
Run with `--check` to detect missing, stale or unexpected generated files.
Do not edit the generated copies. Commit refreshed copies with source changes.

Godot projects retain their `godot/`, scripts and tests here. Their existing
`./scripts/build_web.sh` commands export into `assets/interactive/<name>/`.
SLAM's Vite build publishes separately at `/slam/` through deployment and
`scripts/preview-slam.sh`. All public routes retain their existing URLs.

The `llm-city-guard` project is source-only: no public route or deployment.
Its Android wrapper and third-party submodule pins are retained. Initialize
those dependencies with `git submodule update --init --recursive`. Model
weights, local toolchains, datasets, caches and intermediate outputs stay
untracked. The original standalone repositories are retained locally.

- `rustzero`: Rust/Burn self-play Breakthrough, CPU WASM inference and live MCTS statistics; public route `/rustzero/`.

- `euroguessr`: Europe street-view guessing game with CPU/WASM inference, spatial evaluation and resumable CPU training; public route `/euroguessr/`.

- `g1-loco-manipulation`: OmniContact pretrained 29-joint carry/push controller,
  local browser physics and Docker/native parity tests; public route `/loco-manipulation/`.
