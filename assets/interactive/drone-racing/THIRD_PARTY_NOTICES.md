# Third-party notices

## MuJoCo

The runtime imports the repository's existing `../g1/vendor/mujoco.js` and `mujoco.wasm`, the single-threaded Google DeepMind MuJoCo WASM build. Distributed under Apache-2.0: https://github.com/google-deepmind/mujoco. The complete license is retained in `licenses/MUJOCO-APACHE-2.0.txt`. No G1 robot meshes, policy, controller or renderer are copied into this demo.

## Three.js

`vendor/three.module.js` and `vendor/three.core.js` are Three.js 0.179.1 from the published npm package. The complete MIT license is retained as `vendor/LICENSE`: Copyright © 2010–2025 three.js authors. https://github.com/mrdoob/three.js

## Crazyflow (offline parameters and control reference)

Reference: https://github.com/learnsyslab/crazyflow/blob/main/crazyflow/control/mellinger/params.toml and https://learnsyslab.github.io/crazyflow/user-guide/control/mellinger/ (consulted September 30, 2026).

The mass (0.029 kg), rotor XY arm length (0.03253 m), per-motor thrust cap (0.12 N), quadratic RPM thrust fit and thrust-to-reaction-torque ratio are based on the `cf2x_L250` configuration. The rad/s coefficients are rounded conversions of the quadratic RPM fit, and the linear fit term is omitted. The cascaded geometric-control architecture is informed by Crazyflow's documented Mellinger controller, implemented independently in JavaScript with different gains, rotor order, quaternion conventions and simplified dynamics. No Crazyflow/JAX/CasADi code or models are bundled. Inertia, drag, course and drone geometry are independently specified. No UAVSimulator material is used.

Crazyflow is MIT licensed. Its complete notice is retained in `licenses/CRAZYFLOW-MIT.txt`.

The original JavaScript, MJCF geometry, course and trajectory generator are additions to this repository under its root MIT license. Playwright is a Docker development/test dependency (Apache-2.0), not a shipped browser runtime dependency.
