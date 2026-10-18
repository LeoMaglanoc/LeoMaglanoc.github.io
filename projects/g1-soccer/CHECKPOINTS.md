# Model and implementation continuation

## Preserved originals

| Artifact | Meaning | Training continuation |
|---|---|---|
| `checkpoints/coach-best.zip` | Original selected PPO checkpoint, **2,363,808** timesteps; used for this demo | Contains policy, value network, optimizer and SB3 metadata |
| `checkpoints/coach-final.zip` | Original final PPO checkpoint, **3,002,656** timesteps | Same components; available as a separate starting point |
| `checkpoints/upstream-run.tar.gz` | Entire available upstream `runs/ppo_v1` directory | Preserves TensorBoard events, evaluation files, monitor logs, best/final models and training curve image |
| `../g1/models/motion.pt` | Official frozen recurrent Unitree walking policy | TorchScript inference checkpoint; original walking optimizer/training run is unavailable |
| `models/coach.onnx`, `models/walker.onnx` | Deterministic browser exports | Inference only; never substitute them for PPO training archives |

Hashes and original serialization versions are in `provenance.json`. The coach archives were written by SB3 2.4.1; the pinned reproduction uses SB3 2.7.0 and reproduces upstream's 84/100 result. Inputs are manually scaled; there is no separate VecNormalize statistics file in this environment. Walker hidden/cell tensors are episode state, not learned normalization statistics.

The original release does **not** supply complete RNG state, environment/rollout state, callback state, or the original walking-training checkpoint. Coach training can continue with restored weights and optimizer in fresh environments. This is not bit-for-bit resumption of the original rollout stream. This limitation cannot be repaired by renaming an ONNX export or saving an unused RNG seed now.

## Re-establish a known working point

From the repository root:

```sh
docker compose -f projects/g1-soccer/compose.yaml build tools
docker compose -f projects/g1-soccer/compose.yaml run --rm tools
node --test projects/g1-soccer/tests/contract.test.js
python3 projects/g1-soccer/tools/check_artifacts.py
```

Native results should show 84/100 successes for seeds 1000–1099. Check export parity before working on browser behavior. Compare new changes against those committed fixtures and `results/browser-evaluation.json`. Preserve baseline files before intentionally regenerating them for a changed model or task.

## Continue coach training later

Do not overwrite the release checkpoints. Create a separately named run under `artifacts/` (Git-ignored) and explicitly persist it outside a disposable container. The tools container mounts the full repository, so outputs under `/work/.../artifacts` survive container exit.

The following is a **future training command**, not something executed for this integration. It resumes the final coach to a cumulative target of four million steps with the original environment and frozen walker:

```sh
docker compose -f projects/g1-soccer/compose.yaml run --rm tools \
  sh -c 'python tools/prepare_reference.py && cd /tmp/g1-soccer-reference/train_files && python train_ppo.py --resume /work/projects/g1-soccer/checkpoints/coach-final.zip --timesteps 4000000 --n-envs 2 --seed 0 --logdir /work/projects/g1-soccer/artifacts/coach-next'
```

The staged source is unchanged upstream code. `--timesteps` is cumulative on resume, and `--n-envs` controls resource use. Its callback saves PPO archives every 50,000 environment steps and evaluates every 20,000. Those archives include the optimizer but **do not provide exact environment/RNG resumption**. For interruption-safe future research, extend the checkpoint callback before a long run to save Python/NumPy/Torch RNG states, each environment's generator, MuJoCo integration state, command/history/recurrent state, monitor/callback state, and any partial rollout buffer—or deliberately checkpoint at a documented fresh-episode/rollout boundary. Validate restore by comparing the next observations/actions and optimizer update, not just by loading weights.

Keep a run manifest with source revision, Docker image digest, dependency lock, reward/config changes, training seeds, cumulative steps, selected checkpoint, held-out seeds and evaluation results. Changing reward logic or observation definitions invalidates direct comparison to this baseline. Never tune on the fixed evaluation set and then call it held out.

## Promote an improved model

1. Preserve the candidate's complete PPO archive and run manifest under a new versioned filename.
2. Evaluate both the baseline and candidate on development episodes and a fresh reserved evaluation set, using the same success rules.
3. Check target-following, turns, falls, ball loss and difficult initial headings; do not promote from one attractive video.
4. Deliberately update the export tool's selected checkpoint, regenerate exports and native fixtures, and verify inference/recurrent parity.
5. Repeat Chrome worker evaluation and desktop/phone interaction tests. Preserve prior results for comparison.
6. Update provenance, hashes, public assets, documentation and the Git checkpoint together.

Implementation milestones are preserved in Git commits: initial Docker/native/export baseline, validated browser integration, and final publishing/evidence changes. The pushed commit reference in the handoff identifies the exact website implementation. Model artifacts are stored in Git, not only in the session's Docker cache.


## Published checkpoints

- `42003c3`: preserved original coach checkpoints, native source, exports and the Docker reference.
- `2ef72e8`: validated browser implementation, `/soccer/` route and existing blog link; deployed successfully through GitHub Pages.
- The subsequent documentation/evidence commit preserves public Chrome screenshots, deployment metadata and served-asset checks. Its application/model bytes are unchanged from `2ef72e8`.
