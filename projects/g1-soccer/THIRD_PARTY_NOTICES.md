# G1 Soccer Lab — sources and licenses

SoccerDribble's coach checkpoint, scene, and native environment come from
[Algorineko/starVLA-Soccer-demo](https://github.com/Algorineko/starVLA-Soccer-demo),
commit `983a95596cfa30508ac5158db70f1c593d580a2d`. The full upstream license,
including its attribution and commit-preservation language, is retained in
[licenses/SOCCER-LICENSE.txt](licenses/SOCCER-LICENSE.txt). Copyright StarVLA Team.
The JavaScript controller adapts the upstream observation, action, timing and
termination logic. No original training was performed for this website port.

Unitree G1 geometry and walking policy are BSD-3-Clause, copyright (c) 2016–2023
HangZhou YuShu TECHNOLOGY CO., LTD. (`licenses/UNITREE-BSD-3-Clause.txt`).
The documented walking file is absent from the pinned soccer repository;
we fetched the official `unitree_rl_gym` file at
`276801e46c5d433564f24658bac64f254b7d2d4b`, path
`deploy/pre_train/g1/motion.pt`, and verified that it is byte-identical to this
website's existing G1 checkpoint. All robot meshes likewise match the soccer
repository byte for byte. The port shares those existing assets without
changing them. See the source project's `provenance.json` for hashes.

MuJoCo's single-threaded WASM runtime is `@mujoco/mujoco` **3.10.0** from the
npm registry, licensed Apache-2.0 (`licenses/APACHE-2.0.txt`). Its version matches
the native reference's physics engine. Package metadata is retained in
`runtime/package.json`.

The demo reuses this website's shared MuJoCo/Three.js renderer, Three.js and
OrbitControls, and ONNX Runtime Web **1.23.2** CPU/WASM distribution. Three.js
and ONNX Runtime are MIT licensed; complete texts are in
`licenses/THREE-MIT.txt` and `licenses/ORT-MIT.txt`. Runtime paths are recorded
in the source manifest. These assets remain local to this website's origin.

The page identifies research sources and does not imply endorsement by any
upstream contributor or Unitree Robotics.
