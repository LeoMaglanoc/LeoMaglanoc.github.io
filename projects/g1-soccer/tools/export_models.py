"""Export deterministic coach and recurrent walker; verify saved native traces."""

from pathlib import Path
import json, sys, shutil
import numpy as np
import torch
from torch import nn
from stable_baselines3 import PPO
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from export_walking import ExplicitStatePolicy

torch.set_num_threads(1)


class Coach(nn.Module):
    def __init__(self, policy):
        super().__init__()
        self.actor = policy.mlp_extractor.policy_net
        self.out = policy.action_net

    def forward(self, obs):
        return torch.clamp(self.out(self.actor(obs)), -1, 1)


def export():
    coach = PPO.load(ROOT / "checkpoints/coach-best.zip", device="cpu")
    walker = torch.jit.load(
        ROOT.parents[0] / "g1/models/motion.pt", map_location="cpu"
    ).eval()
    torch.onnx.export(
        Coach(coach.policy).eval(),
        torch.zeros(1, 13),
        ROOT / "models/coach.onnx",
        input_names=["obs"],
        output_names=["action"],
        opset_version=17,
        dynamo=False,
    )
    torch.onnx.export(
        ExplicitStatePolicy(walker).eval(),
        (torch.zeros(1, 47), torch.zeros(1, 1, 64), torch.zeros(1, 1, 64)),
        ROOT / "models/walker.onnx",
        input_names=["obs", "hidden", "cell"],
        output_names=["action", "next_hidden", "next_cell"],
        opset_version=17,
        dynamo=False,
    )
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    high = ort.InferenceSession(str(ROOT / "models/coach.onnx"), sess_options=options)
    low = ort.InferenceSession(str(ROOT / "models/walker.onnx"), sess_options=options)
    errors = dict(coach=0.0, walker=0.0, hidden=0.0, cell=0.0)
    fixtures = json.loads((ROOT / "results/reference-fixtures.json").read_text())
    for episode in fixtures:
        for t in episode["trace"]:
            actual = high.run(None, {"obs": np.array([t["obs"]], dtype=np.float32)})[0][
                0
            ]
            errors["coach"] = max(
                errors["coach"], float(np.max(np.abs(actual - t["action"])))
            )
    traces = json.loads((ROOT / "results/low-level-fixtures.json").read_text())
    for t in traces:
        output = low.run(
            None,
            {k: np.array(t[k], dtype=np.float32) for k in ["obs", "hidden", "cell"]},
        )
        for key, actual, wanted in zip(
            ["walker", "hidden", "cell"], output, ["action", "next_hidden", "next_cell"]
        ):
            errors[key] = max(errors[key], float(np.max(np.abs(actual - t[wanted]))))
    report = dict(
        max_abs_errors=errors,
        tolerance=1e-5,
        coach_samples=sum(len(e["trace"]) for e in fixtures),
        walker_samples=len(traces),
        checkpoint_timesteps=coach.num_timesteps,
    )
    assert max(errors.values()) < report["tolerance"], report
    (ROOT / "results/export-parity.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    (ROOT / "layouts.json").write_text(
        json.dumps(
            [dict(seed=f["seed"], **f["initial"]) for f in fixtures],
            separators=(",", ":"),
        )
        + "\n"
    )
    shutil.copyfile(ROOT / "results/config.json", ROOT / "config.json")
    (ROOT / "replays.json").write_text(
        json.dumps(
            [
                dict(
                    seed=f["seed"],
                    initial=f["initial"],
                    result=f["result"],
                    frames=[t["qpos"] for t in f["trace"]],
                )
                for f in fixtures[:3]
            ],
            separators=(",", ":"),
        )
        + "\n"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    export()
