"""Export the PPO actor logits for browser inference."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from stable_baselines3 import PPO


class ActorLogits(torch.nn.Module):
    """The exact discrete actor path used by SB3's deterministic prediction."""

    def __init__(self, policy) -> None:
        super().__init__()
        self.policy = policy

    def forward(self, observation: torch.Tensor) -> torch.Tensor:
        features = self.policy.extract_features(observation)
        latent_pi, _ = self.policy.mlp_extractor(features)
        return self.policy.action_net(latent_pi)


def export(model_path: Path, output_path: Path) -> Path:
    model = PPO.load(str(model_path), device="cpu")
    model.policy.eval()
    actor = ActorLogits(model.policy).eval()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sample = torch.zeros((1, 5), dtype=torch.float32)
    torch.onnx.export(
        actor,
        sample,
        str(output_path),
        input_names=["observation"],
        output_names=["logits"],
        dynamic_axes={"observation": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    print(f"Exported actor logits to {output_path}")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("models/pong_ppo.zip"))
    parser.add_argument("--output", type=Path, default=Path("assets/pong/pong_policy.onnx"))
    args = parser.parse_args()
    export(args.model, args.output)


if __name__ == "__main__":
    main()
