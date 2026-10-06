# Robot Locomotion Playground

The public UI currently exposes G1 only on `/locomotion/` and `/g1/`. The B2+Z1 MPC implementation, template, models, solver assets and reproduction tools are retained for future work, but the public app does not import or initialize MPC, including for old `#b2` links.

Retained implementations:

- **G1 live RL:** the existing PPO policy, ONNX runtime, MuJoCo model, keyboard/touch controls and push recovery are reused unchanged inside a disposable iframe.
- **B2+Z1 native MPC playback (MVP1):** genuine stand/walk/trot trajectories from the pinned upstream whole-body RNEA OCP, rendered with MuJoCo, contact schedules, force arrows and future-state skeletons. These are predicted trajectories, not measured physics rollouts.
- **B2+Z1 live browser MPC (MVP2):** the same serialized symbolic OCP executes through CasADi/IPOPT WASM in a Web Worker. Actual MuJoCo state feeds each solve; the first torque action and an optional joint tracking servo drive physics. No backend is involved. It is an experimental slow-motion controller, not a real-time hardware controller.

Desktop: drag to orbit, scroll to zoom. Mobile portrait: drag/pinch in the upper viewport; scroll the lower control panel. Live commands: hold WASD/QE or the arrow buttons. Space pauses, Backspace resets. Gait changes reset the robot and warm start. An infeasible solution pauses physics and displays the actual error rather than applying unsafe controls.

## Docker and reproduction

Run from the repository root:

```sh
docker compose -f projects/locomotion-playground/compose.yaml up -d site
docker build -t locomotion-playground-native projects/locomotion-playground
```

Open `http://localhost:8001/projects/locomotion-playground/`. The native image uses an explicit conda package lock and upstream revision `80e906d35d91783e85e1ef994023ca9082dc40c3`.

```sh
docker run --rm -v "$PWD:/workspace" locomotion-playground-native python /workspace/projects/locomotion-playground/tools/upstream_smoke.py
docker run --rm -v "$PWD:/workspace" locomotion-playground-native python /workspace/projects/locomotion-playground/tools/benchmark.py --max-iter 50
docker run --rm -v "$PWD:/workspace" locomotion-playground-native python /workspace/projects/locomotion-playground/tools/build_model.py
docker run --rm -v "$PWD:/workspace" locomotion-playground-native python /workspace/projects/locomotion-playground/tools/validate_replay.py
docker run --rm -v "$PWD:/workspace" locomotion-playground-native python /workspace/projects/locomotion-playground/tools/export_runtime.py
docker run --rm -v "$PWD:/workspace" locomotion-playground-native python /workspace/projects/locomotion-playground/tools/export_seeds.py
docker run --rm -v "$PWD:/workspace" locomotion-playground-native python /workspace/projects/locomotion-playground/tools/closed_loop.py
```

Generated files may be owned by root when using Docker. `benchmark.py --help` describes output/iteration options. Exporting writes compressed symbolic graphs. The separately documented generated-C experiment is optional.

Browser runtime assets are committed. No npm build is required. Node 22 runs the contract, lifecycle and actual full WASM numerical fixture checks:

```sh
cd projects/locomotion-playground
npm test
npm run test:feedback
node --expose-gc tests/feedback-check.mjs
# Longer actual WASM feedback check, optional:
MPC_GAIT=trot MPC_STEPS=60 npm run test:feedback
```

`experiments/toy.html` checks Fatrop worker initialization independently; `experiments/full.html` solves the original whole-body OCP three times and compares it with a native numerical fixture. Open these with Chrome using the Docker site server.

Publish the source assets into the Jekyll tree before building the site:

```sh
python3 scripts/publish-project-assets.py
```

See [engineering report](docs/engineering-report.md), [state/runtime contract](docs/mpc-runtime-contract.md), [G1 baseline](docs/g1-baseline.md), [native measurements](results/benchmark.md), and [licenses](THIRD_PARTY_NOTICES.md). The two robots are not a controlled RL-versus-MPC performance comparison.
