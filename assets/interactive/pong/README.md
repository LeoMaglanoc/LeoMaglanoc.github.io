# Play against my RL Pong agent

End-to-end reinforcement-learning demo in which a PPO policy is trained on a state-based Pong environment, exported from PyTorch to ONNX, and executed entirely in the browser with ONNX Runtime Web.

The browser contains only inference and game physics; training happens offline in Python.

## Pipeline

```text
                  OFFLINE TRAINING
────────────────────────────────────────────────

 Gymnasium Pong environment
          +
 scripted / perfect opponent
              │
              ▼
       normalized state
   [ball x, ball y, vx, vy,
          paddle y]
              │
              ▼
    PPO MLP actor-critic
   Stable-Baselines3 / PyTorch
              │
              ▼
        trained actor
              │
         ONNX export
              │
              ▼
      pong_policy.onnx


                 BROWSER RUNTIME
────────────────────────────────────────────────

       current game state
              │
              ▼
      ONNX Runtime Web
              │
              ▼
        actor logits
              │
          argmax
              │
              ▼
       up / stay / down
              │
              ▼
       Canvas Pong physics
              │
              └──────────────► next state
```

## Tech stack

Training

- Python 3.11
- Gymnasium
- Stable-Baselines3 PPO
- PyTorch
- TensorBoard

Deployment

- ONNX
- ONNX Runtime Web / WASM
- JavaScript
- HTML5 Canvas

Tooling

- Docker
- pytest

## Run everything with Docker

Build the reproducible training image:

```bash
docker compose build trainer
```

Train a reproducible baseline (the default is 150,000 timesteps):

```bash
docker compose run --rm trainer python -m rl.train --timesteps 150000 --seed 0
```

The default run uses a full Pong environment with a perfect scripted left player. The scripted paddle always reaches the ball, but its center is randomly offset by up to 75% of a paddle half-height before each collision. This exposes the policy to varied return angles while training uses the same paddle collision physics as deployment:

```bash
docker compose run --rm trainer python -m rl.train --timesteps 200000 --resume models/checkpoints/pong_ppo_500000_steps.zip --train-mode perfect --opponent perfect --model-dir models/random_angle --log-dir logs/random_angle --seed 0
```

For a clean policy trained against the normal easy scripted opponent, use match mode:

```bash
docker compose run --rm trainer python -m rl.train --timesteps 150000 --train-mode match --opponent easy --seed 0
```

Evaluate against both scripted opponents:

```bash
docker compose run --rm trainer python -m rl.evaluate --model models/pong_ppo.zip --games 50
```

Export the actor logits used for deterministic action selection:

```bash
docker compose run --rm trainer python -m rl.export_onnx --model models/pong_ppo.zip --output assets/pong/pong_policy.onnx
```

Validate 1,000 random observations against Stable-Baselines3:

```bash
docker compose run --rm trainer python onnx_parity.py --model models/pong_ppo.zip --onnx assets/pong/pong_policy.onnx
```

Run the tests (the ONNX test is included once a model and export exist):

```bash
docker compose run --rm trainer python -m pytest -q
```

Serve the project locally:

```bash
docker compose up website
# open http://localhost:4000/ or http://localhost:4000/pong/
```

The shorter equivalents are available through `make train`, `make evaluate`, `make export`, `make parity`, `make test`, and `make web`. Override training values with `TIMESTEPS=50000 SEED=7 make train`.

The browser entrypoint is `index.html`. It loads the shipped policy locally and supports keyboard controls plus held UP/DOWN touch buttons in landscape mode.

## Runtime contract

The deployed observation is `[ball_x, ball_y, ball_vx, ball_vy, ai_paddle_y]`, normalized by `rl/constants.py`; the human paddle is intentionally omitted because it is not part of the agent’s control decision. The same constants and transformation are used by Python and JavaScript; the browser reads `assets/pong/pong_config.json`. Actions are `0=up`, `1=stay`, `2=down`.

Training uses `PongEnv(opponent="perfect")`: the scripted left paddle always reaches the ball, chooses a seeded random impact offset in `[-0.75, +0.75]` paddle half-heights, and then uses the original paddle collision physics. The reward is sparse: `+1` when the agent scores through the left edge, `-1` when it concedes through the right edge. Episodes end at seven points or are truncated after 5,000 control steps. `SoloPongEnv` remains available as an optional wall-tracking curriculum.

## Dependencies

Docker is the supported path and uses Python 3.11 with Gymnasium, Stable-Baselines3, PyTorch, ONNX, ONNX Runtime, pytest, and TensorBoard. Training logs are written to `logs/`; models and checkpoints are written to `models/`. The website itself is static and only loads the ONNX Runtime Web WASM bundle from jsDelivr.

## Limitations and next steps

The baseline trains against a perfect scripted player with controlled return-angle variation using the original paddle collision rule, then is evaluated against modular scripted opponents. A natural follow-up is a checkpoint-pool opponent for self-play, plus an optional difficulty selector. The local server exists only to serve static files; inference and game simulation stay in the browser.
