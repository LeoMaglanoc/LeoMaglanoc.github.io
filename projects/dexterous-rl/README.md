# Dexterous RL — Wuji Hand cube reorientation

Live demo: https://leomaglanoc.github.io/dexterous-rl/

This is direct deployment of Wuji Technology's released **WujiHand_Reorient**
Hand 1 PPO actor, not a newly trained model. The actor controls the matching
20-joint hand and a free 54 mm, 120 g cube using live MuJoCo contact physics.
Detailed original STL meshes render separately from collision geometry.

## Reproduce with Docker

From the repository root:

```bash
bash projects/dexterous-rl/tools/fetch-upstream.sh
docker compose -f projects/dexterous-rl/compose.yaml build research
docker compose -f projects/dexterous-rl/compose.yaml run --rm --user "$(id -u):$(id -g)" research
python3 scripts/publish-project-assets.py
docker compose -f projects/dexterous-rl/compose.yaml up preview
```

Open `http://127.0.0.1:8093/assets/interactive/dexterous-rl/` in Chrome.
Open `http://127.0.0.1:8093/tests/dexterous-rl/` and press **Run golden & closed-loop checks**
for native-to-browser observation/action/physics parity and 12 fixed-goal rollouts.
The test page requires the source repository preview; `projects/` is intentionally
excluded from the deployed website. The demo itself runs ten golden observation
and action checks during startup, and stops visibly if they fail.

Docker pins the Python base image by digest and Python dependencies in
`requirements.lock`. Native and browser MuJoCo are both **3.11.0**, matching
Wuji's release `pixi.lock`. Browser policy inference uses the site's shared
ONNX Runtime Web 1.23.2 WASM, one thread, no WebGPU or cross-origin isolation.

`tools/prepare.py` uses the official scene builder, mesh assets, observation
builder, and action processing. Its lightweight CPU adapter supplies the same
robot and object configuration without importing mjlab's GPU training stack.
It executes the upstream `ObsBuilder` class extracted with Python AST, composes
its official scene, runs the teacher locally, and saves native render screenshots,
frozen vectors, and seeded rollout results. It does not replace the physics model
with a hand-written approximation. The recorded `MjSpec` is serialized before
compilation; reset qpos/ctrl are exported separately because upstream fills its
keyframe after compilation.

## Source and publication

- `web/`: canonical runtime source, policy, compiled-scene XML, meshes, config,
  golden vectors, pinned MuJoCo runtime, licenses. Published byte-for-byte to
  `assets/interactive/dexterous-rl/` through `scripts/project-assets.json`.
- `tools/prepare.py`: regenerate the scene, state contract, native evaluations,
  meshes and golden vectors in `web/`.
- `checkpoints/released/`: **original `model.pt`**, `policy.onnx`, configuration,
  release identity and SHA-256 hashes. These research artifacts are not deployed.
- `checkpoints/reference-source/`: copies of the upstream task/config sources
  needed to audit or resume work, with exact revision in `provenance.json`.
- `results/`: native visual/collision views, raw native and browser regression
  results, Chrome viewport screenshots, dependency/environment evidence.
- `../../tests/dexterous-rl/`: browser integration regression page.
- `../../_pages/dexterous-rl.md`, `../../_layouts/dexterous-rl-fullscreen.html`:
  public route. Blog demo list lives in `_blogs/2025-12-28-AI-coding-agent-case-study.md`.

The original STL mesh topology and physics are retained. Only their renderer
materials and the cube's face artwork change. No rendered mesh decimation was
needed. Shared Three.js, ORT WASM, and fonts avoid duplicating large libraries.

## Exact control contract

Quaternions are **w,x,y,z** in world coordinates. The hand is fixed at the official
mount transform; the native evaluation actor consumes `R(q_cube * inverse(q_goal))`
flattened to its **last six row-major matrix elements**. The user error readout is
`2 acos(abs(dot(q_goal,q_cube)))` in degrees.

Five observation terms are concatenated **term first, then oldest-to-newest history**:

| Term                                                          | Per-frame dimension | History |
| ------------------------------------------------------------- | ------------------: | ------: |
| Joint positions normalized to 90% soft limits, clipped [-1,1] |                  20 |       3 |
| Normalized current minus previous filtered target             |                  20 |       3 |
| Cube position in wrist-tag frame                              |                   3 |       3 |
| Cube orientation error, 6D rotation representation            |                   6 |       3 |
| Previous raw actor action                                     |                  20 |       3 |

Total: **207 inputs → 20 outputs**. Initial history is backfilled with the first
frame. Joint/actuator order is exported explicitly in `web/config.json`.
The released ONNX contains its own learned observation processing; do not add an
extra normalizer. Golden vectors check the complete exported graph.

Control period 0.05 s; physics timestep 0.01 s, five steps per action. Clamp action
to [-1,1], multiply by 0.5, add the official grasp angles, clamp to soft limits,
then EMA with alpha 0.5. The first 0.4 simulated seconds use the official grasp.
The composed official evaluation scene's solver settings are preserved, including
its defaults; do not blindly copy the robot sub-spec options onto the parent scene.

The fixed policy clock is independent of requestAnimationFrame. Slow devices
slow simulation rather than increasing the physical timestep. Catch-up work is
bounded. Pausing or hiding the document stops advancing; reset discards pending
inference results using an epoch token. Rendering and physics remain local.

## Interactions

- Drag the large ghost cube to rotate the goal continuously; arrow keys also work.
  The hand continues operating while targets change. Pointer capture and
  `touch-action:none` prevent target dragging from scrolling the page.
- Random target uses a uniform unit quaternion (Shoemake sampling).
- Drag the scene background to orbit; wheel/pinch to zoom, through OrbitControls.
- Push applies a bounded instantaneous change in cube linear velocity
  (each axis ±0.06 m/s) and angular velocity (each axis ±1 rad/s), a physical
  impulse. Recovery is policy behavior, not an animated correction.
- Reset restores the official grasp and cube pose while retaining the current goal.
- Drop occurs at 0.15 m below initial cube height (z < 0.4099 m). Simulation stops
  with an explicit message until Reset; no silent teleports.
- Target reached requires error below 0.2 rad for five consecutive policy steps.
- The trace, error, inference latency, physics cost, render fps and simulation pace
  use actual runtime values. Timing rates shown as 20/100 Hz refer to sim time.

## Continue improving the model

Start with `checkpoints/released/model.pt`, its unmodified config and the pinned
upstream repository. Preserve the original files; put new runs in a new directory.
Wuji's training environment and GPU requirements are in its pinned `pixi.toml`,
`pixi.lock`, and training docs saved with the reference sources. The CPU Docker
image here reproduces evaluation and browser exports; it is not a GPU PPO trainer.

For fine-tuning, restore the upstream training environment on a supported GPU,
load the original checkpoint using its documented training/play workflow, and
record the exact task config, seed, source revision, environment and checkpoint
hashes for every run. The original .pt is retained intact; this project does not
claim that optimizer resume has been tested in the GPU trainer.

Before deploying a changed actor: native rollout evaluation → export with its
config/identity → regenerate golden vectors → browser parity → closed-loop
rollouts → desktop and mobile interaction checks. Replacing Hand 1 with Hand 2
requires a matching trained policy and model. If later distilling, retain teacher
rollouts and correction data; use behavior cloning/DAgger and label it honestly.
Current measured inference cost gives no reason to distill for this MVP.

See `VALIDATION.md` for results and limitations and `EXPERIMENTS.md` for decisions.
