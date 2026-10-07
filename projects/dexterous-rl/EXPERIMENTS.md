# Experiments and decisions — 2026-10-07

1. Investigated `wuji-mjlab` and `wuji-description`. Used the latest release
   v2026.9.27 and its **Hand 1** checkpoint and matching meshes, rather than
   mixing the newer Hand 2 model with Hand 1 actions. Upstream tag:
   `26b99c6338641e8edc17caf87922e6e1767121fa`.
2. Retained the complete released PyTorch training checkpoint and ONNX actor.
   The actor is 1,110,724 bytes: direct reuse is sufficient. No distillation,
   training, heuristic controller, kinematic attachment, or prerecorded playback.
3. Native CPU MuJoCo evaluation in Docker uses official scene builder and
   observation/action code, without requiring mjlab's CUDA training stack.
   Rendered visual and collision groups independently for geometry inspection.
4. Initial exploratory native environment used MuJoCo 3.3.7 and the site's
   shared browser engine was 3.12.0. Frozen actor parity passed but a five-step
   physics regression differed by about 0.0209 in qpos. This was rejected.
5. Read upstream `pixi.lock`, selected MuJoCo **3.11.0** in both Docker and
   browser. Final one-control-step physics parity is within 3.1e-7. Regenerated
   all final native vectors and evaluations; earlier exploratory results are
   superseded. Other demos retain their own runtime.
6. Original detailed meshes render with silver technical materials; collision
   groups stay invisible. Cube faces use colored axis markers for legibility.
   Geometry, inertia, friction and actuators stay unchanged.
7. Browser policy uses shared ORT WASM. All ten golden observations/actions and
   12 native-seeded 14-second browser trials pass. This is smoke/regression
   evidence, not a statistically broad robustness or sim-to-real claim.
8. Browser rendering was throttled to about 1 fps in this computer-agent session
   despite low submission cost. Decoupled the fixed policy timer from rendering;
   documented actual-device frame-rate profiling as outstanding. Batch inference
   and physics benchmarks run independently of the compositor.
9. Added desktop, phone portrait, and phone landscape layouts; independent target
   drag/camera orbit surfaces; keyboard goal rotation; explicit drop/reset handling;
   pause, uniform random targets and physically meaningful perturbations.
10. Published through the existing project-assets manifest and Jekyll fullscreen
    route, with a new link at the top of the existing AI coding agent blog demo list.
    The full build exceeded the 1,000,000,000-byte Pages budget by about 12 MB.
    With user authorization, TinyEgoVLA assets were excluded from deployment,
    while retaining its archive route, source, media, and continuation checkpoints.
    Shared ORT and Three.js avoid further duplication.
