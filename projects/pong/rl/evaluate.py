"""Evaluate a trained Pong PPO policy against scripted opponents."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from stable_baselines3 import PPO

from .pong_env import PongEnv


def evaluate(model_path: Path, opponent: str, games: int, seed: int) -> dict[str, float]:
    model = PPO.load(str(model_path), device="cpu")
    wins = 0
    differentials: list[int] = []
    rallies: list[int] = []
    for game in range(games):
        env = PongEnv(opponent=opponent)
        obs, _ = env.reset(seed=seed + game)
        done = False
        last_rally = 0
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, _, terminated, truncated, info = env.step(int(action))
            last_rally = int(info["rally_steps"])
            done = terminated or truncated
        ai_score, human_score = info["score"]
        wins += int(ai_score > human_score)
        differentials.append(ai_score - human_score)
        rallies.append(last_rally)
        env.close()
    result = {
        "games": float(games),
        "win_rate": wins / games,
        "mean_score_differential": float(np.mean(differentials)),
        "mean_steps": float(np.mean(rallies)),
    }
    print(
        f"{opponent:9s} | games={games:3d} | win rate={result['win_rate']:.1%} | "
        f"mean score differential={result['mean_score_differential']:+.2f} | "
        f"mean steps={result['mean_steps']:.0f}"
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("models/pong_ppo.zip"))
    parser.add_argument("--games", type=int, default=50)
    parser.add_argument("--seed", type=int, default=1000)
    parser.add_argument("--opponent", choices=["easy", "tracking", "strong", "both"], default="both")
    args = parser.parse_args()
    opponents = ["easy", "tracking"] if args.opponent == "both" else [args.opponent]
    for opponent in opponents:
        evaluate(args.model, opponent, args.games, args.seed)


if __name__ == "__main__":
    main()
