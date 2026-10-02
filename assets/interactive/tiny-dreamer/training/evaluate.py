"""Held-out policy, disturbance and predictive-model evaluation; no training."""

import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from .dreamer import Dreamer
from .env import EnvAdapter, OBS_SCALE


def episode(agent, seed, random=False, push=0, model_errors=False):
    env = EnvAdapter(seed, agent.c.action_repeat)
    obs = env.reset()
    rng = np.random.default_rng(seed)
    state = agent.world.rssm.initial(1)
    action = torch.zeros(1, 1)
    observations, actions, states = [], [], []
    total, upright, max_run, run, xs = 0.0, 0, 0, 0, []
    for t in range(200):
        with torch.no_grad():
            state, _ = agent.world.observe_step(
                state, action, torch.tensor(obs)[None], False
            )
            action = (
                torch.tensor(rng.uniform(-1, 1, (1, 1)), dtype=torch.float32)
                if random
                else agent.actor(agent.world.rssm.feature(state), False)
            )
            states.append({k: v.clone() for k, v in state.items()})
            observations.append(obs.copy())
            actions.append(action.clone())
        obs, reward, _, done = env.step(
            action.numpy()[0], push if 100 <= t < 104 else 0
        )
        total += reward * agent.c.action_repeat
        is_upright = obs[1] >= np.cos(np.deg2rad(15))
        upright += is_upright
        run = run + 1 if is_upright else 0
        max_run = max(max_run, run)
        xs.append(obs[0])
        if done:
            break
    observations.append(obs.copy())
    metrics = {
        "seed": seed,
        "return": total,
        "upright_fraction": upright / len(xs),
        "cart_rms_m": float(np.sqrt(np.mean(np.square(xs)))),
        "swingup_success": bool(max_run * env.contract()["policy_timestep"] >= 2),
        "longest_upright_seconds": max_run * env.contract()["policy_timestep"],
    }
    if push:
        # Recovery must happen after the force ends; pre-push holds do not count.
        post = np.asarray(observations[104:])
        flags = post[:, 1] >= np.cos(np.deg2rad(15))
        run, longest, recovery = 0, 0, None
        dt = env.contract()["policy_timestep"]
        for index, up in enumerate(flags):
            run = run + 1 if up else 0
            longest = max(longest, run)
            if recovery is None and run * dt >= 1:
                recovery = max(0., (index + 1) * dt - 1.)
        metrics.update(
            post_push_success=bool(longest * dt >= 2),
            post_push_upright_fraction=float(flags.mean()),
            post_push_longest_upright_seconds=longest * dt,
            recovery_seconds=recovery,
        )
    if model_errors:
        horizons = [1, 5, 15]
        errors, persistence = {h: [] for h in horizons}, {h: [] for h in horizons}
        with torch.no_grad():
            for t in range(10, len(actions) - 15, 5):
                imagined = states[t]
                for h in range(1, 16):
                    imagined = agent.world.rssm.imagine_step(
                        imagined, actions[t + h - 1], False
                    )
                    if h in horizons:
                        prediction = agent.world.decode(imagined).numpy()[0]
                        target = observations[t + h]
                        errors[h].append(
                            float(np.mean(((prediction - target) / OBS_SCALE) ** 2))
                        )
                        persistence[h].append(
                            float(
                                np.mean(((observations[t] - target) / OBS_SCALE) ** 2)
                            )
                        )
        metrics["model_normalized_mse"] = {
            str(h): float(np.mean(errors[h])) for h in horizons
        }
        metrics["persistence_normalized_mse"] = {
            str(h): float(np.mean(persistence[h])) for h in horizons
        }
    return metrics


def aggregate(episodes):
    result = {
        k: float(np.mean([e[k] for e in episodes]))
        for k in ("return", "upright_fraction", "cart_rms_m", "swingup_success")
    }
    result["return_std"] = float(np.std([e["return"] for e in episodes]))
    if "post_push_success" in episodes[0]:
        result["post_push_success"] = float(np.mean([e["post_push_success"] for e in episodes]))
        result["post_push_upright_fraction"] = float(np.mean([e["post_push_upright_fraction"] for e in episodes]))
        recoveries = [e["recovery_seconds"] for e in episodes if e["recovery_seconds"] is not None]
        result["one_second_recovery_fraction"] = len(recoveries) / len(episodes)
        result["mean_recovery_seconds"] = float(np.mean(recoveries)) if recoveries else None
    for k in ("model_normalized_mse", "persistence_normalized_mse"):
        if k in episodes[0]:
            result[k] = {
                h: float(np.mean([e[k][h] for e in episodes])) for h in episodes[0][k]
            }
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", default="artifacts/checkpoint.pt")
    p.add_argument("--seeds", type=int, default=20)
    p.add_argument("--output", default="artifacts/evaluation.json")
    p.add_argument("--quick", action="store_true")
    args = p.parse_args()
    torch.set_num_threads(1)
    agent = Dreamer.load(args.checkpoint)
    result = {
        "checkpoint_updates": agent.updates,
        "checkpoint_sha256": hashlib.sha256(Path(args.checkpoint).read_bytes()).hexdigest(),
        "seed_start": 1000,
        "success_definition": "pole within 15 degrees of upright for at least 2 consecutive seconds in a native 10-second episode",
        "return_definition": "sum of averaged rewards times action_repeat (native 1000-step scale)",
        "disturbance": "signed cart generalized force in N, applied at t=5s for 0.2s",
        "post_push_success_definition": "at least 2 consecutive seconds within 15 degrees, measured strictly after force ends at 5.2s",
        "recovery_definition": "time after force ends until start of first 1-second upright interval; null if no such interval before episode end",
    }
    for name, random, push in [("random", True, 0), ("dreamer", False, 0)] + (
        []
        if args.quick
        else [
            ("push_-5N", False, -5),
            ("push_5N", False, 5),
            ("push_-10N", False, -10),
            ("push_10N", False, 10),
        ]
    ):
        episodes = [
            episode(agent, 1000 + i, random, push, model_errors=(name == "dreamer"))
            for i in range(args.seeds)
        ]
        result[name] = {"aggregate": aggregate(episodes), "episodes": episodes}
        print(name, json.dumps(result[name]["aggregate"]), flush=True)
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
