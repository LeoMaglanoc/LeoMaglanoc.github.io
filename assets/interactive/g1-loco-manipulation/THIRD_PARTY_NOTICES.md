# Third-party notices

## OmniContact

Original research: **OmniContact: Chaining Meta-Skills via Contact Flow for
Generalizable Humanoid Loco-Manipulation**, Runyi Yu, Xiaoyi Lin and collaborators.

- [Released CPU runtime and policies](https://github.com/Ingrid789/OmniContact_sim2sim), revision `1cf9ddd4067cbe5710b1f475e96f9c69f88055e2`.
- [Browser reference implementation](https://github.com/OmniContact/omnicontact.github.io), revision `8daf3d331eff1952555f95b7c044049f61d0dd39`.
- [Training implementation](https://github.com/Ingrid789/OmniContact).

The sim2sim README advertises **CC BY-NC-SA 4.0**. The policy and robot assets
come from that release; this integration is noncommercial research demonstration.
Changes: standalone UI, shared renderer, reduced scene visualization (ghosts and
reference meshes removed), single-thread inference, asynchronous lifecycle,
physical perturbations, deterministic tests and native timestep configuration, native reference-course export and single-point
CCD configuration. Visual-only meshes are simplified to 2,500 faces; original
collision meshes and explicit inertias are retained.
Policy weights are unchanged. JavaScript planner, observation/history and action
mapping are adapted from the browser implementation and attributed to OmniContact.

No separate LICENSE file was found in the pinned sim2sim or browser repositories.
The browser code, model weights and Unitree robot meshes lack file-specific license
notices in those snapshots. The repository-level badge does not independently
resolve those permissions. Publication proceeds at the website owner's explicit
instruction; this notice does **not** claim a verified file-specific redistribution
grant. Preserve attribution and the stated noncommercial/share-alike restrictions.
See [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) for the
stated terms. Any separate owner permissions should be retained with this project.

## Shared site runtime

- MuJoCo 3.11.0, Google DeepMind — Apache-2.0. Reuses the site's
  `dexterous-rl/runtime` distribution and its Apache license.
- ONNX Runtime Web 1.23.2, Microsoft — MIT. Reuses the site's `language-vision`
  JavaScript modules and `euroguessr` WASM binary; license in
  `dexterous-rl/licenses/ORT-MIT.txt`.
- Three.js and OrbitControls — MIT, shared `mobile-sorting/vendor` distribution;
  license in `dexterous-rl/licenses/THREE-MIT.txt`.

The website implementation is an integration of pretrained research and performs
no new training, fine-tuning, distillation or policy substitution.
