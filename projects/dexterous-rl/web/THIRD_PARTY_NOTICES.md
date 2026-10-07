# Dexterous RL — third-party notices

## Wuji Technology

The PPO actor, original PyTorch checkpoint, task model, collision geometry,
visual STL meshes, scene builder, observation and action contract come from
[wuji-technology/wuji-mjlab v2026.9.27](https://github.com/wuji-technology/wuji-mjlab/tree/v2026.9.27),
commit `26b99c6338641e8edc17caf87922e6e1767121fa`.
Copyright 2026 Wuji Technology Co., Ltd. Apache License 2.0.
See [license](licenses/WUJI-APACHE-2.0.txt), [source NOTICE](licenses/WUJI-NOTICE.txt),
and [release NOTICE](licenses/RELEASE-NOTICE.txt).

The corresponding hand design is [wuji-description](https://github.com/wuji-technology/wuji-description).
Its MIT license, copyright 2025 Wuji Technology, is also retained in
[WUJI-DESCRIPTION-MIT.txt](licenses/WUJI-DESCRIPTION-MIT.txt).
The meshes deployed here are the policy-compatible copies distributed by wuji-mjlab,
not a substitution with the newer Hand 2 model.

Modifications: composed standalone MJCF and canonical reset metadata; browser
observation/action implementation; browser integration; silver visual materials;
colored axis-labelled cube faces replacing ArUco textures in the Three.js view;
user-controlled target orientation; physical impulse controls; UI and diagnostics.
Original mesh topology, collision geometry, masses, actuators, and contact parameters
are retained. The original behavior was trained by Wuji; this demo does not claim
original PPO training or policy distillation.

## MuJoCo

The single-threaded `runtime/mujoco.js` and `runtime/mujoco.wasm` are from
[`@mujoco/mujoco` 3.11.0](https://www.npmjs.com/package/@mujoco/mujoco/v/3.11.0),
the official Google DeepMind browser package, matching the Wuji release lockfile.
Apache License 2.0, reproduced in [APACHE-2.0.txt](licenses/APACHE-2.0.txt).

## ONNX Runtime Web

[Microsoft ONNX Runtime](https://github.com/microsoft/onnxruntime), MIT.
The site's existing 1.23.2 single-thread WASM runtime is shared from
`../language-vision/vendor/` (JS) and `../euroguessr/vendor/` (WASM).
See [ORT-MIT.txt](licenses/ORT-MIT.txt).

## Three.js and fonts

[Three.js](https://github.com/mrdoob/three.js), MIT, copyright 2010–2025 Three.js authors;
shared from `../mobile-sorting/vendor/`. See [THREE-MIT.txt](licenses/THREE-MIT.txt).

DM Sans and Space Grotesk are shared locally from `../language-vision/vendor/fonts/`.
SIL Open Font License 1.1: [DM Sans](licenses/DM-SANS-OFL.txt),
[Space Grotesk](licenses/SPACE-GROTESK-OFL.txt).
