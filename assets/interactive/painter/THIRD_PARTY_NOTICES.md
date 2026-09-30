# Third-party notices

## Franka Emika Panda model and meshes

`robots/panda/panda.xml` and meshes in `robots/panda/assets/` come from
[Google DeepMind MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie/tree/main/franka_emika_panda),
revision `4d038b3feae26ec82b46a4d586379114012a8ac7`.
The description derives from Franka Emika's public `franka_ros` description.
The Apache-2.0 license is retained in `robots/panda/LICENSE`.

Modification: a project-owned rigid marker body, barrel, nib, and `marker_tip`
site were inserted under the hand. Robot meshes, inertias, joints, limits,
actuators, and home keyframe are otherwise unchanged. `scene.xml` is project-owned.

## MuJoCo WebAssembly

This demo reuses the site's existing `../g1/vendor/mujoco.js` and `mujoco.wasm`,
the single-threaded build of Google DeepMind's `@mujoco/mujoco`, under Apache-2.0.
See [the existing notices](../g1/THIRD_PARTY_NOTICES.md) and the retained Apache-2.0
license above. The browser requires WebAssembly and WebGL, with no WebGPU dependency.

## Three.js

Three.js 0.179.1 and OrbitControls load from jsDelivr. Three.js is MIT licensed,
copyright 2010–2025 Three.js Authors. [License](https://github.com/mrdoob/three.js/blob/r179/LICENSE).
The renderer adapts this site's existing G1 renderer without modifying that demo.

## Behavioral reference

[Robot Drawing Repair](https://github.com/hiteshhedwig/robot-drawing-repair),
revision `724420a698fdff1f22c0f978d453a3836ace860d`, was studied as a behavioral
specification. Its implementation has no declared license; no Python source,
images, or other reference assets are copied or shipped here. Drawing, IK,
perception, execution, and repair are independently implemented in JavaScript.
