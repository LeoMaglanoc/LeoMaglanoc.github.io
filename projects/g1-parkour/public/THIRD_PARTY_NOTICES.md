# Third-party notices and provenance

This is an adaptation of Perceptive Humanoid Parkour (PHP), not newly trained research.

| Component | Source / revision | Terms / notice |
| --- | --- | --- |
| Browser simulator, renderer and policy integration | php-parkour/php-parkour.github.io, 3898564255525f2a72dbbfb1d190b48a230435ab | Upstream mujoco_wasm/LICENSE is MIT; retained in licenses/browser-MIT.txt. Its package.json declares ISC inconsistently; the actual license text is retained. |
| Released student and depth backbone | amazon-far/php_parkour, student-assets-v1 | Research repository Apache-2.0, licenses/PHP-Apache-2.0.txt. Release publishes no separate model license; repository terms are the recorded basis, not an invented additional grant. Unchanged hashes in php-release/manifest.json. |
| Course mesh and component conversion | amazon-far/holosoma, 70a344f50de01a77ed3d5ff95127fbb95795c11b | Apache-2.0 and NOTICE retained in licenses/. Terrain source hash and all 13 components in scenes/php-release/terrain-manifest.json. |
| Unitree G1 XML and robot meshes | PHP browser release scene; derived Unitree assets | BSD-3-Clause notice from pinned Holosoma THIRD_PARTY_LICENSES retained in licenses/Unitree-BSD-3-Clause.txt. No Unitree endorsement is implied. |
| MuJoCo 3.3.8 WASM, mujoco-js 0.0.7 | Official MuJoCo bindings via upstream npm distribution | Apache-2.0 in licenses/MuJoCo-Apache-2.0.txt. The wrapper package has no separately supplied license file. |
| Three.js and OrbitControls / lil-gui bundled helpers | three, exact version in package-lock.json | MIT notice in licenses/three-LICENSE.txt. |
| ONNX Runtime Web and common | onnxruntime-web / onnxruntime-common, exact versions in lockfile | MIT notices in licenses/. JS and WASM from the same locked release. |

Modified files: main.js (presentation, loading, camera following, bounded catch-up scheduling), mujocoUtils.js (asset subset/path loading), groundVisual.js (visible floor only), DragStateManager.js (Shift-mouse gesture gating). The policy controller, observation contract, XML, collision meshes and model bytes are retained unchanged. Added UI, build scripts, tests and documentation are site integration work.

No research landing-page videos, unrelated robot scenes or textures are bundled. The visible floor and finish gate are excluded from the policy depth sensor. The finish gate has no collision, as upstream.

Audit limitation: the browser project's inherited MIT copyright is retained verbatim, although it does not individually name every later PHP contribution. No separate contributor or model-specific redistribution statement was found in the pinned browser tree or release description. Repository licenses and released asset notices are recorded above; this does not claim to resolve ownership beyond those published notices.

Sources: https://github.com/php-parkour/php-parkour.github.io · https://github.com/amazon-far/php_parkour · https://github.com/amazon-far/holosoma · https://github.com/unitreerobotics/unitree_ros · https://github.com/google-deepmind/mujoco
