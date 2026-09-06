Yes. The cleanest architecture is: **make the AlvaAR demo its own standalone repo/app, then have the existing website’s GitHub Pages workflow assemble the final site by copying that app into `_site/slam/` after Jekyll finishes building.** GitHub Pages supports custom Actions workflows that build arbitrary static files and upload the resulting artifact, so Jekyll does not need to process or even understand the SLAM app. ([docs.github.com][1])

Also, for the MVP you **do not need to compile AlvaAR from C++ yourself**. The AlvaAR repo already ships a working mobile-camera example and a precompiled `alva_ar.js` WebAssembly/Emscripten bundle; its camera demo initializes AlvaAR, feeds webcam frames into `findCameraPose()`, and renders the resulting pose.   The shipped `alva_ar.js` asset is about 4.3 MB.

Give your coding agent this plan.

---

# Agent brief: standalone AlvaAR browser SLAM app

## Goal

Build a completely standalone mobile web application for monocular visual SLAM using AlvaAR.

Production URL:

```text
https://leonardo-maglanoc.com/slam/
```

The app must:

```text
run independently of Jekyll
run fully client-side
access the phone rear camera
run AlvaAR SLAM locally in the browser
show tracked visual features
show SLAM tracking status
show estimated 6-DoF camera trajectory / pose
work when deployed as /slam/ inside the existing GitHub Pages website
```

AlvaAR is a real-time browser visual-SLAM implementation compiled to WebAssembly; its provided examples already include a mobile camera version using Three.js.

---

# 1. Create a completely separate repository

Create:

```text
alvaar-web
```

This repo must have **no Jekyll dependency**.

Recommended structure:

```text
alvaar-web/
│
├── index.html
│
├── src/
│   ├── main.js
│   ├── camera.js
│   ├── slam.js
│   ├── visualization.js
│   └── ui.js
│
├── public/
│   └── alva/
│       ├── alva_ar.js
│       ├── view.js
│       └── any required runtime assets
│
├── styles/
│   └── main.css
│
├── LICENSES/
│   └── AlvaAR-LICENSE
│
└── README.md
```

For V1, reuse the compiled runtime from the upstream AlvaAR example rather than rebuilding the C++ stack. Upstream already ships `alva_ar.js`, utility code, visualization code, and the mobile camera example.

---

# 2. Start by reproducing the upstream camera demo

Do not redesign anything initially.

Get this exact pipeline working:

```text
phone camera
      ↓
HTMLVideoElement
      ↓
canvas
      ↓
getImageData()
      ↓
AlvaAR.findCameraPose(frame)
      ↓
camera pose
```

This mirrors AlvaAR's upstream implementation.

The original demo requests:

```text
facingMode: environment
aspect ratio: 16:9
ideal width: 1280
```

and processes SLAM at roughly 30 updates per second.

Do not optimize this initially.

### Acceptance criterion

Opening the app locally on a phone should:

```text
ask for camera permission
open rear camera
initialize AlvaAR
display tracked feature points
estimate camera pose
indicate tracking lost when tracking fails
```

These capabilities already exist in the original camera demo.

---

# 3. Keep all application paths relative

This is important.

Do not write:

```js
import x from "/assets/foo.js";
```

Prefer:

```js
import x from "./assets/foo.js";
```

or equivalent relative paths.

The upstream AlvaAR example already uses relative imports such as:

```text
./assets/alva_ar.js
./assets/view.js
./assets/utils.js
```

which is convenient for deploying the exact same app under a subdirectory such as `/slam/`.

Desired property:

```text
localhost:8080/
```

and

```text
leonardo-maglanoc.com/slam/
```

must run from the exact same production files.

---

# 4. Build a minimal mobile-first UI

After upstream parity works, replace the demo UI with:

```text
┌──────────────────────────────┐
│      VISUAL SLAM             │
│                              │
│          camera              │
│                              │
│     •   •      •             │
│        •   •                 │
│                              │
│ TRACKING ●                   │
│ FPS      27                  │
│ POINTS   184                 │
│                              │
│ [RESET MAP]                  │
└──────────────────────────────┘
```

Keep the camera nearly fullscreen.

Status:

```text
INITIALIZING
TRACKING
TRACKING LOST
```

Feature points:

```text
small dots over camera image
```

Provide:

```text
Reset SLAM
```

which calls:

```js
alva.reset()
```

The existing demo already resets the tracker via `alva.reset()`.

---

# 5. Add a useful SLAM visualization

The demo becomes much more interesting if it shows what SLAM is estimating rather than just AR overlays.

Create a small optional debug panel:

```text
CAMERA
───────

position
x   +0.34
y   -0.12
z   +1.83

rotation
roll   ...
pitch  ...
yaw    ...
```

Then create a Three.js world view:

```text
       trajectory

       ─────╮
            │
          camera
            △

   ·     ·
      ·
          ·
```

Two display modes:

```text
[ CAMERA ]
[ MAP ]
```

`CAMERA`:

```text
live camera + tracked features
```

`MAP`:

```text
3D coordinate frame
camera frustum
historical trajectory
```

AlvaAR's examples already use Three.js to apply the estimated camera pose to a 3D scene.

Do not attempt dense reconstruction.

---

# 6. Keep the application fully local

There should be:

```text
no backend
no API
no database
no uploads
no server-side inference
```

The camera frames should stay inside the browser application.

AlvaAR itself performs its visual-SLAM computation in-browser via WebAssembly.

Put a small note in the UI:

```text
Processing runs locally in your browser.
Camera frames are not uploaded.
```

Only make this claim if the final implementation contains no network code transmitting frames.

---

# 7. Camera permissions

The app must only request the camera after an explicit user gesture:

```text
[ START SLAM ]
```

Then call:

```js
navigator.mediaDevices.getUserMedia(...)
```

Browser camera access requires a secure context such as HTTPS or localhost and requires user permission. ([MDN Web Docs][2])

GitHub Pages serves the deployed site over HTTPS, so the production environment satisfies the secure-context requirement. ([MDN Web Docs][2])

Handle at least:

```text
camera unavailable
permission denied
unsupported browser
no rear-facing camera
SLAM initialization failure
```

Do not leave the user staring at a blank screen.

---

# 8. Do NOT embed this app inside a Jekyll page

The desired architecture is:

```text
leonardo-maglanoc.com
│
├── /
│   └── Jekyll portfolio
│
├── /g1/
│   └── standalone G1 app
│
└── /slam/
    └── standalone AlvaAR app
```

`/slam/index.html` should be the actual application entry point.

No:

```text
---
layout: default
---
```

No Liquid templates.

No Jekyll CSS.

No Jekyll JavaScript dependencies.

---

# 9. Keep source repositories separate

Recommended:

```text
repo 1
leonardo-maglanoc.com
└── Jekyll website

repo 2
alvaar-web
└── standalone SLAM application
```

Do **not** copy the source tree of `alvaar-web` into the Jekyll repo.

Instead, combine only their **production outputs during deployment**.

---

# 10. Change the website deployment pipeline

The website repository remains the repository that owns:

```text
leonardo-maglanoc.com
```

Configure GitHub Pages to deploy using **GitHub Actions**. GitHub's supported Pages flow is to build the desired site, upload a final Pages artifact, then deploy it with `actions/deploy-pages`. ([docs.github.com][1])

Conceptually the deployment becomes:

```text
GitHub Actions

        ┌─────────────────┐
        │ website repo    │
        │     Jekyll      │
        └────────┬────────┘
                 │
                 ↓
              _site/
                 │
                 │
        ┌────────┴────────┐
        │                 │
        ↓                 ↓

 checkout         checkout
 website          alvaar-web

     │                │
     ↓                ↓
Jekyll build       webapp build
     │                │
     ↓                ↓
   _site/            dist/
                       │
                       ↓
                 copy dist/
                       ↓
                 _site/slam/

                       ↓

                  final _site/

├── index.html
├── projects/
├── g1/
└── slam/
    ├── index.html
    └── assets/

                       ↓

             upload-pages-artifact

                       ↓

                 GitHub Pages
```

GitHub Pages explicitly supports custom workflows and arbitrary static-site generators or custom build processes. ([docs.github.com][1])

---

# 11. Implement the workflow roughly like this

The agent should adapt this to the existing website workflow rather than replacing working Jekyll configuration blindly:

```yaml
name: Build and deploy website

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout website
        uses: actions/checkout@v6

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Build Jekyll
        uses: actions/jekyll-build-pages@v1
        with:
          source: ./
          destination: ./_site

      - name: Checkout SLAM app
        uses: actions/checkout@v6
        with:
          repository: <OWNER>/alvaar-web
          path: external/alvaar-web

      - name: Build SLAM app
        working-directory: external/alvaar-web
        run: |
          npm ci
          npm run build

      - name: Install SLAM app into site
        run: |
          mkdir -p _site/slam
          cp -R external/alvaar-web/dist/* _site/slam/

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: ./_site

  deploy:
    runs-on: ubuntu-latest
    needs: build

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    permissions:
      pages: write
      id-token: write

    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

Those are the current documented Pages actions/major versions shown by GitHub's Pages documentation as of September 2026. ([docs.github.com][1])

If the AlvaAR app has **no build process**, replace:

```text
npm ci
npm run build
```

with simply copying its static production directory.

For V1, that is actually a perfectly reasonable approach because upstream AlvaAR already ships its runnable compiled browser assets.

---

# 12. Preferred V1: don't introduce Vite unless useful

I'd keep the first version extremely simple:

```text
alvaar-web/
├── index.html
├── assets/
│   ├── alva_ar.js
│   ├── view.js
│   ├── utils.js
│   └── ...
└── styles.css
```

Then deployment is literally:

```bash
mkdir -p _site/slam
cp -R external/alvaar-web/* _site/slam/
```

That is enough because GitHub Pages can serve arbitrary static HTML/JS files; Jekyll is not required for those files. ([docs.github.com][3])

If the project grows substantially, migrate the standalone app to Vite later.

---

# 13. License handling is mandatory

AlvaAR is GPLv3, and its README states that the upstream SLAM projects it derives from are also GPLv3; it additionally points to third-party dependency licenses.

Therefore the agent must:

```text
retain required copyright notices
include AlvaAR's GPLv3 license
preserve relevant dependency notices
document modifications
keep source availability/license obligations in mind
```

Do not strip license headers from copied upstream files.

---

# 14. Test on desktop first

Before phone testing:

```text
Chrome desktop
↓
webcam
↓
tracking
```

Acceptance:

```text
camera permission works
Alva initializes
features appear
pose updates
reset works
tracking loss/recovery works
```

The upstream project provides both a desktop video-input demo and mobile camera demo, so this follows the project's intended usage pattern.

---

# 15. Then test production on phone

Critical tests:

```text
https://leonardo-maglanoc.com/slam/

Android Chrome
iPhone Safari
```

Verify:

```text
[ ] page loads
[ ] Start button works
[ ] camera permission appears
[ ] rear camera selected
[ ] live image appears
[ ] AlvaAR initializes
[ ] features are tracked
[ ] pose updates
[ ] reset works
[ ] phone rotation doesn't break layout
[ ] app survives tracking loss
[ ] no assets 404
[ ] no absolute-path bugs
```

Camera access must be tested from the deployed HTTPS URL because browsers restrict `getUserMedia()` to secure contexts. ([MDN Web Docs][2])

---

# 16. Add basic performance telemetry

Display optionally:

```text
FPS
SLAM ms
tracked features
tracking status
```

The original AlvaAR example already measures video-processing, SLAM, and total frame times with its Stats utility.

On mobile, don't prioritize maximum resolution.

Expose internal presets:

```text
LOW
MEDIUM
HIGH
```

if necessary.

Start around the upstream configuration before tuning.

---

# 17. Definition of done for V1

```text
[ ] alvaar-web exists as an independent repository

[ ] it runs locally without Jekyll

[ ] app only contains static HTML/CSS/JS/WASM assets

[ ] rear phone camera works

[ ] AlvaAR visual SLAM runs locally

[ ] tracked feature points are visible

[ ] tracking state is visible

[ ] reset works

[ ] estimated camera pose is exposed

[ ] simple trajectory visualization works

[ ] production assets use relative URLs

[ ] existing Jekyll website still builds normally

[ ] deployment workflow checks out both repos

[ ] Jekyll output goes to _site/

[ ] SLAM app is copied into _site/slam/

[ ] one combined GitHub Pages artifact is deployed

[ ] https://leonardo-maglanoc.com/slam/ works directly

[ ] refreshing /slam/ works

[ ] camera permission works on production HTTPS

[ ] Android Chrome tested

[ ] iOS Safari tested or known limitations documented

[ ] AlvaAR GPLv3 attribution/license preserved

[ ] no camera frames are transmitted off-device
    unless explicitly implemented and documented
```

---

## After V1

I would deliberately leave a clean interface such as:

```js
class PoseProvider {
    update(frame) {}
    getPose() {}
}
```

with:

```text
AlvaPoseProvider
```

behind it.

Then later you can add:

```text
phone IMU
   ↓
timestamped sensor buffer
   ↓
future visual-inertial backend
```

without rewriting the UI.

AlvaAR itself currently lists visual+IMU fusion as a roadmap item rather than a completed feature, so **V1 should explicitly be called monocular visual SLAM, not visual-inertial SLAM**.

The most important instruction for the agent is essentially:

> **Do not integrate AlvaAR into Jekyll. Build `/slam/` as an independent static application and make GitHub Actions compose the Jekyll site and SLAM app only at deployment time.**

That gives you the separation you want:

```text
Jekyll = portfolio
G1     = web app
SLAM   = web app

GitHub Pages = host for all three
```

and lets you hand `alvaar-web` to an agent as an ordinary browser project without exposing it to the rest of your website stack.

[1]: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages?utm_source=chatgpt.com "Using custom workflows with GitHub Pages - GitHub Docs"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia?utm_source=chatgpt.com "MediaDevices: getUserMedia() method - Web APIs | MDN"
[3]: https://docs.github.com/en/enterprise-cloud%40latest/pages/getting-started-with-github-pages/creating-a-github-pages-site?utm_source=chatgpt.com "Creating a GitHub Pages site - GitHub Enterprise Cloud Docs"


Yes — I would **definitely add mapping**. It changes the project from “camera pose demo” into something that actually looks and feels like a SLAM system.

The target should be a **live sparse 3D map + camera trajectory**, not a dense reconstruction. AlvaAR internally stores keyframes, 3D `MapPoint`s, and a `pointCloud_`; each initialized `MapPoint` contains a 3D world position.

I’d add the following section to the agent plan.

---

# Additional feature: live SLAM map + trajectory

## Goal

Add a second visualization mode that shows the map being constructed in real time:

```text
CAMERA VIEW                         MAP VIEW

┌──────────────────────┐          ┌──────────────────────┐
│  live camera         │          │        ·    ·        │
│                      │          │   ·              ·   │
│   •   •      •       │          │      ·   ·           │
│      •   •           │          │                      │
│          •           │          │   ───────╮           │
│                      │          │          ╰───△        │
│ TRACKING             │          │              camera  │
└──────────────────────┘          └──────────────────────┘

                               dots = sparse map points
                               line = camera trajectory
                               △ = current camera pose
```

Provide:

```text
[ CAMERA ] [ 3D MAP ]
```

and optionally later:

```text
[ SPLIT VIEW ]
```

---

# Phase A — trajectory visualization first

This does **not require modifying AlvaAR's WASM code**.

Every successful:

```js
const pose = alva.findCameraPose(frame);
```

already gives the estimated camera pose. AlvaAR's existing camera demo passes this pose into its Three.js visualization.

Whenever tracking succeeds:

```text
camera pose
    ↓
extract camera translation
    ↓
append point to trajectory buffer
    ↓
Three.js Line
```

Do not add one point every rendering frame indefinitely.

Use something like:

```js
if (
    distance(currentPosition, lastPosition) > DISTANCE_THRESHOLD ||
    timeSinceLastSample > TIME_THRESHOLD
) {
    trajectory.push(currentPosition);
}
```

Then render:

```text
THREE.Line
```

through the accumulated positions.

### Show

```text
world origin
camera frustum
XYZ axes
historical trajectory
```

Suggested map:

```text
             Z

             ↑

        ·         ·
             ·

       ───╮
          ╰────╮
               └──△

               camera

 X ←────────────────────→
```

### Acceptance criterion

Walk around with the phone and see the estimated path grow live.

```text
[ ] trajectory starts at origin
[ ] current camera moves correctly
[ ] trajectory persists while tracking succeeds
[ ] tracking loss does not append garbage points
[ ] reset clears trajectory
```

---

# Phase B — expose AlvaAR's actual sparse map

This requires a small modification to the AlvaAR C++ → WASM API.

Currently the Emscripten API exposes:

```text
configure
reset
findCameraPoseWithIMU
findCameraPose
findPlane
getFramePoints
```

but **not the global 3D map**.

`getFramePoints()` is not enough: those are the tracked features in the current image, whereas what we want is the persistent triangulated 3D landmark map.

Internally, however, `MapManager` already has:

```cpp
std::unordered_map<int, std::shared_ptr<Frame>> mapKeyframes_;
std::unordered_map<int, std::shared_ptr<MapPoint>> mapMapPoints_;

std::vector<Point3D> pointCloud_;
```

and also provides `getCurrentFrameMapPoints()`.

So expose it.

---

# Phase C — add `getMapPoints()` to AlvaAR

Modify:

```text
src/slam/src/system.hpp
src/slam/src/system.cpp
src/slam/src/embind.cpp
```

Add a public API conceptually like:

```cpp
int getMapPoints(int pointsPtr, int maxPoints);
```

The implementation should iterate through:

```cpp
mapManager_->mapMapPoints_
```

and only export points satisfying:

```cpp
mapPoint != nullptr
mapPoint->is3d_
!mapPoint->isBad()
```

Each `MapPoint` has its world-space position stored as an `Eigen::Vector3d`.

Output a flat float buffer:

```text
x0 y0 z0
x1 y1 z1
x2 y2 z2
...
```

or optionally:

```text
x y z r g b
```

because AlvaAR's internal `Point3D` representation already contains XYZ and RGB fields.

Add to `embind.cpp`:

```cpp
.function("getMapPoints", &System::getMapPoints)
```

The existing Emscripten binding follows exactly this pattern for its other `System` methods.

---

# Phase D — rebuild AlvaAR WASM

Only at this point should the agent set up the upstream AlvaAR build environment.

AlvaAR documents an Emscripten-based build process for both its dependencies and the SLAM library.

Produce the modified browser runtime and keep it inside:

```text
alvaar-web/
└── public/
    └── alva/
        └── alva_ar.js
```

Document clearly in the repo:

```text
Modified AlvaAR WASM build:
- added getMapPoints()
- no SLAM algorithm changes
```

This distinction is useful because debugging a wrapper addition is much easier than debugging altered SLAM internals.

---

# Phase E — JavaScript map API

Wrap the raw WASM interface.

Do **not** let UI code manipulate Emscripten heap pointers directly.

Expose something clean like:

```js
class AlvaSlam {
    async initialize(width, height) {}

    processFrame(imageData) {}

    getPose() {}

    getTrackedFramePoints() {}

    getMapPoints() {}

    reset() {}
}
```

So the application layer receives:

```js
[
    { x: ..., y: ..., z: ... },
    { x: ..., y: ..., z: ... },
    ...
]
```

or preferably one packed `Float32Array` for efficiency.

---

# Phase F — render the sparse map with Three.js

Use:

```text
THREE.BufferGeometry
+
THREE.Points
```

instead of creating one Three.js object per landmark.

Architecture:

```text
AlvaAR WASM
     │
     ├──────── pose ───────────▶ camera frustum
     │
     └──────── map XYZ ────────▶ point cloud
                                      │
pose history ───────────────────────▶ trajectory
```

The map view becomes:

```text
             •
     •               •

          •     •
   •                    •

          trajectory
        ─────╮
             ╰────╮
                  ╰──△
                      current camera
```

Update the camera trajectory as frequently as pose tracking runs.

Update the **whole map more slowly**, for example a few times per second rather than every camera frame. The map changes much less frequently than the tracking pose, so there is little reason to continuously copy the complete landmark buffer across the WASM/JS boundary.

---

# Phase G — distinguish tracked vs persistent map points

If easy to expose, make the map slightly more informative.

Conceptually distinguish:

```text
persistent 3D landmarks
currently observed landmarks
```

AlvaAR's `MapPoint` structure already keeps an `isObserved_` flag as well as its initialized-3D flag.

The exported representation could therefore become:

```text
x y z state
```

where:

```text
state = persistent
state = currently observed
```

Then the map view can visually distinguish points currently contributing to tracking.

Not required for V1.

---

# Phase H — optionally show keyframes

This would make the visualization *really* look like SLAM.

AlvaAR maintains a persistent map of keyframes in:

```cpp
mapKeyframes_
```

and its map manager tracks both map-point and keyframe counts.

Later expose:

```js
alva.getKeyframes()
```

with each keyframe's pose.

Render them as tiny camera frustums:

```text
          ·          ·

         ▷
                 ▷

      ▷

              ─────────△
                       live camera
```

Then the user can literally see:

```text
sparse landmarks
+
keyframes
+
live camera
+
trajectory
```

That's basically the canonical visualization of feature-based SLAM.

I would make keyframes **V2**, not a prerequisite.

---

# UI I'd aim for

On the phone:

```text
┌─────────────────────────────┐
│  MONOCULAR SLAM             │
│                             │
│       live camera           │
│                             │
│   ·   ·      ·     ·        │
│      ·    ·                 │
│                             │
│  ● TRACKING                 │
│  Features       183         │
│  Map points     742         │
│  FPS             26         │
│                             │
│ [ CAMERA ] [ MAP ]          │
│                             │
│ [ RESET ]                   │
└─────────────────────────────┘
```

Map:

```text
┌─────────────────────────────┐
│         3D SLAM MAP         │
│                             │
│     ·       ·     ·         │
│  ·      ·              ·    │
│        ·  ·                 │
│                             │
│       ╭────────╮            │
│       │        ╰────△       │
│       │             ↑       │
│      start        phone     │
│                             │
│ Map points    742           │
│ Path          4.8 units     │
│                             │
│ [ CAMERA ] [ MAP ]          │
└─────────────────────────────┘
```

Three.js orbit controls can allow:

```text
one finger drag → rotate map
pinch           → zoom
```

so while SLAM is running you can rotate the reconstructed sparse world.

That would be quite cool on a phone.

---

## Important: call it a **sparse map**

Don't imply you're reconstructing surfaces like this:

```text
wall █████████
desk █████
floor █████████
```

This AlvaAR architecture is feature-based SLAM and internally maintains sparse triangulated map landmarks.

The expected output is more like:

```text
wall

·     ·    ·
    ·          ·
 ·       ·
          ·


table

       ·  ·
    ·       ·
```

That is still absolutely a map in the SLAM sense.

---

## Also: don't display meters yet

One important caveat for the UI:

AlvaAR V1 is **monocular**.

A purely monocular SLAM reconstruction has an unknown global metric scale unless some additional metric information is introduced. ([arXiv][1])

So don't display:

```text
Distance traveled: 4.83 m
```

yet.

Display:

```text
Path length: 4.83 map units
```

or don't show distance at all.

The shape of:

```text
trajectory
+
map
```

is meaningful, but its absolute scale is not metric.

If/when we get proper phone-IMU fusion working, **metric-scale estimation** becomes one of the interesting next goals; visual-inertial approaches can use inertial measurements to resolve the monocular scale ambiguity. ([arXiv][2])

---

# Revised project architecture

I'd now make the project explicitly:

```text
                     PHONE CAMERA
                          │
                          ▼
                    camera frame
                          │
                          ▼
                   AlvaAR WASM
                  Visual SLAM
                     │      │
              ┌──────┘      └────────┐
              ▼                      ▼
         camera pose             sparse map
             SE(3)                 XYZ points
              │                      │
              │                      │
              ▼                      ▼
       trajectory buffer      THREE.Points
              │                      │
              └──────────┬───────────┘
                         ▼
                    Three.js map
                         │
             ┌───────────┴──────────┐
             ▼                      ▼
        camera view             3D map view
```

## Revised order for the agent

I would change the implementation sequence to:

1. **Get upstream AlvaAR mobile camera tracking working.**
2. **Build standalone `/slam/` deployment.**
3. **Record camera trajectory from the existing pose output.**
4. **Build Three.js map viewer showing trajectory + live camera frustum.**
5. **Fork/rebuild AlvaAR and expose `getMapPoints()`.**
6. **Render the actual sparse landmark cloud.**
7. Add map-point count/tracking stats.
8. Optionally expose and visualize keyframes.
9. Later investigate IMU fusion / metric scale.

This is safer than making the C++/WASM modification block the whole project.

And I'd actually raise my opinion of the project with this addition. **Phone camera → real-time WebAssembly SLAM → live sparse 3D reconstruction + trajectory, entirely inside a webpage** is a much stronger robotics demo than just overlaying tracked features.

[1]: https://arxiv.org/abs/2202.04816?utm_source=chatgpt.com "Scale Estimation with Dual Quadrics for Monocular Object SLAM"
[2]: https://arxiv.org/abs/1707.07518?utm_source=chatgpt.com "A Loosely-Coupled Approach for Metric Scale Estimation in Monocular Vision-Inertial Systems"


Yes. And I found a very good benchmark for exactly this.

Use **TUM RGB-D `freiburg1_room`** as the main regression video. TUM describes it as a trajectory around an office that returns to the starting area and explicitly says it is suited for evaluating SLAM loop closure; it is only about **49 seconds**, which is convenient for automated tests. ([webshare.cvg.cit.tum.de][1])

Then use **`freiburg2_large_with_loop`** as the harder stress test. It runs about **173 seconds** and ends with significant visual overlap with the beginning; published evaluations note that it also contains a difficult low-texture section that can cause tracking loss before the later loop closure. ([webshare.cvg.cit.tum.de][1])

There is, however, one important thing I discovered about **AlvaAR itself**: although its repository includes the iBoW-LCD loop-closure library, searches through AlvaAR's actual SLAM source do not show `LCDetector` being instantiated outside the bundled iBoW-LCD example/library.   In other words, **I would not assume AlvaAR's current browser pipeline actually performs loop closure**. The benchmark is therefore especially useful: it can tell us empirically whether the trajectory gets globally corrected or merely drifts back near the origin.

### Add this to the agent plan

Have the agent create:

```text
test-data/
├── tum-fr1-room/
│   ├── source/
│   ├── fr1_room.mp4
│   └── README.md
│
└── tum-fr2-large-loop/
    ├── source/
    ├── fr2_large_with_loop.mp4
    └── README.md
```

Download the **official TUM RGB-D sequence**, not a YouTube recording. The TUM dataset provides the RGB stream, individual RGB frames, timestamps, calibration information, and ground-truth trajectory data. ([Computer Vision Group][2])

For the first test:

```bash
curl -L \
  https://cvg.cit.tum.de/rgbd/dataset/freiburg1/rgbd_dataset_freiburg1_room.tgz \
  -o fr1_room.tgz

tar -xzf fr1_room.tgz
```

That download URL is also used by recent open-source SLAM projects for reproducing tests on this sequence. ([GitHub][3])

Then build an MP4 from the RGB frames. I would have the agent generate an ordered frame list from `rgb.txt` rather than relying blindly on filesystem ordering:

```python
from pathlib import Path
import shutil

root = Path("rgbd_dataset_freiburg1_room")
out = Path("frames")
out.mkdir(exist_ok=True)

lines = [
    x.strip()
    for x in (root / "rgb.txt").read_text().splitlines()
    if x.strip() and not x.startswith("#")
]

for i, line in enumerate(lines):
    _, filename = line.split()
    shutil.copy(root / filename, out / f"{i:06d}.png")
```

Then:

```bash
ffmpeg \
  -framerate 30 \
  -i frames/%06d.png \
  -c:v libx264 \
  -crf 18 \
  -pix_fmt yuv420p \
  fr1_room.mp4
```

TUM RGB-D's image streams were recorded at roughly 30 fps, so 30 fps is a sensible browser-test encoding for this dataset. ([PubMed Central (PMC)][4])

### Better still: test both MP4 and raw frames

I'd actually make your `/slam/` app support:

```text
LIVE CAMERA
    ↓
AlvaAR

VIDEO FILE
    ↓
AlvaAR

IMAGE SEQUENCE  ← dev/test only
    ↓
AlvaAR
```

That gives the agent deterministic testing.

The automated test can feed:

```text
rgb/1305031907....png
rgb/1305031907....png
rgb/1305031907....png
...
```

directly into:

```js
alva.findCameraPose(frame)
```

using the ordering from `rgb.txt`.

Then the MP4 exists mostly for:

```text
/slam/?demo=fr1-room
```

or a developer button:

```text
[ RUN LOOP-CLOSURE DEMO ]
```

This is useful because the browser video path then tests exactly the same API your public demo uses, while the raw-frame mode provides a reproducible algorithm-level regression test.

---

## What should the test actually check?

For `fr1_room`, log the entire estimated camera trajectory:

```text
frame
timestamp
tracking state
x y z
qx qy qz qw
number of map points
```

Then output:

```text
Initial pose          ✓
SLAM initialized      ✓
Frames tracked        1263 / 1470
Tracking losses       3

Trajectory:
start     ●────────────╮
                      │
                      │
                      │
              ╭───────╯
              │
              ● end

Loop revisit detected?      ?
Global map corrected?       ?
```

I would **not initially make “loop closed” a pass/fail criterion**, because we first need to establish whether this AlvaAR fork actually has an integrated loop-closure backend.

Instead define the first regression test as:

```text
PASS if:
✓ initializes
✓ tracks a substantial portion of sequence
✓ builds sparse 3D map
✓ produces trajectory
✓ survives full sequence without crashing
✓ reset + replay is deterministic enough
```

Then instrument whether a loop closure occurs.

---

## And I'd expose loop closure explicitly if it exists

While you're modifying AlvaAR to expose:

```cpp
getMapPoints()
```

I'd have the agent investigate whether its map pipeline actually invokes iBoW-LCD.

If loop closure is active, expose something like:

```js
slam.getLastLoopClosure()
```

returning:

```text
{
    detected: true,
    currentKeyframe: 143,
    matchedKeyframe: 4
}
```

Then your map UI can literally flash:

```text
       LOOP CLOSURE DETECTED

         old map
       · · · · ·
     ·           ·
     ·           ·
     ●───────────△
     start      current
          ↓
     pose-graph correction
          ↓
      aligned map
```

That would be **extremely cool**.

But based on the source I inspected, I think there is a real possibility that AlvaAR bundles the loop-closure dependency without wiring it into its current simplified WebAssembly SLAM pipeline.

So I'd give your agent this explicit task:

> **Before implementing loop-closure visualization, run TUM `freiburg1_room` and inspect AlvaAR's native C++ pipeline to determine whether iBoW-LCD is actually invoked. Do not infer loop-closure support merely because the dependency exists.**

That experiment may actually uncover the most interesting next step for the project: **adding proper loop closure to AlvaAR's WASM SLAM implementation.**

Official TUM dataset/download page: [TUM RGB-D benchmark sequences](https://cvg.cit.tum.de/data/datasets/rgbd-dataset/download?utm_source=chatgpt.com).

[1]: https://webshare.cvg.cit.tum.de/g/rgbd/dataset/ "webshare.cvg.cit.tum.de"
[2]: https://cvg.cit.tum.de/data/datasets/rgbd-dataset/download?utm_source=chatgpt.com "Computer Vision Group - Dataset Download"
[3]: https://github.com/raahimnawaz/monocular-vo?utm_source=chatgpt.com "GitHub - raahimnawaz/monocular-vo: Monocular visual odometry with metric scale from Depth Anything v2: calibrated webcam capture, PnP, real-world trajectory. · GitHub"
[4]: https://pmc.ncbi.nlm.nih.gov/articles/PMC5922523/?utm_source=chatgpt.com "SLAMM: Visual monocular SLAM with continuous mapping using multiple maps - PMC"
