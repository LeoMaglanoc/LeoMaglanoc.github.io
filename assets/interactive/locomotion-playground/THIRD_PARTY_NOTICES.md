# Third-party notices

## Whole-body MPC and B2+Z1 description

The MPC formulation and robot URDF/SRDF come from [Lukas Molnar's wb-mpc-locoman](https://github.com/lukasmolnar/wb-mpc-locoman), revision `80e906d35d91783e85e1ef994023ca9082dc40c3`, under its MIT license. The B2 and Z1 descriptions originate from Unitree Robotics. This project converts upstream collision primitives, transforms and reduced-model inertias; it does not redistribute the visual mesh directories. The pinned upstream source and its license are retained in the Docker image.

MIT License

Copyright (c) 2025 Lukas Molnar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## CasADi, Fatrop, IPOPT, MUMPS and BLASFEO

The vendored browser runtime is the unmodified [@casadi/casadi-wasm 3.8.1](https://www.npmjs.com/package/@casadi/casadi-wasm) distribution, retaining its bundled license directory. CasADi is LGPL-3.0-or-later; Fatrop is dual licensed BSD-2-Clause/EPL-2.0; IPOPT uses EPL-2.0; MUMPS and BLASFEO have their own permissive licenses. All package notices, including runtime dependencies, are in [`mpc/vendor/casadi/licenses/`](mpc/vendor/casadi/licenses/). Package sources and build instructions are available from [CasADi](https://github.com/casadi/casadi/tree/3.8.1), [Fatrop](https://github.com/meco-group/fatrop), and [BLASFEO](https://github.com/giaf/blasfeo).

The JavaScript wrapper and dynamically loaded `.so` WASM side modules are kept separate and unmodified. Users may replace them with compatible builds. The symbolic MPC functions can be regenerated with the included Docker exporter; no closed-source dynamics implementation is required. The abandoned static generated-C experiment is reproducible from pinned upstream sources with the included build tooling; its static library is not shipped.

## Pinocchio

[Pinocchio](https://github.com/stack-of-tasks/pinocchio) (BSD 2-Clause) loads and reduces the native robot description, and creates the symbolic dynamics offline. The browser uses exported CasADi functions, not a Pinocchio binary.

BSD 2-Clause License

Copyright (c) 2014-2023, CNRS
Copyright (c) 2018-2024, INRIA
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


## Existing simulator and renderer

The G1 demo and MuJoCo browser runtime are reused without controller changes. Their [existing notices](../g1/THIRD_PARTY_NOTICES.md) cover Unitree G1 assets/policy (BSD 3-Clause), MuJoCo (Apache 2.0), Three.js (MIT), and ONNX Runtime Web (MIT). Three.js is loaded from a pinned jsDelivr URL.

Please cite the upstream paper when using the controller in research: Molnar et al., *Whole-Body Inverse Dynamics MPC for Legged Loco-Manipulation*, IEEE Robotics and Automation Letters 11(1), 898–905, DOI [10.1109/LRA.2025.3636005](https://doi.org/10.1109/LRA.2025.3636005).
