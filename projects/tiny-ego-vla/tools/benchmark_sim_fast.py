from common import *
os.environ['LP_NUM_THREADS']='4'
setup_libero()
import numpy as np, mujoco
from libero.libero import benchmark, get_libero_path
from libero.libero.envs import OffScreenRenderEnv
suite=benchmark.get_benchmark_dict()['libero_spatial']()
task=suite.get_task(8)
t0=time.perf_counter()
env=OffScreenRenderEnv(bddl_file_name=str(Path(get_libero_path('bddl_files'))/task.problem_folder/task.bddl_file),camera_names=['agentview'],camera_heights=128,camera_widths=128)
obs=env.reset(); reset=time.perf_counter()-t0
ctx=env.sim._render_context_offscreen
ctx.scn.flags[mujoco.mjtRndFlag.mjRND_SHADOW]=0
ctx.scn.flags[mujoco.mjtRndFlag.mjRND_REFLECTION]=0
t0=time.perf_counter()
for _ in range(30): obs,*_=env.step(np.zeros(7))
rendered=time.perf_counter()-t0
# Temporarily disable the observable so simulator-only throughput can be measured.
env.env.modify_observable('agentview_image','enabled',False)
t0=time.perf_counter()
for _ in range(100): obs,*_=env.step(np.zeros(7))
physics=time.perf_counter()-t0
save_json(ART/'sim-fast-benchmark.json',{'reset_seconds':reset,'rendered_steps_per_second':30/rendered,'physics_steps_per_second':100/physics,'rendering':'OSMesa CPU; one 128px camera; shadows/reflections off','lp_threads':4})
print((ART/'sim-fast-benchmark.json').read_text(),flush=True)
env.close()
