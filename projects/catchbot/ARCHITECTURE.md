# CatchBot architecture and feasibility — 2026-10-18

## Before implementation

Inspected the current root README, empty root plan.md, _config.yml, _pages,
fullscreen layouts, projects/pong, projects/rustzero, tiny-ego-vla validation,
asset publisher, manifest, route checker and deployment workflow. Canonical
plain-JS files are explicitly copied to assets/interactive; Jekyll wraps an
iframe in a dedicated fullscreen layout. Keep that pattern and add /catchbot/.
Do not replace the existing root plan or unrelated demos.

## Smallest playable system

Canvas 2D, ES modules, no build step or runtime dependencies. A circular workspace
in normalized coordinates fits portrait and landscape without changing physics.
Equal 0.46-unit links, continuous shoulder rotation, elbow limited to [0, pi],
one fixed elbow branch. The target occupies the same reachable disk, inset at
the outer boundary. Actual FK determines captures; IK only supplies joint targets.
A bounded 60 Hz accumulator advances game time only while dragging; interruptions
pause, clear observation history and require a fresh warm-up before scoring.

## Interfaces

Observations: {t,x,y} in active simulation seconds; timestamps map pointer events
to the active simulation clock, queueing them until their fixed step. Causal zero-order hold resampling at 30 Hz uses
no event after each sample time, and no event after the delayed cutoff. Missing
initial history is NOT filled with future data. All predictors need 64 samples.

predict(history, observationTime, horizon, generatedAt) returns (or resolves to)
{predictedPosition,generatedAt,sourceObservationTime,targetTime,latencyMs,modelName}.
History ends at floor((t-0.1)*30)/30; targetTime = observationTime + 0.3.
Predictions update at 10 Hz. A generation/request gate rejects reordered,
reset-era, nonfinite or expired asynchronous responses. An expired forecast
causes a recorded hold, not a mislabeled substitute model.

Shared controller: prediction -> reachable projection -> analytic 2R IK ->
velocity-limited joint P servo -> FK collision. No torque/dynamics claim.
Rendering never alters robot parameters or scoring.

## Timestral gate

Upstream code a534bdbd244d64f3d9d743f46c7bf6fc330ed4ff inspected before coding.
Official forecaster consumes [1,2,64], returns [1,2,9,21] quantiles and [1,2,9]
median. Default symmetric averaging, nonnegative clipping and normalization are
part of the reference and must be retained for parity. The model is about 21 MB
fp32; CPU PyTorch support alone says nothing about ONNX export, WASM operators,
peak memory or Android latency. Use official CPU inference offline first. Export
fixed-shape full reference preprocessing/postprocessing if possible. Do not ship
a live Timestral button unless reference parity AND Worker/browser performance
AND physical Android gate pass. No physical device is currently exposed.

## Risks and checks

- Timing leakage: irregular/reordered/duplicate fixtures and cutoff assertions.
- Joint singularities/wrapping: FK/IK round trips, origin, outer boundary and speed tests.
- Gesture/clock exploits: capture, cancellation, release, visibility, suspension,
  resizing, repeated resets and warm-up tests in Chromium.
- Forecast != interception: separate horizon error from identical-robot replay;
  fixed configuration, algorithm vs measured-latency deployment protocols.
- Model export: save exact errors and parity results; no approximate fake model.
- Synthetic relevance: results remain preliminary until independent human traces
  exist. Opt-in local JSON export; no server telemetry.
- Publication: publisher consistency, real Jekyll build/route checker and live route.

## Checkpoints

Commit architecture before implementation; commit playable baselines/tests; save
source/checkpoint revisions, locked environment, raw predictions/timestamps,
fixture data, timings and exported experiment configuration. No fine-tuning or
optimizer state exists; official frozen weights can be restored by revision/hash.
