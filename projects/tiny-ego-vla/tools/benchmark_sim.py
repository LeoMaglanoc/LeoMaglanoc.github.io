from common import *
setup_libero()
import numpy as np, torch, h5py
from libero.libero import benchmark, get_libero_path
from libero.libero.envs import OffScreenRenderEnv
suite = benchmark.get_benchmark_dict()['libero_spatial']()
for i in range(suite.n_tasks):
    t = suite.get_task(i)
    print(i, t.name, flush=True)
task = next(suite.get_task(i) for i in range(suite.n_tasks) if suite.get_task(i).name == 'pick_up_the_black_bowl_next_to_the_plate_and_place_it_on_the_plate')
t0=time.perf_counter()
env=OffScreenRenderEnv(bddl_file_name=str(Path(get_libero_path('bddl_files'))/task.problem_folder/task.bddl_file), camera_heights=128, camera_widths=128)
env.seed(42)
obs=env.reset()
reset_seconds=time.perf_counter()-t0
print('RESET', reset_seconds, [(k,np.shape(v)) for k,v in obs.items()], flush=True)
t0=time.perf_counter()
for i in range(30): obs,r,done,info=env.step(np.zeros(7))
print('30STEPS',time.perf_counter()-t0,flush=True)
import imageio.v3 as iio
iio.imwrite(ART/'panda-benchmark.jpg',obs['agentview_image'][::-1])
with h5py.File(DATA/'bowl_plate.hdf5') as f:
    print('DATA ATTRS',dict(f['data'].attrs),flush=True)
    d=f['data/demo_0']
    print('DEMO',list(d.keys()),[(k,np.shape(v)) for k,v in d['obs'].items()],flush=True)
    print('INIT', d['states'][0].shape, 'MODEL XML', list(d.attrs),flush=True)
    obs=env.set_init_state(d['states'][0])
    t0=time.perf_counter(); success=False
    frames=[]
    for i,act in enumerate(d['actions']):
        obs,r,done,info=env.step(act)
        success=success or done
        if i%2==0: frames.append(obs['agentview_image'][::-1])
    import imageio
    imageio.mimsave(str(ART/'demonstration.mp4'),frames,fps=10)
    save_json(ART/'sim-benchmark.json',{'reset_seconds':reset_seconds,'replay_seconds':time.perf_counter()-t0,'steps':len(d['actions']),'success':bool(success),'task':task.name})
    print('REPLAY',success,len(frames),flush=True)
env.close()
