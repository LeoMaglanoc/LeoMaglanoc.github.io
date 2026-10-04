#!/usr/bin/env python3
"""Run the native Unitree controller headlessly and dump parity traces."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import mujoco
import numpy as np
import torch


ROOT = Path(__file__).resolve().parents[1]
DT = 0.002
DECIMATION = 10
KP = np.array([100, 100, 100, 150, 40, 40, 100, 100, 100, 150, 40, 40], dtype=np.float32)
KD = np.array([2, 2, 2, 4, 2, 2, 2, 2, 2, 4, 2, 2], dtype=np.float32)
DEFAULT_ANGLES = np.array([-0.1, 0, 0, 0.3, -0.2, 0, -0.1, 0, 0, 0.3, -0.2, 0], dtype=np.float32)
COMMAND = np.array([0, 0, 0], dtype=np.float32)


def gravity_orientation(quaternion):
    qw, qx, qy, qz = quaternion
    return np.array([2 * (-qz * qx + qw * qy), -2 * (qz * qy + qw * qx), 1 - 2 * (qw * qw + qz * qz)])


def make_observation(data, action, step):
    obs = np.zeros(47, dtype=np.float32)
    qj = (data.qpos[7:] - DEFAULT_ANGLES) * 1.0
    dqj = data.qvel[6:] * 0.05
    omega = data.qvel[3:6] * 0.25
    gravity = gravity_orientation(data.qpos[3:7])
    phase = (step * DT % 0.8) / 0.8
    obs[:3] = omega
    obs[3:6] = gravity
    obs[6:9] = COMMAND * np.array([2, 2, 0.25])
    obs[9:21] = qj
    obs[21:33] = dqj
    obs[33:45] = action
    obs[45:47] = [np.sin(2 * np.pi * phase), np.cos(2 * np.pi * phase)]
    return obs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=1000)
    parser.add_argument("--trace", type=int, default=10)
    parser.add_argument("--output", type=Path, default=ROOT / "reference_trace.json")
    args = parser.parse_args()

    model = mujoco.MjModel.from_xml_path(str(ROOT / "robots/g1/scene.xml"))
    data = mujoco.MjData(model)
    model.opt.timestep = DT
    policy = torch.jit.load(ROOT / "models/motion.pt", map_location="cpu").eval()
    action = np.zeros(12, dtype=np.float32)
    target = DEFAULT_ANGLES.copy()
    traces = []
    for step in range(1, args.steps + 1):
        data.ctrl[:] = KP * (target - data.qpos[7:]) - KD * data.qvel[6:]
        mujoco.mj_step(model, data)
        if step % DECIMATION == 0:
            obs = make_observation(data, action, step)
            with torch.no_grad():
                output = policy(torch.from_numpy(obs[None, :]))
                action = (output[0] if isinstance(output, (tuple, list)) else output).numpy().squeeze().astype(np.float32)
            target = action * 0.25 + DEFAULT_ANGLES
            if len(traces) < args.trace:
                traces.append({"step": step, "qj": data.qpos[7:].tolist(), "dqj": data.qvel[6:].tolist(), "quat": data.qpos[3:7].tolist(), "omega": data.qvel[3:6].tolist(), "obs": obs.tolist(), "action": action.tolist(), "target_q": target.tolist()})
    args.output.write_text(json.dumps({"simulation_dt": DT, "control_decimation": DECIMATION, "traces": traces}, indent=2) + "\n")
    print(f"wrote {args.output} ({len(traces)} policy traces)")


if __name__ == "__main__":
    main()
