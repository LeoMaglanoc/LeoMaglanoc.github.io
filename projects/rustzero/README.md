# RustZero

A self-play AlphaZero-style agent for 6×6 Breakthrough. Rust implements the rules,
policy/value network, PUCT search, replay buffer and Adam training. The same engine,
network and search run through WASM in a Web Worker. JavaScript presents the game.
No inference server, WebGPU, expert games, heuristic labels or solver data are used.

The network is a 72 → 64 ReLU MLP with 108 policy logits and one tanh value
(11,757 parameters), using Burn 0.21 Flex f32. Inputs and actions use the current
player's canonical perspective. Search masks illegal actions, retains priors on
unvisited edges, and flips the value sign on each backup. Reflections augment
self-play states and policies. The strong configuration samples root visits for
12 plies and applies Dirichlet(0.3) root noise at 25% during self-play only.

## Reproduce an experiment

From `projects/rustzero`, with Docker and Python 3.11+ installed:

```sh
docker compose build
docker compose run --rm rustzero cargo test --locked --release --features training -j 3
python3 scripts/run-experiment.py configs/corrected.toml artifacts/corrected-run
python3 scripts/run-experiment.py configs/strong.toml artifacts/strong-run
python3 scripts/publish-run.py artifacts/strong-run
sh scripts/validate-published-run.sh
docker compose run --rm rustzero sh scripts/build-web.sh
node scripts/check-wasm.mjs
node scripts/check-worker.mjs
node scripts/benchmark-worker.mjs
```

Commit the experiment sources/configuration first. The runner rejects dirty
sources and existing output directories, records the source commit and hashes,
trains from random initialization, runs a development tournament and then runs
held-out evaluation. Full local output stays under ignored `artifacts/`.
Publication stages and verifies all output, including the strength thresholds,
before replacing the website's evidence. After publication, update the repository's
`scripts/project-assets.json` with the staged files, then run
`python3 scripts/publish-project-assets.py` from the repository root.

`configs/smoke.toml` runs two generations with two games, eight simulations and
three optimizer steps. CI runs this through checkpoint export, arena, native
inference and WASM parity; full strength training stays outside CI.

## Evaluation and selection

Each deterministic opening suite contains positions after 2–4 random legal plies.
Every opening is played twice, once with each agent in each color. The opening RNG
is independent of in-game random moves. Training seed, development seed 90210 and
holdout seed 78123 are separate. Persisted opening positions and artifact hashes
make the protocol inspectable.

Every five generations, a candidate is promoted if its paired development win
rate against the champion exceeds 55%. Training continues regardless. A final
round-robin development tournament compares representative generations and the
incumbent; its highest total score selects the deployed checkpoint. Holdout
results never select a checkpoint or alter training. Matchups use 400 games and
256 simulations per learned agent, with separate 64/512/1024 scaling evaluations.

Baselines: uniform random legal moves; the original one-ply greedy progress/
capture/protection heuristic; heuristic MCTS at 64, 256 and 1024 simulations;
untrained Gen 0; and historical self-play checkpoints. Heuristic MCTS uses uniform
priors and a tanh material/progress/threat/protection evaluation through the same
PUCT search. It supplies evaluation opponents only. Neither handcrafted evaluation
nor its moves enter the training replay.

See [VALIDATION.md](VALIDATION.md) and `web/metrics/` for the current measured
results, provenance, selection decisions and limitations. Pre-v2 measurements
are historical, unverified evidence and are superseded by the new experiment.
The PUCT bug alleged in the plan was not reproduced: Rust already parsed the
original exploration term outside the zero-visit branch. The new explicit formula
and regression tests protect the intended behavior without claiming a nonexistent
fix caused the strength improvement.

## Browser

Fast uses 64 simulations, Strong 256, and Nightmare 1024. Selecting Nightmare
loads the champion and makes the AI White by default; players may subsequently
choose White themselves. Search streams statistics every 32 simulations and yields
with a zero-delay timer so cancellation remains possible. The value is a learned
position estimate, not an exact winning probability.

New games and checkpoint changes replace the Worker. Epochs and request IDs reject
stale results. Local two-player mode runs rules/history without a neural model.
Undo/Redo steps one ply locally and a human turn against the AI. Playing after Undo
truncates the abandoned continuation. A prominent result banner preserves the final
board, announces the winner and offers Play again; Undo/Redo update it correctly.

The stable public route is `/rustzero/`. The tracked WASM and runtime are copied
through the existing project asset manifest for Jekyll/GitHub Pages deployment.

## Limits

6×6 Breakthrough is solved as a first-player win, as reported by
[the independent research](https://cris.maastrichtuniversity.nl/en/publications/solving-breakthrough-for-the-6x6-board/).
RustZero is a learned playing agent, not a formal solver. Benchmark victories do
not prove optimal play or invincibility against humans. Physical Android results
require actual hardware; Chrome viewport checks establish layout only. Exact
floating-point reproducibility across every CPU/backend is not guaranteed.
