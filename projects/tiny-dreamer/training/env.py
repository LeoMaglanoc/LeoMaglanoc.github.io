"""Only observation flattening, action clipping and explicit action holding.

position = [slider x, pole xmat zz (cos), pole xmat xz (sin)];
velocity = [slider dx/dt, hinge dtheta/dt]. No custom physics or reward.
"""

import json
from pathlib import Path
import numpy as np
from dm_control import suite

OBS_SCALE = np.array([1, 1, 1, 3, 8], np.float32)


class EnvAdapter:
    def __init__(self, seed=0, action_repeat=5):
        self.env = suite.load("cartpole", "swingup", task_kwargs={"random": seed})
        self.keys = tuple(self.env.observation_spec())
        assert self.keys == ("position", "velocity")
        assert tuple(s.shape for s in self.env.observation_spec().values()) == (
            (3,),
            (2,),
        )
        self.spec = self.env.action_spec()
        self.action_repeat = action_repeat

    def flatten(self, observation):
        return np.concatenate([observation[k].ravel() for k in self.keys]).astype(
            np.float32
        )

    def reset(self):
        return self.flatten(self.env.reset().observation)

    def step(self, action, push=0):
        action = np.clip(
            np.asarray(action, dtype=np.float64).reshape(self.spec.shape),
            self.spec.minimum,
            self.spec.maximum,
        )
        rewards = []
        for _ in range(self.action_repeat):
            self.env.physics.data.qfrc_applied[0] = push
            ts = self.env.step(action)
            rewards.append(ts.reward)
            if ts.last():
                break
        self.env.physics.data.qfrc_applied[:] = 0
        # Time limit is a truncation, not a physical terminal state: discount=1.
        return (
            self.flatten(ts.observation),
            float(np.mean(rewards)),
            float(ts.discount),
            ts.last(),
        )

    def contract(self):
        return {
            "domain": "cartpole",
            "task": "swingup",
            "observation_keys": list(self.keys),
            "observation_order": [
                "cart_position",
                "pole_cos",
                "pole_sin",
                "cart_velocity",
                "pole_angular_velocity",
            ],
            "observation_dim": 5,
            "action_dim": 1,
            "qpos_order": ["slider", "hinge_1"],
            "qvel_order": ["slider", "hinge_1"],
            "angle_units": "radians",
            "actuator_gear": self.env.physics.model.actuator_gear.tolist(),
            "normalization": {
                "mean": [0] * 5,
                "scale": OBS_SCALE.tolist(),
                "method": "fixed physical scales; no fitted statistics",
            },
            "action_min": self.spec.minimum.tolist(),
            "action_max": self.spec.maximum.tolist(),
            "physics_timestep": float(self.env.physics.model.opt.timestep),
            "native_control_timestep": self.env.control_timestep(),
            "action_repeat": self.action_repeat,
            "policy_timestep": self.env.control_timestep() * self.action_repeat,
            "reward_aggregation": "mean over held native controls",
            "episode_seconds": 10,
            "reset_distribution": "dm_control native swingup: x~N(0,.01), theta~N(pi,.01), velocities~N(0,.01)",
        }


def export_physics(directory, action_repeat=5):
    import mujoco

    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    adapter = EnvAdapter(123, action_repeat)
    adapter.reset()
    # Compiled MJCF expands all dm_control includes, without changing the model.
    mujoco.mj_saveLastXML(
        str(directory / "cartpole.xml"), adapter.env.physics.model.ptr
    )
    physics = adapter.env.physics
    trace = {
        "initial_qpos": physics.data.qpos.tolist(),
        "initial_qvel": physics.data.qvel.tolist(),
        "steps": [],
    }
    for i in range(40):
        action = [float(np.sin(i * 0.37) * 0.7)]
        obs, reward, _, _ = adapter.step(action)
        trace["steps"].append(
            {
                "action": action,
                "qpos": physics.data.qpos.tolist(),
                "qvel": physics.data.qvel.tolist(),
                "observation": obs.tolist(),
                "reward": reward,
            }
        )
    (directory / "reference_trace.json").write_text(json.dumps(trace, indent=2) + "\n")
    return adapter.contract()
