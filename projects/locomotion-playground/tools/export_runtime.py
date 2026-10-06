"""Export the original OCP and dynamics to C, plus a flat deployment contract."""
import sys,os,json,gzip,argparse
from pathlib import Path
import numpy as np
import casadi as ca
import pinocchio as pin
sys.path.insert(0,'/opt/wb-mpc');os.chdir('/opt/wb-mpc')
import main as upstream
from optimization import make_ocp
from args import DYN_ARGS,SOLVER_ARGS
robot=upstream.B2_Z1(reference_pose='standing_with_arm_up',arm_joints=4);robot.set_gait_sequence('trot',.8)
pin.computeAllTerms(robot.model,robot.data,robot.q0,np.zeros(robot.nv))
ocp=make_ocp(dynamics='whole_body_rnea',dyn_args=DYN_ARGS['whole_body_rnea'],robot=robot,nodes=14,tau_nodes=3,warm_start=True)
ocp.set_time_params(.015,.08);ocp.set_swing_params(.07,[.1,-.2]);ocp.set_tracking_targets(upstream.base_vel_des,upstream.arm_vel_des,upstream.arm_force_des)
ocp.update_params(ocp.x_nom,0)
opts=dict(SOLVER_ARGS['fatrop']['opts'],**{'fatrop.max_iter':50,'print_time':False,'expand':True})
ocp.init_solver('fatrop',{'opts':opts})
ocp.update_params(ocp.x_nom,0)
params=ocp.get_solver_params()
reference_sol=ocp.solver_function(*params)
g0,lb0,ub0=ocp.g_data(reference_sol,ocp.opti.value(ocp.opti.p))
reference_cv=float(ocp.constr_viol_norm_inf(g0,lb0,ub0))
assert ocp.mass>0 and reference_cv<1e-3,(ocp.mass,reference_cv)
print('Reference solve CV',reference_cv,'Mass',ocp.mass,flush=True)
offset=0;inputs=[];packed=[]
for p in params:
    values=np.asarray(p).flatten(order='F').tolist();inputs.append(dict(offset=offset,size=len(values)));offset+=len(values);packed+=values
out=Path('/workspace/projects/locomotion-playground/mpc');out.mkdir(exist_ok=True)
config=dict(revision='80e906d35d91783e85e1ef994023ca9082dc40c3',inputs=inputs,initial=packed,solution_size=int(ocp.opti.x.numel()),mass=ocp.mass,front_ratio=robot.front_force_ratio,max_iter=50,dt=[float(ocp.opti.value(dt)) for dt in ocp.dts],q0=robot.q0.tolist(),gait_period=.8)
(out/'deployment.json').write_text(json.dumps(config,separators=(',',':')))
# Decode using upstream manifold dynamics. Retain the original objective and
# constraints, and calculate their actual violation on the returned solution.
sol=ca.MX.sym('solution',ocp.opti.x.numel());states=[];idx=0
for i in range(14):
    states.append(ocp.dyn.state_integrate()(ocp.x_init,sol[idx:idx+44]));idx+=44+ocp.nu_opt[i]
states.append(ocp.dyn.state_integrate()(ocp.x_init,sol[-44:]))
g,lb,ub=ocp.g_data(sol,ocp.opti.p)
violation=ca.mmax(ca.vertcat(ca.fmax(lb-g,0),ca.fmax(g-ub,0)))
packed_out=ca.vertcat(*[x[:23] for x in states],*[x[23:] for x in states],sol[44+37:44+53],sol[44+22:44+37],violation)
decoder=ca.Function('decode_solution',[sol]+ocp.solver_params[:-1],[packed_out])
_,lb,ub=ocp.g_data(np.zeros(ocp.opti.x.numel()),ocp.opti.value(ocp.opti.p))
config['equality']=(np.asarray(lb).flatten()==np.asarray(ub).flatten()).tolist()
config['decoded_size']=int(packed_out.numel());config['decode_inputs']=[int(decoder.numel_in(i)) for i in range(decoder.n_in())]
(out/'deployment.json').write_text(json.dumps(config,separators=(',',':')))
# Export symbolic functions for CasADi WASM. The upstream Pinocchio dynamics
# are embedded in these functions; the browser never rebuilds rigid-body math.
nlp=ca.Function('nlp',[ocp.opti.x,ocp.opti.p],[ocp.opti.f,ocp.opti.g],['x','p'],['f','g'])
packer=ca.Function('pack_params',ocp.solver_params[:-1],[ocp.opti.p])
bounds=ca.Function('bounds',[ocp.opti.p],[ocp.opti.lbg,ocp.opti.ubg])
for name,fn in [('nlp',nlp),('pack',packer),('bounds',bounds),('decode',decoder)]:
    (out/f'{name}.casadi.gz').write_bytes(gzip.compress(fn.serialize().encode(),mtime=0))
print('Exported symbolic runtime',flush=True)
# Native fixture for exact first-solve numerical transfer checks.
solved=reference_sol
fixture=dict(input=packed,solution=np.asarray(solved).flatten().tolist(),decoded=np.asarray(decoder(solved,*params[:-1])).flatten().tolist())
(out/'native-fixture.json').write_text(json.dumps(fixture,separators=(',',':')))
print('Exported original whole-body Fatrop solve and native fixture',flush=True)

cli=argparse.ArgumentParser();cli.add_argument("--c",action="store_true");args=cli.parse_args()
if args.c:
    destination=out.parent/"experiments";os.chdir(destination)
    ocp.solver_function.generate("solver_function.c")
    decoder.generate("decode_solution.c")
    print("Generated optional C experiment",flush=True)
