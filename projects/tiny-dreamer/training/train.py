import argparse
import json
import pickle
import time
from pathlib import Path
import numpy as np
import torch
from .config import Config
from .env import EnvAdapter
from .replay import Replay
from .dreamer import Dreamer
from .evaluate import episode, aggregate


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--steps", type=int, default=100_000)
    p.add_argument("--prefill", type=int, default=4000)
    p.add_argument("--warmup", type=int, default=2000)
    p.add_argument("--benchmark", type=int, default=0)
    p.add_argument("--resume", action="store_true")
    p.add_argument(
        "--refine",
        action="store_true",
        help="resume with five-step prior supervision, probability imagination and less exploration",
    )
    p.add_argument(
        "--horizon", type=int, help="override neural imagination horizon on resume"
    )
    p.add_argument(
        "--kl-scale", type=float, help="override KL regularization on resume"
    )
    p.add_argument("--stop-when-balanced", action="store_true")
    p.add_argument("--output", default="artifacts")
    args = p.parse_args()
    torch.set_num_threads(1)
    c = Config()
    torch.manual_seed(c.seed)
    rng = np.random.default_rng(c.seed)
    output = Path(args.output)
    output.mkdir(exist_ok=True, parents=True)
    agent = Dreamer.load(output / "checkpoint.pt") if args.resume else Dreamer(c)
    c = agent.c
    if args.refine:
        if not args.resume:
            p.error("--refine requires --resume")
        c.overshoot = 5
        c.deterministic_imagination = True
        c.exploration = 0.1
    if args.horizon is not None:
        if args.horizon < 1:
            p.error("horizon must be positive")
        c.horizon = args.horizon
    if args.kl_scale is not None:
        if args.kl_scale < 0:
            p.error("KL scale must be nonnegative")
        c.kl_scale = args.kl_scale
    replay = (
        pickle.loads((output / "replay.pkl").read_bytes())
        if args.resume
        else Replay(seed=c.seed)
    )
    env = EnvAdapter(c.seed, c.action_repeat)
    obs = env.reset()
    replay.begin(obs)
    for t in range(args.prefill if not args.resume else 0):
        # Mix temporally correlated and uniform actions to cover swing trajectories.
        if t % 10 == 0:
            held = rng.uniform(-1, 1, 1)
        action = held if t % 200 < 100 else rng.uniform(-1, 1, 1)
        obs, reward, continuation, done = env.step(action)
        replay.add(action, reward, continuation, obs, done)
        if done:
            obs = env.reset()
            replay.begin(obs)
    print(json.dumps({"environment": env.contract()}), flush=True)
    if args.benchmark:
        start = time.perf_counter()
        for _ in range(args.benchmark):
            metrics = agent.update(replay.sample(c.batch, c.sequence))
        elapsed = time.perf_counter() - start
        result = {
            "updates": args.benchmark,
            "seconds": elapsed,
            "updates_per_second": args.benchmark / elapsed,
            "torch_threads": 1,
            "config": c.dict(),
            "last_metrics": metrics,
        }
        (output / "benchmark.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result), flush=True)
        return
    if not args.resume:
        for u in range(args.warmup):
            metrics = agent.update(replay.sample(c.batch, c.sequence), behavior=False)
            if (u + 1) % 500 == 0:
                print(json.dumps({"warmup_update": u + 1, **metrics}), flush=True)
    state = agent.world.rssm.initial(1)
    prev_action = torch.zeros(1, 1)
    episode_return, step_start = 0, time.perf_counter()
    log = output / "training.jsonl"
    best_score = -float("inf")
    if (output / "selection.json").exists():
        previous = json.loads((output / "selection.json").read_text())
        best_score = previous.get("selection_score", previous["return"] + 200 * previous["swingup_success"])
    for t in range(args.steps):
        with torch.no_grad():
            state, _ = agent.world.observe_step(
                state, prev_action, torch.tensor(obs)[None], sample=False
            )
            action = agent.actor(agent.world.rssm.feature(state), sample=True).numpy()[
                0
            ]
            action = np.clip(action + rng.normal(0, c.exploration, 1), -1, 1).astype(
                np.float32
            )
        obs, reward, continuation, done = env.step(action)
        replay.add(action, reward, continuation, obs, done)
        prev_action = torch.tensor(action)[None]
        episode_return += reward * c.action_repeat
        if t % 5 == 0:
            for _ in range(2):
                metrics = agent.update(replay.sample(c.batch, c.sequence))
        if done:
            record = {
                "step": t + 1,
                "updates": agent.updates,
                "return": episode_return,
                "seconds": time.perf_counter() - step_start,
                **metrics,
            }
            print(json.dumps(record), flush=True)
            with log.open("a") as f:
                f.write(json.dumps(record) + "\n")
            obs = env.reset()
            replay.begin(obs)
            state = agent.world.rssm.initial(1)
            prev_action.zero_()
            episode_return = 0
        if (t + 1) % 5000 == 0:
            agent.save(output / "checkpoint.pt")
            score = aggregate([episode(agent, 800 + i) for i in range(5)])
            print(json.dumps({"validation_step": t + 1, **score}), flush=True)
            selection_score = score["return"] + 200 * score["swingup_success"]
            if selection_score > best_score:
                best_score = selection_score
                agent.save(output / "best.pt")
                (output / "selection.json").write_text(
                    json.dumps(
                        {"step": t + 1, "updates": agent.updates, "selection_score": selection_score, **score}, indent=2
                    )
                    + "\n"
                )
            (output / "replay.pkl").write_bytes(pickle.dumps(replay))
            if args.stop_when_balanced and score["swingup_success"] >= .8 and score["return"] >= 650:
                print(json.dumps({"stopped_on_validation": True, "step": t+1, **score}), flush=True)
                break
    agent.save(output / "checkpoint.pt")
    (output / "replay.pkl").write_bytes(pickle.dumps(replay))


if __name__ == "__main__":
    main()
