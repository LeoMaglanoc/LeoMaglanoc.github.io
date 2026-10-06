"""Run the pinned upstream formulation without changing its controller."""
import sys, os, json, time, platform, argparse
from pathlib import Path
sys.path.insert(0, '/opt/wb-mpc')
os.chdir('/opt/wb-mpc')
import numpy as np
import pinocchio as pin
import casadi as ca
import main as upstream
from optimization import make_ocp
from args import DYN_ARGS, SOLVER_ARGS

parser = argparse.ArgumentParser()
parser.add_argument('--loops', type=int, default=120)
parser.add_argument('--generate', action='store_true')
parser.add_argument('--max-iter', type=int, default=10)
parser.add_argument('--output', default='/workspace/projects/locomotion-playground/results')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
flat = lambda x: np.asarray(x).flatten().tolist()
reports = []
for gait in ['stand', 'walk', 'trot']:
    robot = upstream.B2_Z1(reference_pose='standing_with_arm_up', arm_joints=4)
    robot.set_gait_sequence(gait, upstream.gait_period)
    pin.computeAllTerms(robot.model, robot.data, robot.q0, np.zeros(robot.nv))
    ocp = make_ocp(dynamics=upstream.dynamics, dyn_args=DYN_ARGS[upstream.dynamics], robot=robot, nodes=14, tau_nodes=3, warm_start=True)
    ocp.set_time_params(upstream.dt_min, upstream.dt_max)
    ocp.set_swing_params(upstream.swing_height, upstream.swing_vel_limits)
    ocp.set_tracking_targets(upstream.base_vel_des, upstream.arm_vel_des, upstream.arm_force_des)
    x = ocp.x_nom
    ocp.update_params(x, 0)
    solver_args = {'opts': dict(SOLVER_ARGS['fatrop']['opts'], **{'fatrop.max_iter': args.max_iter, 'print_time': False})}
    ocp.init_solver('fatrop', solver_args)
    frames, latencies, violations = [], [], []
    for k in range(args.loops):
        t = k * upstream.dt_min
        ocp.update_params(x, t)
        params = ocp.get_solver_params()
        start = time.perf_counter()
        sol = ocp.solver_function(*params)
        ms = (time.perf_counter() - start) * 1000
        g, lb, ub = ocp.g_data(sol, ocp.opti.value(ocp.opti.p))
        cv = float(ocp.constr_viol_norm_inf(g, lb, ub))
        latencies.append(ms); violations.append(cv)
        for name in ['q_sol','v_sol','a_sol','forces_sol','tau_sol']:
            getattr(ocp, name).clear()
        ocp.retract_stacked_sol(sol, retract_all=True)
        q, v, a, forces = [flat(getattr(ocp, name)[0]) for name in ['q_sol','v_sol','a_sol','forces_sol']]
        tau = flat(ocp.tau_sol[0])
        prediction = [flat(qp) for qp in ocp.q_sol]
        contacts, _ = robot.gait_sequence.get_gait_schedule(t, [float(ocp.opti.value(dt)) for dt in ocp.dts], 14)
        assert all(np.isfinite(z).all() for z in [q,v,a,forces,tau,prediction]), 'Nonfinite output'
        frames.append(dict(t=t,q=q,v=v,a=a,tau=tau,contact_forces=forces,contact_schedule=contacts[:,0].tolist(),prediction=prediction,solve_time_ms=ms,constraint_violation=cv))
        x = ocp.dyn.state_integrate()(x, ocp.DX_prev[1])
    report = dict(gait=gait, dynamics=upstream.dynamics, nodes=14, warm_start=True, loops=args.loops, max_iter=args.max_iter, first_solve_ms=latencies[0], mean_solve_ms=float(np.mean(latencies)),median_solve_ms=float(np.median(latencies)),p95_solve_ms=float(np.percentile(latencies,95)),constraint_violation_max=max(violations),constraint_violation_mean=float(np.mean(violations)),latencies_ms=latencies,violations=violations)
    reports.append(report)
    metadata = dict(robot='B2+Z1',revision='80e906d35d91783e85e1ef994023ca9082dc40c3',solver='fatrop',dynamics=upstream.dynamics,nodes=14,gait=gait,dt=upstream.dt_min,nq=robot.nq,nv=robot.nv,joints=list(robot.model.names)[2:],feet=robot.gait_sequence.feet,command=flat(upstream.base_vel_des),horizon_dt=[float(ocp.opti.value(dt)) for dt in ocp.dts])
    (out / f'{gait}.json').write_text(json.dumps(dict(metadata=metadata,frames=frames),allow_nan=False,separators=(',',':')))
    if gait == 'trot':
        # Exercise the original viewer and force visualization, once rather than 50 replays.
        robot.robot.initViewer(); robot.robot.loadViewerModel('pinocchio'); robot.robot.display(robot.q0)
        upstream.visualize_forces(robot.robot.viewer,robot,robot.model,robot.data,ocp.q_sol[0],ocp.forces_sol[0])
        if args.generate:
            os.chdir(str(out))
            ocp.compile_solver()
            os.chdir('/opt/wb-mpc')
    print(json.dumps({k:v for k,v in report.items() if k not in ['latencies_ms','violations']}), flush=True)
cpu = next((line.split(':',1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines() if line.startswith('model name')), platform.processor())
summary = dict(cpu=cpu,python=platform.python_version(),casadi=ca.__version__,pinocchio=pin.__version__,fatrop='bundled CasADi plugin',benchmarks=reports)
(out/'benchmark.json').write_text(json.dumps(summary,indent=2))
lines=['# Native MPC benchmark','',f"CPU: {cpu}; Python {summary['python']}; CasADi {ca.__version__}; Pinocchio {pin.__version__}; Fatrop bundled plugin.",'','Unmodified upstream OCP, 14 nodes, 3 torque nodes, warm start, 15–80 ms horizon steps. State advances with the upstream predicted next state; this is not a physics closed loop.','','| Gait | First ms | Median ms | p95 ms | Max violation |','|---|---:|---:|---:|---:|']
for r in reports: lines.append(f"| {r['gait']} | {r['first_solve_ms']:.2f} | {r['median_solve_ms']:.2f} | {r['p95_solve_ms']:.2f} | {r['constraint_violation_max']:.6g} |")
(out/'benchmark.md').write_text('\n'.join(lines)+'\n')
