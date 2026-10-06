# B2+Z1 whole-body RNEA runtime contract

Source: lukasmolnar/wb-mpc-locoman, revision `80e906d35d91783e85e1ef994023ca9082dc40c3`. The reference configuration is `standing_with_arm_up`; four Z1 joints remain active and the wrist/gripper joints are locked at zero by upstream `buildReducedRobot`.

## State and ordering

`q` has 23 elements: world base XYZ, quaternion XYZW, then 16 scalar joints. `v` has 22 elements: six free-flyer body-local linear/angular velocities, then joint rates. State `x_init = [q,v]` has 45 elements; tangent state increments have 44. Read the joint order from `robot.model.names[2:]` and map by name, never by URDF file order. Contact order is **FR, FL, RR, RL**, followed by the arm end effector `gripperCenter`.

MuJoCo free-joint qpos uses WXYZ rather than XYZW. MuJoCo base translational velocity is world-frame; rotate Pinocchio local translational velocity by the base rotation before replay. MuJoCo angular velocity remains body-local. Actuator ordering must be resolved independently by joint name.

## One iteration

1. Set tracking targets: `base_vel_des[6]`, arm-relative `arm_vel_des[3]`, world `arm_force_des[3]`.
2. `ocp.update_params(x_init,t_current)` updates the initial state, gait schedules and primal warm start.
3. `ocp.get_solver_params()` returns inputs in this exact order:
   `x_init, dt_min, dt_max, contact_schedule, swing_schedule, n_contacts, swing_period, swing_height, swing_vel_limits, Q_diag, R_diag, base_vel_des, arm_vel_des, arm_force_des, opti.x`.
4. `ocp.solver_function(*params)` returns the stacked primal solution. Schedule matrices are 4×14, CasADi column-major. Q is 44 elements; R contains 22 accelerations + 15 forces + 16 torques. The first three nodes contain all 53 inputs, remaining nodes contain 37; each node has a 44-element tangent state, with one terminal tangent state. The total decision vector has 1226 elements.
5. `retract_stacked_sol(...,retract_all=True)` produces q[15×23], v[15×22], a[14×22], forces[14×15], and explicit tau[16] at the first three nodes. Later torques can be recovered with `dyn.rnea_dynamics()(q,v,a,forces)[6:]`.
6. The first torque vector is the candidate simulator action. Hold it between solves only after validating the physical model correspondence. Contacts and end-effector external forces are separate from actuator torques.

The upstream main loop advances `x_init` using `state_integrate(x_init,DX_prev[1])`. It does **not** simulate the torque action through MuJoCo. Thus its output is a receding-horizon predicted rollout, not a measured closed-loop physics trace.

## Persistent state

Preserve `DX_prev`, `U_prev` and gait time. The default upstream warm-start method reuses DX and accelerations/torques at the same node indices and resets force guesses to contact-dependent gravity compensation. An interpolation method exists but is not called by the default update path. No persistent dual-variable input is exposed by the solve function. Reset invalidates previous trajectories and any pending worker result.

## Dependencies

Pinocchio loads/reduces the URDF model, SRDF configuration and frames. `pinocchio.casadi` builds differentiable kinematics and inverse dynamics. CasADi constructs the symbolic OCP, quaternion manifold operations, derivatives and parameterized solve function. Fatrop solves the structured NLP; generated C still depends on Fatrop and BLASFEO. Python manages gait timing, warm-start conversion and diagnostics. Exporting C removes Python and runtime Pinocchio only after the symbolic model is baked into the generated functions.

## Timing and constraints

14 horizon intervals form a geometric series from 0.015 to 0.08 seconds. The MPC reference advances by 0.015 seconds per iteration. The upstream solver caps iterations at 10 with tolerance 1e-3; finite output alone does not establish feasibility. The benchmark records the actual max bound violation at every solve. Physics replay and live browser deployment have separate acceptance gates.

## Browser deployment

`mpc/deployment.json` defines flat input offsets, equality classification and nominal q0. `pack`, `bounds`, `nlp`, and `decode` are compressed CasADi serializations exported from the original symbolic graph. The decoder returns 345 q values, 330 v values, 16 first torques, 15 first contact/end-effector forces, then the actual maximum bound violation (707 values total). Native startup seeds are feasible primal guesses, never substituted for solved runtime actions.

CasADi WASM 3.8.1 executes Fatrop numerical validation and IPOPT feedback in `mpc/worker.js`. Browser warm starts retain the full previous primal, zeroing force guesses at newly swinging feet. Browser max_iter=200, Fatrop tolerance=1e-3, IPOPT tolerance=1e-5, mu_init=1e-4 and bound_push=1e-7. The optional execution servo is separate from the unchanged NLP. Rendering continues while simulated physics slows to keep action age at most one 15 ms controller interval. Reset clears previous primal state and rejects pending results by generation ID. Read engineering-report.md for measured latency and feasibility limits.

The loader uses an explicit-ownership finalization adapter because the package automatic SWIG finalizers corrupt borrowed handles under browser GC. Worker heaps recycle after 128 accepted controls to bound temporary allocations; controls and physics time remain bounded during setup. Backend selection is explicit in worker initialization: `ipopt` for live feedback, `fatrop` for numerical validation.
