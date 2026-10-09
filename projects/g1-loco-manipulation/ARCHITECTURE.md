# Architecture audit

The shared `MujocoThreeRenderer` is reused unchanged for native geom conversion,
source normals, authored materials, camera orbit and resource disposal. The
renderer wrapper filters robot collision meshes, styles the floor and adds a goal
ring. No second rendering engine is introduced. Existing G1 controllers and
47-input/12-action observation code are not reused.

MuJoCo WASM 3.11.0 is loaded from Dexterous RL, matching the Docker native runtime.
ONNX Runtime Web 1.23.2 uses existing local site modules and WASM, one thread,
CPU only. Native ONNX Runtime is 1.23.0. Three.js/OrbitControls use the site's
shared distribution. No new browser dependencies are deployed.

OmniContact-specific modules retain the upstream JavaScript contact-flow planner,
quaternion math, 1,244-dimensional future-reference/history contract and 29-action
joint remapping. Physics scenes and robot meshes come from sim2sim; nonphysical
ghost/reference visualizations are removed. The native runner's actual 5 ms
physics override is preserved, rather than the XML's unused 2 ms setting.

Simulation awaits each 50 Hz policy inference, then integrates four 5 ms steps
with PD targets and actuator torque limits. Rendering has its own animation loop;
slow inference reduces wall-clock pace without skipping ticks. Reset/model
replacement waits for an in-flight update before disposing the view and replacing
state. Task switching creates only one MuJoCo model at a time.

Both scenes retain original collision geometry, inertias and friction.
Multi-point CCD is disabled in native and browser builds; single-point CCD avoids
a cross-build manifold discrepancy without disabling contacts. Carry uses a 2 kg box
and two physical support platforms. Push uses the original 8 kg main box body and four caster assemblies.
No box attachment, upright correction, push-axis clamp, automatic reset or
replanning is imported from the browser viewer. Input positions change only at
explicit task reset/start. Forces use MuJoCo's `xfrc_applied`.

Licensing: the sim2sim README advertises CC BY-NC-SA 4.0, while file-specific grants
for the viewer and robot assets are missing. See THIRD_PARTY_NOTICES.md for the
remaining uncertainty and the owner's publication instruction.

Three supported courses use native CFgen references generated offline, including
its FK/IK planner. These are desired contact trajectories, never rendered robot
states. Custom coordinates use the older browser planner and are experimental.
No reference replay overwrites the MuJoCo robot or box state.
