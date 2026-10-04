# Third-party notices

## MuJoCo

The runtime imports the repository's existing `../g1/vendor/mujoco.js` and `mujoco.wasm`, the single-threaded Google DeepMind MuJoCo WASM build. Distributed under Apache-2.0: https://github.com/google-deepmind/mujoco. The complete license is retained in `licenses/MUJOCO-APACHE-2.0.txt`. No G1 robot meshes, policy, controller or renderer are copied into this demo.

## Three.js

`vendor/three.module.js` and `vendor/three.core.js` are Three.js 0.179.1 from the published npm package. The complete MIT license is retained as `vendor/LICENSE`: Copyright © 2010–2025 three.js authors. https://github.com/mrdoob/three.js

## Crazyflow (offline parameters and control reference)

Reference: https://github.com/learnsyslab/crazyflow/blob/main/crazyflow/control/mellinger/params.toml and https://learnsyslab.github.io/crazyflow/user-guide/control/mellinger/ (consulted September 30, 2026).

V1 used Crazyflow-inspired Crazyflie parameters. V2 replaces those parameters with an independently specified approximate 650 g FPV quad. The cascaded geometric-control architecture remains informed by Crazyflow's documented Mellinger controller, independently implemented in JavaScript. No Crazyflow/JAX/CasADi code or models are bundled. No UAVSimulator material is used.

The V2 quad visual is original procedural Three.js geometry (frame, motors, battery, camera, antenna and props), with no third-party mesh or texture assets. Physics geometry, vehicle config, circuit and periodic generator are original repository additions under its root MIT license.

Crazyflow is MIT licensed. Its complete notice is retained in `licenses/CRAZYFLOW-MIT.txt`.

The original JavaScript, MJCF geometry, course and trajectory generator are additions to this repository under its root MIT license. Playwright is a Docker development/test dependency (Apache-2.0), not a shipped browser runtime dependency.
