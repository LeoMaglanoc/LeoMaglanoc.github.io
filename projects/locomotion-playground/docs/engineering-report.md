# Engineering report

## Scope and plan assessment

The plan's sequencing was sound: establish the original controller and model contract, benchmark natively, prove playback, then attempt browser optimization. Both MVP paths are implemented. Keeping G1 in its existing module/iframe protects the working policy demonstration; the shell owns mode lifecycle and releases B2 render/physics/worker resources on switches.

## What actually runs

Native Docker runs the pinned original whole-body RNEA OCP with Pinocchio 3.3.0, CasADi 3.6.7 and its Fatrop plugin. The unchanged upstream main loop completed 200 iterations, and its original Meshcat visualization loaded and displayed 15 frames. Sleep alone was replaced to terminate the viewer smoke test. The source main advances the predicted next state rather than integrating applied torques.

MVP1 exports 120 native predicted states per gait (1.8 simulated seconds), including torques, force/contact schedules, feasibility, solve times and all 15 prediction nodes. Browser MuJoCo provides the model transforms for playback. Kinematic playback has no runtime optimizer; torque replay is explicitly experimental and can diverge.

MVP2 loads precomputed symbolic dynamics/derivatives, parameter packing, constraint bounds and output decoding. These are exported from the original CasADi/Pinocchio graph, not approximated in JavaScript. CasADi WASM 3.8.1 constructs the full OCP; IPOPT solves feedback requests and Fatrop solves the numerical transfer experiment. The runtime solves the full 1226-variable NLP in a module worker. Gait schedules and desired velocities are supplied at runtime; actual MuJoCo q/v are feedback. Only nominal primal startup seeds are precomputed. Runtime control values are newly optimized.

The execution layer adds an optional leg/arm joint tracking servo (leg kp/kd 800/40, arm 80/8) to the first MPC torque and clamps to URDF actuator limits. Its targets come from the newly solved next node. This is necessary simulation stabilization and is exposed in the UI. Live browser initialization retains the previous feasible full primal and zeros forces for new swing feet, rather than the original gravity-force reset; the OCP objective, constraints and rigid-body dynamics are unchanged. Browser iteration cap is 200 versus the original 10 and benchmark 50. IPOPT feedback tolerance is 1e-5; returned maximum bound violation must remain below 1e-3.

Physics uses 2 ms steps. Worker requests never overlap; generation IDs reject stale results after reset. Each applied solution is limited to one 15 ms simulated controller interval. The wall-clock simulation rate adapts to observed p95 solver time; latency spikes delay simulated progress while rendering continues. This is slow-motion feedback control, not a claim of realtime execution. Invalid/nonfinite or constraint violations above 1e-3 pause with a visible error.

## Model correspondence

The free-joint quaternion is explicitly converted between Pinocchio XYZW and MuJoCo WXYZ. Base linear velocity is converted between body-local and world frames; angular velocity remains body-local. Every joint and actuator is mapped by name and checked at startup.

The source URDF's standalone base inertia does not satisfy MuJoCo's triangle inequality. The converter uses the exact Pinocchio reduced-body inertias, including fixed-link contributions, rather than modifying the rigid body's measured inertia. Fixed transforms and collision primitives are retained. Wrist/gripper joints are locked exactly as upstream. The ground is aligned with the nominal foot sphere bottoms; this changes ground placement, not robot geometry.

Across five random configurations, maximum foot/end-effector FK error is 2.22e-16 m; maximum joint mass matrix difference is 3.06e-9. Model dimensions are nq=23, nv=22, nu=16; total mass is 77.2683 kg. Native feedback with the servo passes 60 updates for all three gaits (0.9 seconds), with final base heights 0.536/0.532/0.504 m. These short tests do not establish indefinite stability or arbitrary disturbance recovery.

## Measurements and feasibility experiment

Measurements were taken on an Intel i7-8565U laptop. The 50-iteration native benchmark gives median stand/walk/trot times of 61.6/213.9/109.2 ms and p95 times of 106.0/694.4/160.1 ms; maximum bound violations remain below 8e-6. The original 10-iteration walk cap intermittently produced large violations, justifying the documented iteration increase. Some benchmark work shared CPU resources with compilation, so these are reproducible observations, not isolated performance claims.

The full Chrome numerical transfer test completed worker setup in about 10.1 s, then solved three times in 400/554/610 ms, with violations below 3e-7 and maximum native torque difference below 2e-5. The live feedback loop has state-dependent latency and can be substantially slower; the UI reports actual times. Node also checks the real WASM solver against the native fixture. This evidence supports genuine optimization in-browser, but not hardware realtime.

The first WASM attempt generated the original C solver and compiled pinned Fatrop/BLASFEO with Emscripten. Fatrop and BLASFEO compiled, but clang exhausted laptop memory on the 53 MB generated translation unit (even at O0). Disabling CasADi expansion made the generated C 372 MB. Those generated files are excluded from Git. The successful alternative is the unmodified npm CasADi WASM distribution plus compressed serialized symbolic graphs, avoiding a manually rewritten dynamics model. Experimental C scripts are retained for reproducibility, not advertised as a completed generated-C deployment.

## Validation and limitations

Docker provides both native dependencies and the static preview server. Tests cover state ordering, quaternion/velocity conversions, rollout contracts, worker reset/overlap behavior, and full native-to-WASM numerical transfer. Chrome computer-agent validation checks the rendered desktop and mobile portrait layouts, mode changes, playback, live feedback, reset/pause and telemetry. Existing G1 input/push/contract tests pass.

Open-loop torque playback is not reliably stable. Live MPC remains experimental: slow initialization, high memory/CPU cost and nonlinear feasibility can limit commands or disturbances. Primitive collision geometry is faithful to the reduced model, but is less visually detailed than vendor meshes. Separate robots and execution layers prevent a fair numerical RL-versus-MPC ranking. No backend, fabricated horizon, prerecorded control substitution or placeholder live solver is used.

## Browser feedback solver adaptation

The newer WASM Fatrop plugin solves the fixed-state native fixture accurately, but actual measured feedback tests lost feasibility after 2–9 updates, depending on initialization. Reducing bound push and nominal seed retries did not establish reliable feedback. Live mode therefore uses IPOPT on exactly the same whole-body NLP, rather than changing or approximating the MPC model. This is a deliberate deviation from the preferred browser Fatrop path. The original native Fatrop benchmark and browser Fatrop experiment remain available. IPOPT passed the initial ten-update actual WASM MuJoCo feedback check with bound violations below 1e-9; longer gait evidence is recorded separately.

## Actual WASM feedback results

Each gait passed 60 controller updates / 0.9 simulated seconds using browser-distribution MuJoCo and IPOPT, not native Python physics. Walk/trot commands were vx=0.1 m/s. These tests ran concurrently on the development laptop; their latency includes shared CPU load.

| Gait | Median ms | p95 ms | Max violation | Last sampled height m |
|---|---:|---:|---:|---:|
| stand | 1472 | 5337 | 9.2e-10 | 0.536 |
| walk | 5686 | 15418 | 1.3e-07 | 0.532 |
| trot | 3818 | 13511 | 1.2e-06 | 0.503 |

## WASM ownership compatibility

Chrome exposed memory traps after several feedback solves. Forcing Node garbage collection between solves reproduced ignored native-free errors and heap corruption in the package SWIG finalizers. The loader now scopes an explicit-ownership FinalizationRegistry adapter to the unmodified CasADi wrapper. Runtime input/output handles are explicitly deleted; remaining temporary allocations are bounded by recycling the worker heap every 128 successful solves. Recycling pauses simulated advancement at its action-age boundary while rendering continues. Gait/reset clears primal guesses, and switching modes terminates the worker. A ten-update forced-GC physics-feedback check passes with the adapter. Each worker loads only its selected solver plugin. Vendored JS is preserved byte-for-byte by the Jekyll packaging hook.

Chrome at 390×844 passed 50 live IPOPT feedback solves after the ownership fix, including a 60 N / 80 ms simulated push. The robot stayed upright at approximately 0.536 m base height with no solver warning. At that checkpoint median/p95 solve latency was 958/3727 ms, setup 9.8 s, and the latest maximum bound violation was 2.3e-13. Background-tab render throttling and concurrent build load were present; these are observed browser results, not foreground FPS benchmarks. The checkpoint is saved in `results/chrome-portrait-live.json`.
