# RustZero validation

Validated on 5 October 2026 using Docker on the local Linux desktop and the
user's Chrome through computer use. Physical Android hardware was unavailable.

## Learning experiment

A genuine random-initialized Burn 0.21 Flex network learned from self-play only.
Architecture: flattened two-plane 6×6 input → 64 ReLU units → 108 logits and one
tanh value (11,757 parameters). This replaces the proposed residual CNN to keep
native training and CPU/WASM inference small. No expert games, heuristic labels,
endgame tablebases or solved-game knowledge entered the replay buffer.

Configuration: seed 17, 15 generations, 24 games/generation, 48 PUCT simulations,
120 Adam steps/generation, batch 64, learning rate 0.002, replay limit 25,000.
Self-play uses Dirichlet(0.3) noise at 25% and samples root visits for ten plies.
Reflections augment states and policies. Final replay: 22,392 examples; 1,800
optimizer steps. Mean training loss decreased from 4.860 at Gen 1 to 3.102 at
Gen 15. The recorded phases total 4.137 seconds of self-play and 0.990 seconds
of optimization; evaluation, compilation and startup are separate.

Held-out arena seed 78123, 200 games per matchup, alternating starting sides,
two random opening plies, no search noise, 64 simulations for learned opponents:

| Checkpoint | vs random | vs heuristic |
| ---------- | --------: | -----------: |
| Gen 0      |   190/200 |       28/200 |
| Gen 2      |   194/200 |       54/200 |
| Gen 4      |   200/200 |      151/200 |
| Gen 8      |   200/200 |      182/200 |
| Gen 15     |   200/200 |      190/200 |

Gen 15 also won 198/200 vs Gen 0, 200/200 vs Gen 2, 189/200 vs Gen 4,
and 163/200 vs Gen 8 at the same 64-simulation budget.

Search alone makes an untrained network strong against random, so a one-simulation
control matters: random-opponent wins rose from Gen 0's 104/200 to Gen 15's
200/200; heuristic-opponent wins rose from 0/200 to 161/200. These comparisons
support actual learning rather than attributing all search strength to training.
A single held-out seed and modest arena do not establish universal strength or
statistically meaningful Elo. This does not solve Breakthrough formally.

Evidence: `web/metrics/training.json`, `arena.json`, `holdout.json`, `config.json`,
`sample-game.json` and five actual weight files under `web/models/`.
The validation seed was not used to generate or label training examples.

## Automated checks

- 14 native Rust tests pass: setup, movement, captures, blocking, illegal moves,
  terminal states, action round trips, canonical perspective, reflection,
  random-game invariants, visit totals, forced wins, two-ply value signs,
  deterministic search, output dimensions/bounds, checkpoint round trip,
  optimizer overfit/weight changes, self-play labels/masking and reversible history.
- `cargo fmt --check` and strict Clippy pass.
- Native/WASM parity across six positions: identical legal action IDs,
  maximum policy-logit error 0.00000190735; values agree within 0.0001.
- The actual WASM engine completes a 36-ply search-vs-search game, then resets;
  invalid moves and invalid checkpoints are rejected.
- Model-free two-player WASM mode completes a game, reverses/replays a terminal
  move, preserves turn/board history and truncates an abandoned continuation.
  Attempting inference or search in model-free mode fails explicitly.
- Paired AI undo/redo restores the original position. An automated test executes
  the actual browser Worker via a thin Node adapter, cancels an active 256-search
  move after its first chunk and confirms the abandoned search never plays.
- Docker Jekyll build, existing SLAM test/build/assets steps and the project-route
  checker pass. Asset manifest verifies 282 runtime files and all 16 public project
  URLs with 73 HTML dependencies. Existing project routes remain intact.

CI reproduces native tests, formatting, WASM build, inference fixtures and
WASM/Worker checks. The published runtime is built from the same Rust core;
JavaScript implements presentation and messages, not rules, search or inference.

## Chrome computer-use checks

The real Chrome browser exercised the built `/rustzero/` iframe route and the
standalone runtime. Verified:

- Clicking/tapping a pawn highlights legal destinations. Enter also selects a
  pawn and makes a move. The AI produces legal replies; root visits match the
  selected budget and candidate percentages appear during/after search.
- Complete AI games reach a visible win/loss state (10 plies as human White;
  11 as human Black). A game also completed after undo/redo recovery at a
  256-simulation budget.
- Early checkpoint selection changes the visible opponent/evidence, and New game
  and reload restore a playable opening. Checkpoint switching ends old workers.
- Local two-player mode gives Black the turn after White's move, with zero search
  visits and no model. A complete 13-ply game displays White's win.
- Local Undo and Redo restore turn and board, including after a win. Playing an
  alternative move after Undo disables Redo. AI Undo restores the human move and
  reply together, and AI Redo restores the saved position.
- Reset and Undo recover from AI thinking without freezing the page. Worker
  request IDs reject stale messages, complementing the cancellation test.
- Expandable explanation, real learning curve and arena-data link are present.
- Portrait 390×844 and landscape 740×360 viewports fit without horizontal overflow.
  These are desktop Chrome viewport checks, not physical phone performance tests.

Chrome local measurements: engine/model startup 22–83 ms across observed loads;
first inference 0.1–8.6 ms (cold/warm differences); 64-search moves around 67–77 ms,
256-search moves around 271–285 ms. Search deliberately yields 8 ms per eight
simulations so the streamed visualization is visible. These times include that
pacing, and do not represent raw search throughput. Native warm inference averages
0.005 ms over 1,000 calls; native 128-search move: 0.869 ms on this machine.

Screenshots are saved locally under `artifacts/chrome/` and excluded from source
control. The website links to source and this report.

## Deployment and limits

Public route: <https://LeoMaglanoc.github.io/rustzero/>. The AI Coding Agent Case
Study blog post links directly to it. Existing GitHub Pages deployment copies the
tracked runtime through the project manifest and builds Jekyll. Five checkpoints,
WASM, Worker and machine-readable evidence are shipped with the site; no server
or WebGPU is required.

Physical Android play/performance remains unverified; it must be checked on a
real device. Numerical reproducibility across every CPU/backend is not guaranteed.
The small MLP and finite self-play run limit strength; individual generations can
regress even though the retained checkpoints improve in the published arenas.
