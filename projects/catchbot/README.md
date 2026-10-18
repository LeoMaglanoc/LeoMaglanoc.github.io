# CatchBot

A small static robot interception game at **https://leonardo-maglanoc.com/catchbot/**.
Drag the green target inside the circle. Evade the arm for 20 scored seconds.
Release to pause; re-grab the ring to resume after fresh warm-up. Select reactive
or predictive pursuit; a strategy change resets the round. No movement is sent
to a server. Save JSON and Compare trace are local, optional operations.

## What controls the arm

A kinematic planar 2R mechanism, **not a torque-controlled dynamics simulator**.
Two 0.46-world-unit links; continuous shoulder; positive-branch elbow limited to
[0, pi]. `src/robot.js` implements analytic IK, reachable-annulus projection and
FK. IK selects a nearby shoulder-angle representative to avoid wrapping jumps.
At 60 Hz, joint-space proportional velocity control uses Kp=6, clamped to 2.2
and 2.8 rad/s. Contact radius is 0.062 world units around the actual FK tip.
The target is bounded to a 0.87-unit disk; shoulder placement never changes.
All modes share exactly the same frozen `src/config.js` configuration.

`src/predictors.js` resamples at 30 Hz with causal zero-order hold. At time t,
only events at/before t-0.1 are eligible. The final grid sample is at/before that
cutoff; a forecast targets 0.3 s after that sample, approximately 0.167–0.2 s
beyond current time. This differs from both observation age and inference time.
64 samples are required. A fixed 2.4 s warm-up covers history acquisition; the
arm holds still and no time is scored. Warm-up waits for safe target separation
rather than catching instantly when history becomes available. Pauses invalidate
history and outstanding predictions, but do not reset robot pose or survival.
Re-grabs must begin near the ring, preventing teleport by releasing elsewhere.

- **Reactive:** persistence at the last legal sample, with the same timestamped
  interface and information delay as the predictive model.
- **Predictive:** constant velocity using a Theil–Sen estimate (median of the 21
  pairwise slopes among the last seven samples, a fixed 200 ms window). Advance
  by 300 ms; project only to the legitimate target disk.
- **Timestral:** official frozen offline experiment only. No live button, runtime
  weights, inference backend or pretend substitute.

Predictors return `{predictedPosition, generatedAt, sourceObservationTime,
targetTime, latencyMs, modelName}`. Promise-returning implementations are supported
by generation/request tickets. Late, reordered, wrong-model, nonfinite,
future-observation or expired responses cannot drive the arm. Failure causes a
recorded hold; never a prediction from another model under the wrong label.

Pointer Events use capture and one active pointer. Cancellation, lost capture,
blur and hidden tabs pause. A frame gap above 250 ms pauses instead of fast
forwarding. Resize only changes the camera scale. The fixed-step accumulator
keeps robot control independent of ordinary animation cadence.

## Files and publication

Canonical `index.html`, `style.css` and `src/*.js` are plain ES modules. They are
copied to `assets/interactive/catchbot/` through the root project asset manifest.
Edit source, then run the publisher; never fix generated copies directly.
`_pages/catchbot.md` and `_layouts/catchbot-fullscreen.html` expose the iframe.
The demos list in `_blogs/2025-12-28-AI-coding-agent-case-study.md` links to it.
`tests/` contains mathematical, causal-timing, lifecycle and real Chromium tests.
`experiments/` contains fixture preparation, official model inference, export
probes and shared-controller replay. `results/` holds saved raw evidence;
`validation/` holds browser measurements/screenshots and the verification log.

## Run and test

From the repository root:

```sh
docker run --rm -v "$PWD":/work -w /work node:22-bookworm-slim \
  node --test projects/catchbot/tests/*.test.js
python3 -m http.server 8765 --bind 0.0.0.0
# http://localhost:8765/projects/catchbot/
python3 projects/catchbot/tests/browser.py
python3 scripts/publish-project-assets.py
python3 scripts/publish-project-assets.py --check
```

Build reproducible Docker environments (the CA bundle is a public trust bundle,
not a credential; use your environment's corresponding path):

```sh
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt \
  -f projects/catchbot/Dockerfile.experiments -t catchbot-experiments:2026-10-18 projects/catchbot
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt \
  -f projects/catchbot/Dockerfile.browser -t catchbot-browser:2026-10-18 projects/catchbot
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt \
  -f projects/catchbot/Dockerfile.site -t catchbot-site:2026-10-18 .
docker run --rm -v "$PWD":/work catchbot-site:2026-10-18
docker run --rm -v "$PWD":/work catchbot-site:2026-10-18 python3 scripts/check-project-links.py
```

Browser container: serve the workspace at a reachable address and set
`CATCHBOT_URL`; the test accepts source or generated asset URLs. It launches real
headless Chromium, drives mouse/CDP touch input and checks all three viewport
sizes. This emulates a phone; it does not establish physical Android performance.
The managed environment has no Chrome computer agent or physical phone available.

## Reproduce and continue model experiments

See [CHECKPOINTS.md](CHECKPOINTS.md) for immutable revisions, hashes, cache
restoration, exact Docker commands, and next experiment boundaries. Read
[EVALUATION.md](EVALUATION.md) before interpreting results. No model is trained
or fine-tuned here, so there is no optimizer checkpoint to resume. Frozen weights
are restored from the pinned official checkpoint; raw predictions and marginal
quantiles are retained. Future experiments must use new output directories and
keep the original configuration and data provenance.

Human traces exported from the game contain resume boundaries, active simulation
timestamps and configuration. `traceSegments` separates uninterrupted segments;
`replay` compares each from identical initial conditions with a full warm-up.
Do not silently stitch pauses or call automated browser drags human data. Compare
trace is illustrative; a human would adapt differently to another controller.

## Sources inspected

- https://github.com/mistralai/timestral at `a534bdbd244d64f3d9d743f46c7bf6fc330ed4ff`
- https://huggingface.co/mistralai/Timestral-5M at `bdd20cfc15a3fea0e4cb5ccef37f8d3ca7aa335f`
- https://modernrobotics.northwestern.edu/nu-gm-book-resource/inverse-kinematics-of-open-chains/
- https://onnxruntime.ai/docs/tutorials/web/
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

The model source is Apache 2.0; official weights have a Modified MIT license.
Weights and ONNX Runtime are not shipped in the game. Quantile intervals are
coordinate-wise marginal intervals, not a calibrated joint 2D confidence region.
