"""Explicit single-step graphs: posterior, prior+decode, actor. No critic."""

import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import onnxruntime as ort
import torch
from torch import nn
from .dreamer import Dreamer
from .env import export_physics


class Posterior(nn.Module):
    def __init__(self, world):
        super().__init__()
        self.world = world

    def forward(self, h, z, action, observation):
        state, _ = self.world.observe_step({"h": h, "z": z}, action, observation, False)
        return state["h"], state["z"], self.world.decode(state)


class Prior(nn.Module):
    def __init__(self, world):
        super().__init__()
        self.world = world

    def forward(self, h, z, action):
        state = self.world.rssm.imagine_step({"h": h, "z": z}, action, False)
        return (
            state["h"],
            state["z"],
            self.world.decode(state),
            self.world.reward(self.world.rssm.feature(state)),
        )


class ActorExport(nn.Module):
    def __init__(self, agent):
        super().__init__()
        self.actor = agent.actor

    def forward(self, h, z):
        return self.actor(torch.cat([h, z.flatten(-2)], -1), False)


def graphs(agent):
    c = agent.c
    generator = torch.Generator().manual_seed(91)
    h = torch.randn(1, c.hidden, generator=generator) * 0.1
    z = torch.randn(1, c.stoch, c.classes, generator=generator).softmax(-1)
    action = torch.tensor([[0.4]])
    obs = torch.tensor([[0.1, -0.99, 0.1, 0.2, -0.3]])
    return [
        (
            "posterior",
            Posterior(agent.world),
            (h, z, action, obs),
            ["h", "z", "action", "observation"],
            ["next_h", "next_z", "decoded"],
        ),
        (
            "rssm",
            Prior(agent.world),
            (h, z, action),
            ["h", "z", "action"],
            ["next_h", "next_z", "decoded", "reward"],
        ),
        ("actor", ActorExport(agent), (h, z), ["h", "z"], ["action"]),
    ]


def export(agent, directory):
    directory = Path(directory)
    directory.mkdir(exist_ok=True, parents=True)
    parity = {}
    fixtures = {}
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    for name, module, inputs, input_names, output_names in graphs(agent):
        module.eval()
        torch.onnx.export(
            module,
            inputs,
            str(directory / f"{name}.onnx"),
            input_names=input_names,
            output_names=output_names,
            opset_version=17,
        )
        session = ort.InferenceSession(
            str(directory / f"{name}.onnx"), opts, providers=["CPUExecutionProvider"]
        )
        with torch.no_grad():
            reference = module(*inputs)
        if isinstance(reference, torch.Tensor):
            reference = (reference,)
        outputs = session.run(None, {k: x.numpy() for k, x in zip(input_names, inputs)})
        fixtures[name] = {
            "inputs": {
                k: x.detach().numpy().tolist() for k, x in zip(input_names, inputs)
            },
            "outputs": {
                k: x.detach().numpy().tolist() for k, x in zip(output_names, reference)
            },
        }
        parity[name] = max(
            float(np.max(np.abs(a.numpy() - b))) for a, b in zip(reference, outputs)
        )
        for a, b in zip(reference, outputs):
            np.testing.assert_allclose(a.numpy(), b, atol=1e-5, rtol=1e-5)
    (directory / "inference_fixture.json").write_text(
        json.dumps(fixtures, indent=2) + "\n"
    )
    contract = export_physics(directory, agent.c.action_repeat)
    import mujoco
    import importlib.metadata

    contract.update(
        {
            "architecture": agent.c.dict(),
            "training_updates": agent.updates,
            "inference": "categorical probabilities; tanh actor mean",
            "onnx_opset": 17,
            "versions": {
                "dm_control": importlib.metadata.version("dm-control"),
                "mujoco": mujoco.__version__,
                "torch": torch.__version__,
            },
            "graphs": {
                name: {
                    "inputs": ins,
                    "outputs": outs,
                    "input_shapes": {k: list(v.shape) for k, v in zip(ins, inputs)},
                }
                for name, _, inputs, ins, outs in graphs(agent)
            },
            "parity": {"atol": 1e-5, "rtol": 1e-5, "max_absolute_errors": parity},
            "sha256": {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in directory.glob("*.onnx")
            },
        }
    )
    (directory / "model_metadata.json").write_text(
        json.dumps(contract, indent=2) + "\n"
    )
    return contract


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", default="artifacts/checkpoint.pt")
    p.add_argument("--output", default="models")
    args = p.parse_args()
    torch.set_num_threads(1)
    result = export(Dreamer.load(args.checkpoint), args.output)
    result["checkpoint_sha256"] = hashlib.sha256(
        Path(args.checkpoint).read_bytes()
    ).hexdigest()
    (Path(args.output) / "model_metadata.json").write_text(
        json.dumps(result, indent=2) + "\n"
    )
    print(json.dumps(result["parity"]))


if __name__ == "__main__":
    main()
