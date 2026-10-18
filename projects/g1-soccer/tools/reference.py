"""Reproduce upstream deterministic evaluation and preserve browser parity fixtures."""

import argparse, dataclasses, json, platform, sys, time
from pathlib import Path
import numpy as np
import torch
import mujoco
from stable_baselines3 import PPO

parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, required=True)
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--episodes", type=int, default=100)
parser.add_argument("--seed", type=int, default=1000)
args = parser.parse_args()
sys.path.insert(0, str(args.source / "train_files"))
from soccer_env import SoccerDribbleEnv
from config import SoccerDribbleConfig

torch.set_num_threads(1)
args.out.mkdir(parents=True, exist_ok=True)
model = PPO.load(
    args.source / "train_files/runs/ppo_v1/best_model/best_model.zip", device="cpu"
)
env = SoccerDribbleEnv()
print(env.low_level.policy, flush=True)
print(
    "state dict",
    [(k, list(v.shape)) for k, v in env.low_level.policy.state_dict().items()],
    flush=True,
)
results = []
fixtures = []
low_trace = []
start = time.perf_counter()
original = env.low_level.policy


class RecordingPolicy:
    def __getattr__(self, name):
        return getattr(original, name)

    def __call__(self, obs):
        before_h = original.hidden_state.clone()
        before_c = original.cell_state.clone()
        output = original(obs)
        if len(low_trace) < 256:
            low_trace.append(
                dict(
                    obs=obs.tolist(),
                    hidden=before_h.tolist(),
                    cell=before_c.tolist(),
                    action=output.tolist(),
                    next_hidden=original.hidden_state.tolist(),
                    next_cell=original.cell_state.tolist(),
                )
            )
        return output


env.low_level.policy = RecordingPolicy()
for i in range(args.episodes):
    obs, _ = env.reset(seed=args.seed + i)
    initial = dict(
        qpos=env.data.qpos.tolist(),
        qvel=env.data.qvel.tolist(),
        target=env.data.mocap_pos.tolist(),
    )
    trace = []
    total = 0
    while True:
        action, _ = model.predict(obs, deterministic=True)
        old = obs.copy()
        obs, reward, done, timeout, info = env.step(action)
        total += reward
        if i < 3:
            trace.append(
                dict(
                    obs=old.tolist(),
                    action=action.tolist(),
                    qpos=env.data.qpos.tolist(),
                    qvel=env.data.qvel.tolist(),
                    next_obs=obs.tolist(),
                )
            )
        if done or timeout:
            break
    distance = float(
        np.linalg.norm(
            env.data.qpos[env._ball_qpos_adr : env._ball_qpos_adr + 2]
            - env.data.mocap_pos[env._target_mocap_id, :2]
        )
    )
    result = dict(
        seed=args.seed + i,
        outcome=info.get("termination", "timeout"),
        steps=env._hl_step_count,
        seconds=env._hl_step_count * 0.2,
        final_distance=distance,
        reward=total,
    )
    results.append(result)
    fixtures.append(
        dict(seed=args.seed + i, initial=initial, result=result, trace=trace)
    )
    print(json.dumps(result), flush=True)
summary = dict(
    episodes=len(results),
    successes=sum(r["outcome"] == "success" for r in results),
    mean_seconds=float(np.mean([r["seconds"] for r in results])),
    mean_reward=float(np.mean([r["reward"] for r in results])),
    wall_seconds=time.perf_counter() - start,
    versions=dict(
        python=platform.python_version(),
        torch=torch.__version__,
        mujoco=mujoco.__version__,
    ),
    checkpoint_timesteps=model.num_timesteps,
    results=results,
)
(args.out / "native-evaluation.json").write_text(json.dumps(summary, indent=2) + "\n")
(args.out / "reference-fixtures.json").write_text(
    json.dumps(fixtures, separators=(",", ":")) + "\n"
)
(args.out / "low-level-fixtures.json").write_text(
    json.dumps(low_trace, separators=(",", ":")) + "\n"
)
(args.out / "config.json").write_text(
    json.dumps(dataclasses.asdict(SoccerDribbleConfig()), indent=2) + "\n"
)
print(json.dumps({k: v for k, v in summary.items() if k != "results"}), flush=True)
env.close()
