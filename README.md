# Local development

```bash
docker compose pull
docker compose up

docker compose up jekyll
```

Open the site at:

```text
http://0.0.0.0:8080
```

# Leonardo Maglanoc — personal website

This repository contains Leonardo Maglanoc's personal website and working archive: robotics and AI projects, technical writing, publications, applications, experiments, and interactive browser demos.

The site is built with Jekyll and deployed as a static website. Most of the content is written in Markdown or stored as structured data; the interactive demos run client-side in the browser.

## What is here

- **Projects** — robotics, AI, software, and research project write-ups.
- **Writing** — blog posts, notes, news, and poetry.
- **Academic material** — CV, publications, bibliography, teaching, and profiles.
- **Interactive demos** — browser-based experiments including humanoid locomotion, SLAM, Pong, Flappy Bird, and other small simulations.

The public site is available at [LeoMaglanoc.github.io](https://leomaglanoc.github.io/).

## Repository structure

```text
_pages/                 Main website pages
_projects/              Project narratives
_blogs/                 Blog posts and technical writing
_news/                  News and announcements
_poetry/                Poetry
_bibliography/          Publication records
_data/                  Site and CV data
projects/               Source, tooling and documentation for all side projects
assets/interactive/     Published browser runtime files (generated)
assets/json/            Structured source material
assets/pdf/             PDF documents, including the CV
docs/                   Technical documentation
_layouts/               Page layouts
_includes/              Shared site components
_sass/                  Site styling
_plugins/               Jekyll plugins and build helpers
```

## Useful commands

Build the site once:

```bash
docker compose run --rm jekyll bundle exec jekyll build
```

Build, test, and serve the deployed SLAM route locally (uses only Docker
containers and mirrors the GitHub Pages publish layout):

```bash
./scripts/preview-slam.sh
```

Open [http://localhost:8080/slam/](http://localhost:8080/slam/). Use
`./scripts/preview-slam.sh --build-only` when you only need the generated
`_site/slam/` files. This preview owns port 8080, so stop `jekyll` first if it
is already running.

Run the G1 browser demo directly, without the Jekyll shell:

```bash
docker compose -f projects/g1/docker-compose.yml up g1-site
```

Open [http://localhost:8000/assets/interactive/g1/](http://localhost:8000/assets/interactive/g1/).

The G1 policy/model contract tests run in the reproducible tools container:

```bash
docker compose -f projects/g1/docker-compose.yml run --rm g1-tools \
  python -m unittest discover -s projects/g1/tests -p 'test_*.py'
```

The main site route for the G1 playground is [/g1/](https://leomaglanoc.github.io/g1/). It uses a fullscreen layout and embeds the static simulator from `projects/g1/`.

## Interactive demos

### EuroGuessr AI

The [/euroguessr/](https://leomaglanoc.github.io/euroguessr/) game offers five timed European street-view rounds against a small geolocation model running in an ONNX Runtime Web CPU worker. It compares a trained geographic classifier with visual retrieval, selects on spatial validation, and publishes measured test error. Human win rate has not been measured. See [`projects/euroguessr/README.md`](projects/euroguessr/README.md) for checkpoints, attribution, Chrome validation and overnight training.

### Endless mobile manipulation

The [/mobile-sorting/](https://leomaglanoc.github.io/mobile-sorting/) demo runs a
TIAGo mobile manipulator sorting randomized blue/red boxes into matching bins.
Analytic top-down grasps, Cartesian inverse kinematics, smooth arm references,
wheel-driven differential navigation and a recovery state machine execute in
MuJoCo WASM. The fingers retain objects through contact and friction; there is
no grasp attachment, learning, camera perception or backend. A fixed five-body
object pool supports continuous operation. All runtime assets are local.

Desktop and mobile layouts support orbit/pinch, pause, reset and fullscreen.
See [`projects/mobile-sorting/README.md`](projects/mobile-sorting/README.md)
for Docker commands, controller details, model modifications and validation.

### TinyDreamer CartPole

The [/tiny-dreamer/](https://leomaglanoc.github.io/tiny-dreamer/) demo uses a small
Dreamer-inspired agent to swing up and balance DeepMind Control Suite's native
CartPole. It learns from five state observations with no handcrafted controller
or imitation teacher. The actor and a recurrent world model run locally in the
browser alongside MuJoCo WASM physics.

**Algorithm.** CPU training in Docker alternates real experience collection and
neural imagination. Replay sequences train an encoder, recurrent state-space
model (RSSM), observation decoder, reward head, and continuation head using
reconstruction, prediction, and balanced KL losses. Posterior beliefs seed
imagined trajectories through the learned prior. An actor maximizes bootstrapped
lambda returns through the frozen world model; a critic learns their values.
The final stage uses 30-decision imagination. Validation selects the checkpoint,
and separate held-out episodes measure its performance before ONNX export.

**System pipeline:**

```text
Offline (Docker, CPU)
native MuJoCo experience → episode replay → encoder + RSSM + prediction heads
    → imagined actor rollouts → lambda returns → actor + critic updates
    → more real experience → validation / held-out evaluation
    → ONNX export + numerical parity → static model assets

Browser control (20 decisions per simulated second)
MuJoCo WASM observation + previous action + recurrent belief
    → posterior.onnx → corrected belief → actor.onnx → bounded motor action
    → 5 × 10 ms physics controls → next observation → repeat

Browser dream visualization (refreshed every 0.5 simulated seconds)
copied belief → actor.onnx + rssm.onnx prior → 15 decoded future observations
    → Canvas ghost poses up to 0.75 seconds ahead
```

Push buttons apply a separate physical force. The world model receives the
resulting observations and corrects its belief, making forecast divergence and
recovery visible. The dreams are neural predictions; the actor supplies control
directly without runtime planning. ONNX Runtime Web, physics, and rendering use
local static assets with no backend or runtime CDN dependency.

The trained agent succeeded on **20/20 held-out swing-up episodes**, with mean
return **753.19**, compared with **122.88** for random actions. Strong pushes can
break sustained balance. See [`projects/tiny-dreamer/README.md`](projects/tiny-dreamer/README.md)
for the detailed algorithm, training commands, contracts, validation, and limits.

### G1 locomotion playground

The G1 demo runs a Unitree G1 12-DoF locomotion stack in the browser:

```text
velocity command
      ↓
47-dimensional observation
      ↓
ONNX policy in ONNX Runtime Web
      ↓
12 leg actions
      ↓
PD controller
      ↓
MuJoCo WASM physics
```

It includes a flat walking area and an optional lightweight terrain course with uneven blocks, a shallow ramp, and low steps. Desktop keyboard controls and mobile touch controls are supported. See [`projects/g1/README.md`](projects/g1/README.md) for the runtime contract, model details, controls, and attribution.

### FPV drone racing

The [/drone-racing/](https://leomaglanoc.github.io/drone-racing/) demo flies an approximate 650 g FPV quad around a closed ten-gate circuit:

```text
periodic racing trajectory
      ↓
tracking MPC (25 Hz) → desired acceleration
      ↓
geometric flight controller (125 Hz) → thrust and torque
      ↓
motor mixer → first-order motor response
      ↓
MuJoCo WASM physics (250 Hz)
      ↓
Three.js rendering → chase / FPV view
```

Autopilot continuously wraps the reference trajectory without resetting the vehicle. Manual flight replaces MPC with assisted velocity commands and banked steering, using keyboard or dual touch sticks. Directional push buttons apply brief physical forces so the controller's deviation and recovery are visible. Ordered gate crossings track laps and best times; Race AI replays a looping recorded physics rollout. Everything runs locally in the browser with WebGL and no backend. The vehicle is an illustrative model, not a calibrated digital twin.

See [`projects/drone-racing/README.md`](projects/drone-racing/README.md) for parameters, controls, validation and limitations.

### Panda drawing & repair

The [/painter/](https://leomaglanoc.github.io/painter/) demo lets you draw ordered strokes, watch a Franka Panda reproduce them, then erase and repair its output:

```text
reference strokes → resampling → marker-tip IK → joint targets
      ↓
Panda actuators → MuJoCo WASM physics → actual marker-tip motion
      ↓
CURRENT ink raster + physical board texture
      ↓
erase ink → directional missing-stroke detection
      ↓
overlapping repair runs → nearest-endpoint ordering → IK → redraw
      ↓
observe again → complete or report stalled repair
```

CURRENT records actual simulated motion. Detection tolerates sideways tracking error while preserving gaps along a stroke. Manual repair and a two-second auto-repair countdown redraw missing regions; erasing during repair cancels the active plan and replans from the current robot pose. Pointer/touch controls, Canvas, Three.js, and MuJoCo run locally in the browser with no backend or WebGPU requirement.

See [`projects/painter/README.md`](projects/painter/README.md) for implementation details, validation, limitations, and attribution.

All demos are organized as self-contained projects under [`projects/`](projects/). Each demo's local README or Docker configuration is the source of truth for its own commands.

## Editing the site

For normal content changes:

1. Add or edit Markdown in the relevant content directory.
2. Keep dates, titles, roles, project details, and technical claims consistent with the structured source material.
3. Add or update assets under `assets/` when needed.
4. Build the site locally before pushing.

For browser demos, edit source, assets, tests, and documentation in `projects/<name>/`. Run `python3 scripts/publish-project-assets.py` before previewing or building the website. `assets/interactive/` and `assets/js/ask-leo/` contain generated runtime copies; keep their URLs stable.

## CI and deployment

GitHub Actions builds the Jekyll site, runs the repository's checks, and publishes the generated static site. The workflow definitions are in [`.github/workflows/`](.github/workflows/).

## Attribution

Third-party libraries and assets are documented in the relevant notices files, including [`projects/g1/THIRD_PARTY_NOTICES.md`](projects/g1/THIRD_PARTY_NOTICES.md). The repository also retains the project license in [`LICENSE`](LICENSE).

## Side-project development

All side-project source lives under `projects/`; `_projects/` contains the
website write-ups. See [projects/README.md](projects/README.md) for build and
publication details. Before a local Jekyll build or static preview, run:

```sh
python3 scripts/publish-project-assets.py
```

CI performs this step automatically. Godot exports remain checked in at their
existing public paths and are rebuilt using each game's `scripts/build_web.sh`.
SLAM is built separately from `projects/slam/web/` and published at `/slam/`.
LLM city guard is source-only and is excluded from the site.
