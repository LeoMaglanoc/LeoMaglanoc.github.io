# Continuation checkpoints

There are **no ML models or training runs** in this project. No model weights,
optimizer state or training checkpoint can be saved for this game. Other demos'
models are untouched. The following are the actual reproducibility checkpoints:

1. `a26a2b4` — first engine/chamber integration: pinned vendored dependencies,
   portal transforms, real wall apertures, cube carry, touch input, six passing
   physics tests and the original chamber. This is a development checkpoint;
   use the later release for graphics/color and gameplay validation fixes.
2. The release commit that adds this file — Fast/Quality selection, plate
   collision, real-time timer, browser evidence and site/blog integration.
   Locate it with `git log -- projects/portal-puzzle-lab/CHECKPOINTS.md`.
3. `checkpoints/release.json` — SHA-256 of maintained source, vendored runtime,
   dependency lock, upstream revision and chamber contract. Regenerate with
   `node projects/portal-puzzle-lab/checkpoints/snapshot.js`. It is not a live
   savegame or an optimizer checkpoint.

To continue: start from the release commit on a new branch, run Docker tools,
then read README.md and VALIDATION.md. Edit `src/level.js` for chamber geometry;
keep physical statics and their visual wall definitions consistent. Never edit
published assets directly; run the repository publisher and Jekyll build.

After any portal/physics change run unit tests and the browser playthrough.
For rendering changes verify both profiles, portal perspective at oblique
angles, near-plane approach, and orientation changes on real hardware. Browser
software-rendered FPS is not an Android benchmark. The first improvement to
measure is real Galaxy S24 FE touch comfort and frame rate.

Possible extensions: rounded portal masks with matching collision aperture,
straddling-body visual clones, oblique near-plane clipping, broader floor/ceiling
portal support, instanced architectural trim and additional puzzles. Do not add
ML or a training pipeline merely to create model checkpoints.
