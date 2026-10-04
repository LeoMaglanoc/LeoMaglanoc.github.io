# Third-party notices

## TIAGo model

`robots/tiago/upstream.xml`, the original robot description, and the derived
`tiago.xml` and STL meshes originate from Google DeepMind's
[MuJoCo Menagerie / PAL TIAGo](https://github.com/google-deepmind/mujoco_menagerie/tree/4d038b3feae26ec82b46a4d586379114012a8ac7/pal_tiago),
revision `4d038b3feae26ec82b46a4d586379114012a8ac7`. The model is derived upstream
from PAL Robotics' TIAGo URDF. Its Apache-2.0 license is preserved at
`robots/tiago/LICENSE`.

This project modifies the model: decimated visual meshes (at most 1,800 triangles
per asset), primitive collision geometry, fixed head and torso (torso extension
0.35 m), spherical low-friction caster supports, added finger pads and grasp site,
adjusted servos and a project-owned three-station scene. The original arm
kinematic chain, joint limits and link inertias are retained. Robot self-contact
is disabled by collision masks; environment and object contacts remain enabled.
This is an illustrative browser simulation, not a calibrated TIAGo digital twin.
The reproducible derivation is `tools/prepare_robot.py`.

## MuJoCo

`src/simulation.js` reuses the repository's local
`../g1/vendor/mujoco.js` and `mujoco.wasm`, the single-threaded browser build of
[Google DeepMind MuJoCo](https://github.com/google-deepmind/mujoco), reporting
version 3.12.0. Apache-2.0; see the shared G1 `THIRD_PARTY_NOTICES.md`. The full
Apache-2.0 terms are also preserved in `robots/tiago/LICENSE`. No additional WASM
runtime copy is required.

## Three.js

`vendor/three.core.js`, `three.module.js`, and `OrbitControls.js` are Three.js
0.179.1, Copyright 2010–2025 Three.js Authors, under the MIT license preserved in
`vendor/LICENSE`. OrbitControls is unmodified. All runtime modules are vendored
locally; there is no CDN dependency.

## Development dependencies

Docker tooling uses Playwright 1.57.0 (Apache-2.0), MuJoCo 3.3.7 (Apache-2.0),
trimesh 4.8.3 (MIT) and fast-simplification 0.1.12 (MIT). These are development
tools and are not loaded by the deployed page.
