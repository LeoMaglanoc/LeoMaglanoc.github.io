# Third-party notices

The neural implementation in `training/` is original code based on the conceptual
Dreamer mechanism, not copied from a third-party Dreamer implementation.

## DeepMind Control Suite

`models/cartpole.xml` is the expanded native model from dm-control 1.0.43's
`cartpole/swingup`. It includes the task's common visual/material/skybox assets.
Copyright 2017 The dm_control Authors. Distributed under Apache License 2.0;
complete license in [licenses/dm-control.txt](licenses/dm-control.txt).
The exported XML is mechanically expanded by MuJoCo's `mj_saveLastXML`.
Source: https://github.com/google-deepmind/dm_control/tree/main/dm_control/suite

The native reward, observations and reset distribution are used through the
installed package. The browser's equivalent observation mapping and reset
sampling are documented in model metadata.

## MuJoCo

The browser imports the existing repository's `../g1/vendor/mujoco.js` and
`mujoco.wasm`, Google DeepMind's single-threaded MuJoCo WebAssembly distribution.
MuJoCo is licensed under Apache License 2.0; complete license in
[licenses/mujoco.txt](licenses/mujoco.txt). No G1 robot assets or policies are used.
Source: https://github.com/google-deepmind/mujoco/tree/main/wasm

## ONNX Runtime

ONNX Runtime Web is distributed under the MIT License, Copyright (c) Microsoft
Corporation. Complete license in [licenses/onnxruntime.txt](licenses/onnxruntime.txt).
Source: https://github.com/microsoft/onnxruntime

## Training and tests

PyTorch (BSD 3-Clause), NumPy (BSD 3-Clause), dm-env (Apache 2.0), and Playwright
(Apache 2.0) are installed only inside the reproduction/test environment.
See each installed distribution for its complete license and transitive notices.
