"""Compare deterministic SB3 actions and ONNX actor argmax actions."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
from stable_baselines3 import PPO


def check_parity(model_path: Path, onnx_path: Path, samples: int = 1000, seed: int = 123) -> int:
    model = PPO.load(str(model_path), device="cpu")
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(seed)
    observations = rng.uniform(-1.0, 1.0, size=(samples, 5)).astype(np.float32)
    expected = np.asarray(
        [int(model.predict(observation, deterministic=True)[0]) for observation in observations],
        dtype=np.int64,
    )
    logits = session.run(None, {session.get_inputs()[0].name: observations})[0]
    actual = np.argmax(logits, axis=1)
    mismatches = np.flatnonzero(expected != actual)
    if len(mismatches):
        examples = ", ".join(str(int(i)) for i in mismatches[:10])
        raise AssertionError(f"ONNX/SB3 action mismatch on {len(mismatches)}/{samples} samples (indices: {examples})")
    print(f"ONNX parity: {samples}/{samples} actions agree (100.0%)")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("models/pong_ppo.zip"))
    parser.add_argument("--onnx", type=Path, default=Path("assets/pong/pong_policy.onnx"))
    parser.add_argument("--samples", type=int, default=1000)
    args = parser.parse_args()
    check_parity(args.model, args.onnx, args.samples)


if __name__ == "__main__":
    main()
