# RustZero

A small AlphaZero-style experiment for 6×6 Breakthrough, implemented in Rust.
The same engine, policy/value model and PUCT search run natively and in a browser
Web Worker through WebAssembly. No inference server or WebGPU is required.

## Architecture

`Breakthrough → MCTS ← policy/value network → self-play → replay → Adam → updated network`

The board uses two 36-bit bitboards. White moves from row 0 toward row 5; Black
moves in the opposite direction. Actions are canonical square × 3 + direction
(left, straight, right), rotated 180° for Black. Two input planes represent own
and opposing pieces. Horizontal reflection augments both states and policies.

To keep this experiment small, the proposed residual CNN is replaced by a shared
72 → 64 ReLU MLP with 108 policy logits and a scalar tanh value. It has 11,757
parameters and uses Burn 0.21 Flex on CPU for both training and WASM inference.
Policies are masked to legal actions before softmax in search. Edge Q values use
the parent perspective; each backup flips the value sign.

Self-play samples root visits for the first ten plies, then chooses the most
visited move. Dirichlet noise is enabled only in self-play. The bounded replay
buffer holds 25,000 examples including reflections. Adam minimizes policy cross
entropy plus outcome MSE. Neither heuristic play nor solved-game knowledge is
used in training.

## Docker commands

Run from `projects/rustzero`:

```sh
docker compose build
docker compose run --rm rustzero cargo test --locked --release --features training -j 3
docker compose run --rm rustzero cargo run --locked --release --features training --bin train -- configs/debug.toml artifacts/debug
docker compose run --rm rustzero cargo run --locked --release --features training --bin train -- configs/train.toml artifacts/train
docker compose run --rm rustzero cargo run --locked --release --features training --bin selfplay -- web/models/gen-0.json
docker compose run --rm rustzero cargo run --locked --release --features training --bin arena -- web/models/final.json 200 64 artifacts/arena.json
docker compose run --rm rustzero cargo run --locked --release --features training --bin evaluate -- artifacts/train artifacts/holdout.json
docker run --rm -v "$PWD:/work" -w /work node:22-bookworm-slim sh -c 'node scripts/check-wasm.mjs && node scripts/check-worker.mjs'
docker compose run --rm rustzero cargo run --locked --release --bin play
docker compose run --rm rustzero sh scripts/build-web.sh
```

Configs bound the training run explicitly; a debug run precedes the full run.
Checkpoint JSON stores actual Burn weights, architecture, generation, global
step and seed. The experiment configuration and arena metrics are stored beside
the checkpoints. Published models and metrics live under `web/` and are tracked;
large local experiment outputs under `artifacts/` are ignored.

## Measured result

The 15-generation CPU run produced five published agents (Gen 0, 2, 4, 8 and 15).
Gen 15 won 200/200 against random, 190/200 against the heuristic and 198/200 against
Gen 0 in held-out 200-game arenas at 64 simulations per move. At one simulation,
random-opponent wins improved from Gen 0's 104/200 to Gen 15's 200/200. See
`web/metrics/holdout.json` for all results, including side breakdowns and historical
opponents. No statistical Elo or optimal-play claim is made.

## Evaluation

Arena games alternate the learned agent's starting side and use two seeded random
opening plies to diversify positions. Search noise and temperature are disabled.
Random chooses uniformly; the simple heuristic rewards progress, captures,
protection and immediate wins. Historical network opponents use the same search
budget. The JSON reports wins, losses, side breakdown, game length and seeds.
No Elo is claimed. See VALIDATION.md for measured outcomes and browser checks.

## Browser

`web/worker.js` initializes Rust WASM, loads the selected checkpoint, and advances
MCTS in chunks. The main thread renders root visits as they arrive. All legal
moves, transitions, termination, search and neural inference come from Rust.
New game and checkpoint changes terminate the old worker so stale results cannot
mutate a new game. Visitors may play either side, or select local two-player mode. Local mode loads
only the Rust rules/history engine: no model is loaded, no inference runs and
neither side is controlled by the CPU. Undo/Redo steps one ply in local mode and
rewinds/replays a human turn (normally two plies) against the AI. Histories live
in Rust; playing a new move after Undo discards the old continuation. Search
cancellation uses worker epochs and message IDs to reject stale results. The board uses native buttons
with keyboard focus, descriptive square labels and destination highlighting.

The site publishes `/rustzero/`; the runtime is copied by the existing project
asset manifest. WASM binaries are checked in, allowing normal Jekyll deployment
without compiling Rust in the Pages job. Rebuild them after Rust source changes.

## Why Breakthrough and Rust?

Breakthrough has a tiny ruleset, 108 fixed actions and useful tactical depth.
6×6 has an independently established first-player win; this experiment does not
prove or receive that result. Learned play is not a formal solution. Rust lets
this project share engine, training, inference and search across native and web
builds; it does not establish superiority over other languages.

## Limits

This is a modest CPU learning experiment, not an optimal player. Search budget,
checkpoint choice and opening distribution affect results. Narrow Chrome
viewports can verify layout, but do not establish physical Android performance.
Exact floating-point reproducibility across targets is not promised; published
fixtures check native/WASM output agreement within tolerance.

References: [Burn 0.21](https://burn.dev/blog/release-0.21.0/),
[AlphaZero paper](https://arxiv.org/abs/1712.01815),
[wasm-bindgen](https://wasm-bindgen.github.io/wasm-bindgen/).

The independent solved-game reference is
[Solving Breakthrough for the 6×6 Board](https://cris.maastrichtuniversity.nl/en/publications/solving-breakthrough-for-the-6x6-board/),
which reports a weak solution and first-player win. It supplies context only.
