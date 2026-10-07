"""Higher-resolution presentation replays for deterministic default selections.
Re-renders saved actual policy states. Does not change actions, success or timing.
All other seeds/starts retain their original 128px recorded camera footage.
"""

from common import *
import numpy as np, imageio
from PIL import Image
from simulator import make_env, upright_frame
from datasets import CONFIG


def main():
    seed = CONFIG["seeds"][0]
    init = CONFIG["evaluation_initializations"][0]
    for task in CONFIG["robot_tasks"]:
        env, _ = make_env(task, size=384)
        for budget in CONFIG["budgets"]:
            for regime in ["robot", "ego"]:
                path = (
                    ART
                    / "rollouts"
                    / f"robot-{regime}-{budget}-{seed}"
                    / task
                    / f"episode-{init}.npz"
                )
                d = np.load(path)
                frames = []
                states = [d["initial_state"]] + list(d["states"][1::2])
                if len(d["states"]) % 2:
                    states.append(d["states"][-1])
                assert len(states) == len(d["frames"])
                for state in states:
                    env.set_init_state(state)
                    frames.append(upright_frame(env, 384))
                imageio.mimsave(
                    str(path.with_name(f"episode-{init}-hi.mp4")),
                    frames,
                    fps=10,
                    codec="libx264",
                    quality=8,
                    macro_block_size=1,
                )
                Image.fromarray(frames[0]).save(
                    path.with_name(f"episode-{init}-hi.webp"), quality=85
                )
                print("rendered", task, budget, regime, len(frames), flush=True)
        env.close()


if __name__ == "__main__":
    main()
