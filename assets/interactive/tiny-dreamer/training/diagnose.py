"""Freeze a trained model; measure reconstruction, prior prediction and imagination."""

import argparse
import json
from pathlib import Path
import numpy as np
import torch
from .dreamer import Dreamer
from .env import EnvAdapter, OBS_SCALE
from .actor_critic import imagine


def diagnose(agent):
    results = {
        "reconstruction": [],
        "one_step": [],
        "persistence": [],
        "h15": [],
        "persistence_h15": [],
    }
    env = EnvAdapter(500, agent.c.action_repeat)
    rng = np.random.default_rng(500)
    for _ in range(10):
        obs = [env.reset()]
        actions = []
        for t in range(200):
            if t % 8 == 0:
                held = rng.uniform(-1, 1, 1).astype(np.float32)
            next_obs, _, _, done = env.step(held)
            actions.append(torch.tensor(held)[None])
            obs.append(next_obs)
            if done:
                break
        state = agent.world.rssm.initial(1)
        with torch.no_grad():
            for t in range(len(actions)):
                state, _ = agent.world.observe_step(
                    state,
                    torch.zeros(1, 1) if t == 0 else actions[t - 1],
                    torch.tensor(obs[t])[None],
                    False,
                )
                decoded = agent.world.decode(state).numpy()[0]
                results["reconstruction"].append(
                    float(np.mean(((decoded - obs[t]) / OBS_SCALE) ** 2))
                )
                predicted = agent.world.rssm.imagine_step(state, actions[t], False)
                results["one_step"].append(
                    float(
                        np.mean(
                            (
                                (agent.world.decode(predicted).numpy()[0] - obs[t + 1])
                                / OBS_SCALE
                            )
                            ** 2
                        )
                    )
                )
                results["persistence"].append(
                    float(np.mean(((obs[t] - obs[t + 1]) / OBS_SCALE) ** 2))
                )
                if t % 10 == 0 and t + 15 < len(actions):
                    imagined = state
                    for h in range(15):
                        imagined = agent.world.rssm.imagine_step(
                            imagined, actions[t + h], False
                        )
                    results["h15"].append(
                        float(
                            np.mean(
                                (
                                    (
                                        agent.world.decode(imagined).numpy()[0]
                                        - obs[t + 15]
                                    )
                                    / OBS_SCALE
                                )
                                ** 2
                            )
                        )
                    )
                    results["persistence_h15"].append(
                        float(np.mean(((obs[t] - obs[t + 15]) / OBS_SCALE) ** 2))
                    )
            features, a, rewards, continuation = imagine(
                agent.world, agent.actor, state, 15, False
            )
            assert all(
                torch.isfinite(x).all() for x in (features, a, rewards, continuation)
            )
            assert a.abs().max() <= 1
    return {
        "seed": 500,
        "episodes": 10,
        "normalized_mse": {k: float(np.mean(v)) for k, v in results.items()},
        "imagination_finite": True,
        "max_abs_action": float(a.abs().max()),
        "predicted_reward_range": [float(rewards.min()), float(rewards.max())],
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", default="artifacts/best.pt")
    p.add_argument("--output", default="artifacts/world-model-sanity.json")
    args = p.parse_args()
    torch.set_num_threads(1)
    result = diagnose(Dreamer.load(args.checkpoint))
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result), flush=True)
