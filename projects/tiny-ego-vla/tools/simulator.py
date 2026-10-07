from common import *

os.environ["LP_NUM_THREADS"] = "4"
setup_libero()
import numpy as np, mujoco
from libero.libero import benchmark, get_libero_path
from libero.libero.envs import OffScreenRenderEnv


def make_env(task_key, size=128):
    task_id = {"bowl_plate": 8, "bowl_ramekin": 1}[task_key]
    suite = benchmark.get_benchmark_dict()["libero_spatial"]()
    task = suite.get_task(task_id)
    env = OffScreenRenderEnv(
        bddl_file_name=str(
            Path(get_libero_path("bddl_files")) / task.problem_folder / task.bddl_file
        ),
        camera_names=["agentview"],
        camera_heights=size,
        camera_widths=size,
        hard_reset=False,
    )
    env.seed(101)
    env.reset()
    # Render only when the policy observes, rather than every internal action step.
    env.env.modify_observable("agentview_image", "enabled", False)
    tune_render(env)
    return env, task


def tune_render(env):
    ctx = env.sim._render_context_offscreen
    ctx.scn.flags[mujoco.mjtRndFlag.mjRND_SHADOW] = 0
    ctx.scn.flags[mujoco.mjtRndFlag.mjRND_REFLECTION] = 0


def upright_frame(env, size=128):
    return env.sim.render(width=size, height=size, camera_name="agentview")[::-1].copy()


def proprio(obs):
    from robosuite.utils.transform_utils import quat2axisangle

    return np.concatenate(
        [
            obs["robot0_eef_pos"],
            quat2axisangle(obs["robot0_eef_quat"]),
            obs["robot0_gripper_qpos"],
        ]
    ).astype("float32")
