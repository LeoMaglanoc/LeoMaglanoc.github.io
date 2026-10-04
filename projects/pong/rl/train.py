"""Train a PPO Pong policy."""

from __future__ import annotations

import argparse
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.monitor import Monitor

from .pong_env import PongEnv
from .training_env import SoloPongEnv


def train(
    timesteps: int,
    seed: int,
    model_dir: Path,
    log_dir: Path,
    checkpoint_freq: int,
    opponent: str = "easy",
    resume: Path | None = None,
    train_mode: str = "perfect",
) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    use_match_env = train_mode in {"perfect", "match"} or resume is not None
    if train_mode == "perfect" and resume is None:
        env = Monitor(PongEnv(opponent="perfect"))
    else:
        env = Monitor(PongEnv(opponent=opponent) if use_match_env else SoloPongEnv())
    callback = CheckpointCallback(
        save_freq=max(checkpoint_freq, 1),
        save_path=str(model_dir / "checkpoints"),
        name_prefix="pong_ppo",
    )
    if resume:
        model = PPO.load(str(resume), env=env, device="cpu")
        model.learn(total_timesteps=timesteps, callback=callback, progress_bar=False, reset_num_timesteps=False)
    else:
        model = PPO(
            "MlpPolicy",
            env,
            verbose=1,
            seed=seed,
            tensorboard_log=str(log_dir),
            n_steps=1024,
            batch_size=256,
            learning_rate=3e-4,
            device="cpu",
        )
        model.learn(total_timesteps=timesteps, callback=callback, progress_bar=False)
    destination = model_dir / "pong_ppo"
    model.save(str(destination))
    env.close()
    print(f"Saved model to {destination}.zip")
    return destination.with_suffix(".zip")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timesteps", type=int, default=150_000)
    parser.add_argument("--opponent", choices=["easy", "tracking", "strong", "perfect"], default="easy", help="Opponent used by match training or fine-tuning")
    parser.add_argument("--train-mode", choices=["perfect", "solo", "match"], default="perfect", help="Use a perfect scripted player, a wall, or a normal match opponent")
    parser.add_argument("--resume", type=Path, default=None, help="Fine-tune an existing policy in the real two-paddle environment")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--model-dir", type=Path, default=Path("models"))
    parser.add_argument("--log-dir", type=Path, default=Path("logs"))
    parser.add_argument("--checkpoint-freq", type=int, default=50_000)
    args = parser.parse_args()
    train(**vars(args))


if __name__ == "__main__":
    main()
