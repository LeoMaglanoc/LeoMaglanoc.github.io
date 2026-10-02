# TinyDreamer CartPole

A small Dreamer-inspired agent for DeepMind Control Suite's native
`cartpole/swingup`. It learns a recurrent world model from real experience and
trains its actor through imagined rewards. The interactive demo runs MuJoCo
physics and the exported neural networks locally in the browser, with no API
or runtime CDN dependency. This is an educational implementation, not a
reproduction of DreamerV3.

There is no handcrafted controller, imitation teacher, or model-free fallback.
The blue future poses are decoded neural predictions, not a MuJoCo rollout.

## Algorithm

TinyDreamer alternates real experience collection, world-model learning, and
actor–critic learning inside the world model. The recurrent state-space model
(RSSM) maintains a belief `(h, z)`: a 64-dimensional GRU memory `h` and eight
categorical variables with eight classes each in `z`. Concatenating them gives
the 128-dimensional feature used by the decoder, reward head, continuation
head, actor, and critic.

At decision `t`, the previous action advances the recurrent memory. The prior
predicts the latent state from that memory alone; the posterior also incorporates
the encoded current observation:

```text
h[t] = GRU(h[t−1], MLP(z[t−1], action[t−1]))
prior z[t]     ← h[t]                         # imagined transition
posterior z[t] ← h[t] + encoder(observation[t]) # real observation correction
action[t]     ← actor(h[t], z[t])
```

The implemented training loop is:

1. **Collect experience.** Prefill replay with 4,000 exploratory decisions, then
   warm up the world model for 2,000 updates. Online collection uses the actor
   with sampled actions and additional Gaussian exploration. Each action is
   held for five native MuJoCo controls; replay stores observations, actions,
   mean rewards, continuation targets, and episode boundaries.
2. **Learn the world model.** Sample batches of 16 sequences with 32 transitions
   each. Unroll the posterior and minimize observation reconstruction MSE,
   reward MSE, continuation BCE, balanced posterior/prior KL, and one-step prior
   observation MSE. Categorical samples use straight-through gradients. From
   stage 2, add five-step open-loop observation/reward supervision using replay
   actions, so the prior learns to predict without repeated observation input.
3. **Imagine behavior.** Sample 64 detached posterior states, excluding the first
   five positions of each sequence to allow recurrent warmup. Roll out the actor
   through the learned prior, predicting reward and continuation at each step.
   The horizon starts at 15 decisions and reaches 30 in the final stage. World
   model parameters are frozen during this update, while gradients still flow
   through its transitions to the actor. Imagination makes no environment calls.
4. **Improve actor and critic.** Compute bootstrapped lambda returns with
   discount `0.99`, lambda `0.95`, and predicted continuation. Train the actor to
   maximize continuation-weighted returns and the critic to regress their
   detached values. Move the target critic 2% toward the current critic after
   each update. Refined imagination uses categorical probabilities; actions
   remain sampled during actor training.
5. **Repeat and select.** Run two updates every five online decisions. Validate
   every 5,000 decisions and save the best checkpoint by return plus sustained
   swing-up success. Evaluate the selected checkpoint on separate held-out
   seeds before export. The Docker commands below reproduce the three stages.

The browser executes the trained actor directly. It does not search over action
sequences at runtime; its imagined trajectories visualize the actor's predicted
future behavior.

## System pipeline

### Offline training and export (Docker, CPU)

```text
Native dm_control cartpole/swingup + MuJoCo
    │ observations, held actions, mean rewards, continuation
    ▼
Episode replay → sequence batches → encoder + RSSM posterior
                                      │
                                      ├→ decoder / reward / continuation losses
                                      └→ posterior start states
                                                │
                                                ▼
                              actor → RSSM prior → imagined reward / continuation
                                ▲                         │
                                └── actor gradients ─────┤
                                              lambda returns → critic + target
    ▲
    └──────── updated actor collects more real experience

Selected checkpoint → held-out evaluation + world-model diagnostics
    → ONNX export + native/ONNX numerical parity
    → posterior.onnx + rssm.onnx + actor.onnx
      + cartpole.xml + metadata + reference fixtures
    → static Jekyll assets → browser parity and interaction checks
```

The export packages observation normalization and explicit recurrent inputs and
outputs with the networks. Metadata records timing, tensor contracts, software
versions, and hashes connecting the deployed graphs to the trained checkpoint.
Replay, optimizers, and the critic remain offline.

### Browser control and dream visualization

```text
MuJoCo WASM state → five-value observation + previous action + previous belief
    → posterior.onnx → corrected belief → actor.onnx → action in [−1, 1]
    → hold action for 5 × 10 ms physics controls → next real observation
    → repeat at 20 decisions per simulated second

Copy corrected belief every 0.5 simulated seconds
    → actor.onnx → rssm.onnx (prior + decoder + reward) → repeat 15 times
    → predicted observations → Canvas ghost poses up to 0.75 seconds ahead

Push button → separate physical cart force for 0.2 seconds → MuJoCo WASM
    → changed observation → posterior correction → revised neural forecast
```

All three ONNX graphs run through ONNX Runtime Web's WASM backend. Rendering
combines the real simulated pose with decoded ghost poses; a one-step prediction
is also compared with the next real observation to display normalized error.
The dream branch copies the belief and leaves the controller's recurrent state
untouched. Push forces are not inputs to the learned model, so an existing dream
can diverge during a push; subsequent observations reanchor the belief. Both
physics and inference run locally using static assets.

## Measured results

CPU training used seed 7, 4,000 exploration decisions, and 50,000 online decisions
across three stages, totaling 22,000 updates. Checkpoint selection used seeds
800–804 and `return + 200 × swingup_success_fraction`. Final evaluation used
**20 untouched seeds, 1000–1019**. Native episodes last 10 seconds.

| Policy | Return, mean ± std | Upright time | Swing-up success | Cart RMS |
| --- | ---: | ---: | ---: | ---: |
| Random | 122.88 ± 54.70 | 0.7% | 0/20 | 1.173 m |
| TinyDreamer | **753.19 ± 22.57** | **69.2%** | **20/20** | **0.510 m** |

Upright means within 15° of vertical. Success requires at least **2 consecutive
seconds** upright within the episode. Return sums the native rewards on their
1,000-step scale; it is not rescaled to a percentage.

World-model normalized MSE on held-out policy trajectories, using the recorded
real actions for open-loop predictions:

| Horizon | Learned model | Persistence |
| --- | ---: | ---: |
| 1 step / 0.05 s | 0.000466 | 0.003871 |
| 5 steps / 0.25 s | 0.000638 | 0.076258 |
| 15 steps / 0.75 s | 0.003654 | 0.233341 |

A separate ten-episode exploratory-data check (seed 500) gives one-step MSE
0.002814 versus 0.026453 persistence, and 15-step MSE 0.059609 versus 0.961957.
Predictions are less accurate away from the policy's familiar trajectories.

### Zero-shot pushes

No disturbance fine-tuning was needed for the default 5 N buttons. Each signed
cart force was applied at 5 seconds for 0.2 seconds on the same 20 evaluation
seeds. Recovery measurements start **after** the force ends, so earlier upright
holds do not count.

| Force | Episode return | Two-second hold after push | Mean recovery time* |
| --- | ---: | ---: | ---: |
| −5 N | 679.09 | 20/20 | 1.54 s |
| +5 N | 752.97 | 20/20 | 0.00 s |
| −10 N | 595.99 | 4/20 | 2.53 s |
| +10 N | 730.82 | 19/20 | 0.03 s |

*Time from force end to the start of the first one-second upright interval.
All pushed episodes achieved such an interval before the 10-second time limit.
The stronger negative push often breaks sustained balance; the controller's
recovery is asymmetric. The strength slider deliberately includes this harder
case. See `artifacts/evaluation.json` for individual episodes and definitions.

## Reproduce with Docker

From this directory:

```sh
docker compose build trainer
docker compose run --rm trainer python -m pytest -q
# Measure cost before training; this does not save trained weights.
docker compose run --rm trainer python -m training.train --benchmark 1000
# Stage 1: exploration, world-model warmup, then online imagination learning.
docker compose run --rm trainer python -m training.train --steps 20000
# Stage 2: five-step prediction supervision and probability-latent imagination.
docker compose run --rm trainer python -m training.train --resume --refine --steps 20000
# Stage 3: longer imagination and less KL pressure for fine balance control.
docker compose run --rm trainer python -m training.train --resume --horizon 30 --kl-scale 0.03 --steps 30000 --stop-when-balanced
docker compose run --rm trainer python -m training.evaluate --checkpoint artifacts/best.pt
docker compose run --rm trainer python -m training.diagnose --checkpoint artifacts/best.pt
docker compose run --rm trainer python -m training.export_onnx --checkpoint artifacts/best.pt
docker compose up -d website
docker compose run --rm browser
```

Preview: http://localhost:4000/assets/interactive/tiny-dreamer/index.html.
The Jekyll route is `/tiny-dreamer/`; build the full site from the repository
root using its existing `docker compose run --rm jekyll bundle exec jekyll build`.
Training checkpoints/replay stay local and are excluded from both Git and site
output. Exported ONNX/MJCF and numerical fixtures are served by the site; small JSON
reports are checked into the repository for review.

`--stop-when-balanced` stops collection when five-seed validation reaches at
least 80% sustained-hold success and mean return 650; this run stopped after
10,000 decisions in stage 3. Final held-out and browser tests remain separate.
Resuming restarts seeded interaction RNGs and a native episode; it preserves
network/optimizer state and replay, rather than restoring mid-episode physics.

### CPU cost

Measured on Intel Core i7-8565U, CPU-only PyTorch with one thread:

| Configuration | Updates | Wall time | Updates/s |
| --- | ---: | ---: | ---: |
| Initial 15-step imagination | 1,000 | 123.35 s | 8.11 |
| Refined 15-step imagination | 1,000 | 125.61 s | 7.96 |
| Final 30-step imagination | 200 | 26.29 s | 7.61 |

Observed training memory was approximately 267–318 MiB before the final stage.
At 0.4 updates per decision, a 100,000-decision run estimates approximately
82–88 minutes of update work, plus exploration, warmup, collection and validation.
The successful three online segments took approximately 44 minutes of training
loop time plus model warmup. Raw benchmark configurations are saved in
`artifacts/benchmark-initial.json`, `benchmark-refined.json`, and `benchmark-long.json`.

## Training and runtime contracts

Training: MuJoCo reality → replay sequences → encoder/RSSM/decoder/reward/
continuation → neural imagined trajectories → actor + critic → real interaction.
Replay holds N+1 observations and N transitions, and never crosses episode
boundaries. Native time limits are truncations with continuation 1. The recurrent
belief is reset between episodes.

The inspected observation order is `position` (cart x, pole cos, pole sin), then
`velocity` (cart velocity, pole angular velocity). Fixed normalization scales
are `[1, 1, 1, 3, 8]`, with zero mean; there are no fitted normalization statistics.
The native RK4 timestep is 10 ms. A continuous action in [−1, 1] is held for five
native controls (50 ms), and its reward is their mean. Metadata records the
joint/observation ordering, actuator gear, timing, graph inputs/shapes, versions,
checkpoint hash and ONNX hashes. No CartPole dynamics are implemented in JS.

Browser: MuJoCo WASM → real observation → RSSM posterior → deterministic actor
→ motor control. Every half-second, a copied posterior belief feeds actor + prior
for 15 steps; five decoded ghost poses show up to 0.75 seconds ahead. Training
uses a 30-step horizon in its final stage; the shorter preview keeps rendering
and inference light. The generalized cart force is separate from the RL action.

Browser reset uses the native Gaussian reset distribution with a seeded JS RNG,
so repeated browser resets are reproducible. JS and NumPy generators are not
bit-identical. Physics parity uses explicit native initial states instead.

## Retained mechanisms and simplifications

- 64-unit GRU deterministic state and 8×8 categorical stochastic state;
  128-wide ELU MLPs, no images/CNNs/transformers.
- Straight-through categorical world-model training, 1% uniform mixture,
  balanced KL with one free nat; normalized observation/reward MSE and
  continuation BCE. KL weight changes from 0.1 to 0.03 in the final stage.
- Auxiliary one-step prior observation loss; refinement adds five-step
  open-loop observation/reward supervision with real recorded actions.
- Squashed Gaussian actor and scalar critic with a slowly moving target.
  Actor gradients pass through frozen learned dynamics and predicted rewards;
  critic targets are bootstrapped lambda returns (discount .99, lambda .95).
- Initial imagination uses categorical samples. Refined actor learning uses
  probability latents consistent with deployment; real world-model training
  retains straight-through categorical sampling and actor learning retains
  Gaussian action sampling. Additional exploration decreases from .3 to .1.
- Deterministic deployment uses categorical probabilities and tanh actor mean.
  Export three explicit graphs: posterior, prior+decoder+reward, actor.
  The critic is not deployed.
- No symlog/two-hot distributions, replay prioritization, large ensembles or
  full DreamerV3 normalization machinery. Small negative reward predictions
  can occur because the reward head is an unconstrained MSE regressor.

## Verification

Thirteen Python tests cover native observation/reward/action contracts, replay
boundaries, recurrent-state shapes, finite gradients, environment-free
imagination, lambda returns, refined updates, checkpoint reload, artifact hashes,
ONNX parity and the fullscreen route.

PyTorch vs native ONNX fixed-input parity requires atol=rtol=1e-5; the final
maximum absolute error is 9.54e-7. Browser ONNX is also checked against saved
PyTorch outputs. A 40-control / 2-second native-WASM trajectory checks qpos,
qvel, observations and reward aggregation with absolute tolerance 2e-5. Maximum
errors are 0 / 2.22e-16 / 0 / 6.94e-17 respectively (native MuJoCo 3.10.0,
WASM 3.12.0).

Full desktop and touch/landscape browser tests cover model loading, bounded
controls, simulation advance, 6.4-second upright hold on the default reset,
physical push direction/expiry, dream toggle, pause, reset during pending
inference, local-only requests and usable controls. The final default-reset
browser return is 744.13. The disturbance test preserves an old neural forecast,
measures its physical divergence, then verifies posterior reanchoring and lower
prediction error after the push. Source and production Jekyll output are checked.

Reports are in `artifacts/browser-results.json`, `evaluation.json`, and
`world-model-sanity.json`. `DREAMER_SMOKE_ONLY=1` skips only the trained-policy
performance gate during development; default `npm test` and CI require it.

## References and attribution

The behavior-learning mechanism is described in
[Dream to Control: Learning Behaviors by Latent Imagination](https://arxiv.org/abs/1912.01603).
For the full modern system, see
[Mastering Diverse Domains through World Models](https://arxiv.org/abs/2301.04104).
This implementation is original code based on those concepts.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/` for DeepMind
Control Suite, MuJoCo and ONNX Runtime licenses. The demo imports existing
`../g1/vendor/mujoco.js/.wasm` and `../doom/vendor/ort/` assets without modifying
those demos. Keep those shared runtime assets when deploying this directory.

## Future work (outside this MVP)

Pixel observations, changed physical parameters, or another environment.
