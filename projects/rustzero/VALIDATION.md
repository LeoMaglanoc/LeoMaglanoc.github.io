# RustZero v2 validation

Validated on 5 October 2026 on the local Linux desktop. All numbers below come
from the new experiment; the previous 15-generation evidence is superseded and
must be treated as unverified historical evidence.

## Search correctness

The alleged PUCT bug did **not** reproduce in the original checkout: Rust parsed
its exploration term outside the zero-visit `if` expression. The original code
passed the strong-prior first-simulation test. The formula is now explicit:
`Q = 0` for unvisited edges, and prior-weighted exploration applies at every visit
count. A deliberately broken zero-exploration mutant fails that regression.
This is a clarity/regression improvement, not evidence that a PUCT bug was fixed.

Tests cover the first prior-directed simulation, early prior ordering, a lower-prior
forced win overriding the prior, exact root visit accounting, immediate wins,
two-ply losses and a three-ply forced win with alternating value signs.

## Self-play experiment and provenance

- Architecture: 72 → 64 ReLU → (108 logits, 1 tanh); Burn Flex f32 (11,757 parameters).
- Training: 200 generations × 96 games = 19,200 self-play games;
  48,000 Adam steps, batch 128, replay capacity 100,000.
- Search: 128 simulations per self-play move, PUCT 1.5;
  temperature for 12 plies, Dirichlet alpha 0.3 at 25%.
- Learning rate 0.001; training seed 1701; random initialization.
- Recorded phase totals: 741.7 seconds of self-play,
  52.5 seconds of optimization; compilation, arenas
  and tournament time are separate.
- Loss: 4.822 at Gen 1 → 2.338 at Gen 200.
- Source/configuration commit: `c96a628157966959ef5dfdcc3880bf15fac11a06`.
- Exact source/config/checkpoint/metrics SHA-256 hashes: `web/metrics/run-metadata.json`.

No expert games, heuristic labels, tablebases, published solver moves or other
solved-game training data enter self-play. Handcrafted opponents are evaluation
only. The 20-generation preliminary run confirmed learning before the strong run:
greedy-heuristic wins rose from 13/100 to 98/100, heuristic MCTS-256 from 1/100 to
80/100 at a learned-agent budget of 64. Its formal provenance run is retained
locally under `artifacts/v2-corrected-provenance`; its smaller holdout is exploratory
and does not contribute to the final published strength claims. Repeating the
20-generation seed/configuration produced identical final weights on this machine.

## Evaluation and checkpoint selection

Development seed 90210, holdout seed 78123, and
training seed 1701 are distinct. Each opening has 2–4 random legal
plies; each identical position is played with both agent/color assignments.
Random-opponent move sampling uses a separate RNG from opening construction.
Final arenas have 200 persisted holdout openings and 400 games per matchup,
without search noise or temperature. The final holdout suite never influences
training, promotion or tournament selection.

Every five generations: promote above 55% against the current champion in 200
paired development games at 256 simulations. A final round-robin development
tournament compares representative checkpoints plus the incumbent, selecting the
highest total score. The deployed champion is **Gen 200**, selected by evaluation,
not by generation number. Promotion and tournament decisions are recorded in
`promotions.json` and `tournament.json`.

Random samples uniform legal moves. Greedy heuristic rewards progress, captures,
protection and immediate wins. Heuristic MCTS uses uniform priors and a tanh value
based on material, squared pawn progress, advanced threats and protected pawns,
through the same search at 64/256/1024 simulations. Gen 0 and Gen 5 are genuine
random-initialized/self-play checkpoints from this run. Learned opponents use the
same simulation budget as the champion.

Champion at 256 simulations:

| Opponent            | Wins / games | Win rate | Wins as White | Wins as Black |
| ------------------- | -----------: | -------: | ------------: | ------------: |
| random              |      400/400 |  100.00% |           200 |           200 |
| heuristic           |      400/400 |  100.00% |           200 |           200 |
| heuristic-mcts-256  |      400/400 |  100.00% |           200 |           200 |
| heuristic-mcts-64   |      400/400 |  100.00% |           200 |           200 |
| heuristic-mcts-1024 |      398/400 |   99.50% |           200 |           198 |
| gen-0               |      400/400 |  100.00% |           200 |           200 |
| gen-5               |      397/400 |   99.25% |           198 |           199 |

Search scaling versus heuristic MCTS-256:

| Champion simulations | Wins / games | Win rate |
| -------------------- | -----------: | -------: |
| 64                   |      395/400 |   98.75% |
| 256                  |      400/400 |  100.00% |
| 512                  |      400/400 |  100.00% |
| 1024                 |      398/400 |   99.50% |

Search strength is not monotonic in every matchup: 1024 simulations scored
398/400 against heuristic MCTS-256, while 256 scored 400/400. Nightmare uses the
maximum practical desktop budget and scored 400/400 against heuristic MCTS-1024;
this does not prove it is superior at every position.

The publication script gates 256-simulation results at ≥99.5% random, ≥98% greedy,
≥90% heuristic MCTS-256, ≥98% Gen 0 and ≥95% Gen 5, with at least 400 games each.
Full matchups and representative learning progression are in `holdout.json`.
`sample-game.json` records self-play from the latest learner; the deployed champion
is identified separately in provenance.
These are empirical results on a fixed opening distribution, not universal
strength guarantees or statistically calibrated Elo ratings.

## Automated and Chrome validation

- Native rules, MCTS, checkpoint, training and history tests; formatting; strict Clippy.
- Tiny two-generation self-play → checkpoint → paired arena → native/WASM parity smoke.
- Rebuilt Rust WASM; six-position native/WASM inference parity and complete legal games.
- Actual Worker cancellation at 1024 simulations; completed 64/256/512/1024 budgets.
- Artifact metadata/hash/source consistency; publication asset manifest consistency.
- Chrome computer use: actual pawn/destination clicks, legal AI replies, local and
  AI game completion; visible win/loss banners; terminal Undo/Redo and Play again.
- Chrome: Nightmare selects the champion, makes AI White and records 1024 visits;
  Fast/Strong budgets and checkpoint switching; responsive narrow viewports.

- 64 simulations: Chrome displayed Last move 6 ms · first inference 4.00 ms; 64 root visits.
- 256 simulations: Chrome displayed Last move 29 ms · first inference 3.30 ms; 256 root visits.
- 1024 simulations: Chrome displayed Last move 143 ms · first inference 3.30 ms; 1024 root visits.

Nightmare uses 1024 simulations in the Worker, streamed in 32-simulation chunks
with zero-delay yields. UI interactions do not need artificial 8 ms pacing. The
position value is a learned estimate, not a mathematically exact win probability.
Chrome screenshots/observations are retained locally under `artifacts/chrome-v2/`.
ADB reported no connected devices; actual physical Android latency/play is unverified.

## Limitations

[6×6 Breakthrough is solved as a first-player win](https://cris.maastrichtuniversity.nl/en/publications/solving-breakthrough-for-the-6x6-board/).
RustZero is a learned playing agent, **not a formal solver**. An optimal White
player can theoretically defeat a Black AI. Nightmare therefore defaults to AI
White, with human White still available. There has been no structured human
challenge study; no claim of being unbeatable by humans is made.

The fixed held-out opening distribution limits generalization claims. Single-seed
training does not establish across-seed reliability. Exact floating-point
reproducibility across CPU/backend versions is not guaranteed; committed provenance
and native/WASM parity establish traceability and numerical agreement on fixtures.
Tree reuse and a larger network were not needed to pass the measured strength gates.
