# Objective

Take the existing `LeoMaglanoc/phone-slam` repository and bring it from a promising prototype to a **verified end-to-end offline RGB-D SLAM and 3D reconstruction system**.

Do not redesign or rewrite the project unless necessary.

Preserve the existing high-level architecture:

```text
Data source
   │
   ├── TUM RGB-D benchmark
   │
   └── S24 FE / ARCore
   │
   ▼
normalized dataset abstraction
   │
   ├── RGB
   ├── depth
   ├── poses
   ├── timestamps
   ├── intrinsics
   ├── confidence (phone)
   └── IMU (phone)
   │
   ▼
RTAB-Map
   │
   ├── external odometry
   ├── loop closures
   └── graph optimization
   │
   ▼
optimized camera poses
   │
   ▼
Open3D TSDF
   │
   ├── point cloud
   └── mesh
```

The existing repository already has the correct broad decomposition: dataset adapters, a common `Frame`/`Dataset` schema, RTAB-Map replay, Open3D reconstruction, evaluation code, Docker, and an Android recorder.

The goal is now **correctness, reproducibility, and real evidence**.

---

# Non-negotiable definition of success

Do not claim the project works because:

* Python tests pass.
* Android builds.
* `rtabmap.db` exists.
* Open3D emits a `.ply`.

The project is complete only when:

```text
TUM fr1/xyz
   ↓
correct RGB-D replay
   ↓
RTAB-Map
   ↓
full global graph optimization
   ↓
optimized camera trajectory
   ↓
Open3D TSDF
   ↓
valid reconstruction + metrics + report

AND

TUM fr1/room
   ↓
same pipeline
   ↓
loop closure behavior inspected
   ↓
valid reconstruction + metrics + report

AND

S24 FE
   ↓
actual ARCore recording
   ↓
pulled to laptop
   ↓
same offline reconstruction abstraction
   ↓
valid point cloud / mesh
```

All three stages must leave artifacts that can be inspected.

---

# P0 — Fix the two critical SLAM correctness errors

## P0.1 Fix TUM depth units before RTAB-Map

Current problem:

`dataset_player.py` reads a TUM depth PNG and publishes the raw array as:

```python
encoding="16UC1"
```

without unit conversion.

That is incorrect for RTAB-Map.

The TUM benchmark stores depth PNGs with:

```text
5000 = 1 metre
10000 = 2 metres
```

and zero means invalid depth.

RTAB-Map interprets:

```text
CV_16UC1 = depth in millimetres
CV_32FC1 = depth in metres
```

according to its current `SensorData` implementation.

### Preferred fix

For TUM ROS replay, publish depth as `32FC1` metres:

```python
depth_m = depth_raw.astype(np.float32) / 5000.0
depth_m[depth_raw == 0] = 0.0
```

and:

```python
depth_message = bridge.cv2_to_imgmsg(
    depth_m,
    encoding="32FC1",
)
```

This avoids unnecessary quantization and makes the unit semantics explicit.

Alternatively, converting to millimetres and publishing `16UC1` is acceptable:

```python
depth_mm = np.round(depth_raw.astype(np.float32) / 5.0).astype(np.uint16)
```

but choose exactly one representation and document it.

### Add tests

Test:

```text
TUM raw 0      -> invalid
TUM raw 5000   -> 1.0 m
TUM raw 10000  -> 2.0 m
```

Also test the exact ROS payload conversion, not only the Open3D conversion.

The Open3D path currently handles `depth_scale=5000` correctly; do not accidentally break that path while fixing ROS replay.

---

## P0.2 Stop treating `Node.pose` as the optimized RTAB-Map trajectory

Current code in:

```text
src/slam_pipeline/ros/trajectory_export.py
```

does:

```sql
SELECT stamp, pose
FROM Node
WHERE pose IS NOT NULL
```

and treats those poses as optimized camera poses.

Do not do this.

RTAB-Map provides an official exporter for optimized poses.

Use:

```bash
rtabmap-export \
    --poses \
    --poses_format 11 \
    --opt 0 \
    rtabmap.db
```

RTAB-Map's maintainer documents:

* `--poses` = optimized robot-frame poses.
* pose format `11` = timestamp + pose + node ID.
* `--opt 0` = full global graph optimization.
* `--opt 3` = raw odometry without optimization.

The current RTAB-Map launch sets:

```text
frame_id = camera_link
```

and publishes external odometry with `camera_link` as its child frame, so the RTAB-Map robot frame and camera frame are intentionally coincident in this pipeline.

### Implementation

Replace the current SQLite pose interpretation with a module that invokes the RTAB-Map exporter and parses its output.

Suggested API:

```python
export_rtabmap_trajectory(
    database: Path,
    output: Path,
    optimization="full",
) -> Trajectory
```

Support at least:

```text
full optimized: --opt 0
raw odometry:   --opt 3
```

Save both during benchmark testing:

```text
raw_odom_trajectory.txt
optimized_trajectory.txt
```

The parser must handle RTAB-Map pose format 11, including the trailing node ID.

Do not depend on undocumented binary SQLite blob layout for optimized poses.

### Verification

For every benchmark produce:

```text
input odometry trajectory
RTAB-Map raw odometry export
RTAB-Map optimized export
ground truth
```

Plot all relevant trajectories.

---

# P1 — Fix TUM timestamp association

The current `_associate()` docstring says:

```text
nearest unused second record
```

but the implementation does not actually mark a matched target sample as used.

It can therefore reuse one depth or pose sample for multiple RGB observations.

Replace it with a proper one-to-one nearest-neighbour timestamp associator.

Requirements:

```text
- input arrays sorted by timestamp
- each sample used at most once
- configurable maximum time difference
- deterministic ties
- O(N) or O(N log N)
```

Add tests covering:

```text
one RGB / one depth

two RGB frames competing for one depth frame

missing depth sample

irregular timestamps

timestamps outside threshold

exact timestamp matches
```

Also expose/report association statistics:

```text
RGB observations
depth observations
pose observations
associated RGB-D pairs
associated RGB-D-pose triples
dropped RGB frames
maximum timestamp residual
mean timestamp residual
```

---

# P2 — Turn `fr1/xyz` into a real end-to-end integration gate

TUM recommends `fr1/xyz` for initial debugging because the motion is simple and mostly translational.

The existing:

```bash
./scripts/run_tum_xyz.sh
```

currently only executes:

```text
TUM ground truth poses
    ↓
Open3D TSDF
```

and does not run the full RTAB-Map pipeline.

Change it so one command performs the whole gate.

Required command:

```bash
./scripts/run_tum_xyz.sh
```

Required sequence:

```text
1. download official fr1/xyz if missing
2. validate archive/dataset
3. load dataset
4. associate RGB/depth/GT timestamps
5. ground-truth TSDF sanity reconstruction
6. launch RTAB-Map headlessly
7. replay correct RGB-D + GT external odometry
8. terminate RTAB-Map cleanly
9. verify DB integrity
10. export raw odometry trajectory
11. export fully optimized trajectory
12. calculate ATE/RPE
13. reconstruct TSDF using optimized poses
14. validate mesh/cloud
15. generate plots
16. generate report.md
17. exit non-zero on any failed required stage
```

Do not require RViz or GUI interaction.

---

# P3 — Make RTAB-Map replay deterministic and observable

Keep the dataset player architecture, but improve it.

Current input topology is:

```text
/rgb/image
/depth/image
/camera_info
/odom
/tf
```

with RTAB-Map subscribing to external odometry.

Preserve this.

## Requirements

Record:

```text
published RGB frames
published depth frames
published odometry poses
RTAB-Map processed graph nodes
dropped/rejected frames
start timestamp
end timestamp
runtime
```

Do not simply:

```bash
sleep 3
kill RTAB-Map
```

and assume the database has flushed.

The current script does essentially this.

Implement deterministic completion.

Possible strategies:

```text
- observe node count until expected processing completes
- wait for RTAB-Map statistics indicating final frame
- explicitly issue ROS shutdown after player completion and processing drain
```

Whichever method is used, document it and verify that repeated runs produce consistent node counts.

---

# P4 — Add database/graph inspection

For each RTAB-Map run, inspect the graph rather than only checking that the SQLite file is non-empty.

RTAB-Map's schema stores graph constraints in the `Link` table, where link type `1` is `kGlobalClosure`.

Create:

```text
src/slam_pipeline/rtabmap/database.py
```

with read-only diagnostic utilities.

Extract at least:

```text
node_count
link_count
neighbor_link_count
global_loop_closure_count
local_space_closure_count
local_time_closure_count
database_size_bytes
first_node_stamp
last_node_stamp
```

It is acceptable to read the database directly for **diagnostics**.

Do not use raw `Node.pose` as the optimized trajectory.

Use the official `rtabmap-export` path for optimization.

---

# P5 — Reconstruct using genuinely optimized RTAB-Map poses

Current `reconstruct_rtabmap.py` already has a sensible architecture:

```text
load source dataset
load RTAB-Map poses
associate pose timestamp -> source frame
replace Frame.T_world_camera
run Open3D TSDF
```

Preserve that.

Only replace the trajectory source with the corrected optimized trajectory export.

Add one-to-one timestamp association here too.

Report:

```text
number of optimized RTAB-Map poses
number matched to RGB-D frames
number unmatched
maximum timestamp difference
mean timestamp difference
```

Fail if too few poses can be associated.

---

# P6 — Strengthen trajectory evaluation

Keep the current evaluation module but verify it numerically.

It currently implements:

```text
ATE
RPE translation
RPE rotation
rigid trajectory alignment
```

TUM recommends absolute trajectory error for SLAM evaluation and relative pose error for odometry-style evaluation.

Cross-check the project's implementation against either:

```text
TUM reference evaluation scripts
```

or:

```text
evo_ape
evo_rpe
```

for at least `fr1/xyz`.

The numbers should agree within numerical tolerance.

Do not silently include scale alignment because this pipeline is metric.

Use rigid SE(3) alignment only unless explicitly evaluating a monocular scale-ambiguous estimator in the future.

Generate:

```text
trajectory_metrics.json
trajectory_comparison.png
ate_error.png
```

Include:

```text
ATE RMSE
ATE mean
ATE median
ATE max
RPE translation RMSE
RPE rotation RMSE
associated poses
```

---

# P7 — Add the stronger `fr1/room` SLAM gate

The current:

```bash
./scripts/run_tum_room.sh
```

only performs ground-truth Open3D reconstruction.

Change it to run exactly the same end-to-end RTAB-Map pipeline as `fr1/xyz`.

TUM describes `fr1/room` as a trajectory around an office that closes the loop and is specifically useful for evaluating loop-closure behavior.

Required:

```bash
./scripts/run_tum_room.sh
```

must perform:

```text
download
association
GT TSDF baseline
RTAB-Map
graph inspection
full global optimization
trajectory evaluation
optimized TSDF
report
```

Report the actual number of:

```text
global loop closures
local loop closures
graph nodes
graph constraints
```

Do **not** force a hard-coded positive loop-closure count merely to pass.

If zero global loop closures are detected:

```text
1. verify image stream and descriptors are being stored
2. verify RTAB-Map parameters
3. inspect RTAB-Map log
4. inspect graph
5. determine whether the run is valid but no closure was accepted
```

Report the result accurately.

Do not fake a loop closure or tune parameters purely to manufacture one.

---

# P8 — Generate benchmark evidence

Create:

```text
outputs/tum_xyz/report.md
outputs/tum_room/report.md
```

The reports must contain:

```text
git commit SHA
date
Docker image / dependency versions
RTAB-Map version
ROS version
Open3D version

dataset
source URL
frame counts
association statistics

RTAB-Map nodes
RTAB-Map links
global loop closures
local loop closures

raw odom metrics
optimized trajectory metrics

TSDF integrated frames
mesh vertices
mesh triangles
point count
bounding-box dimensions

runtime
warnings
errors
```

Also generate:

```text
rgb_example.png
depth_example.png
trajectory_comparison.png
gt_mesh_preview.png
optimized_mesh_preview.png
```

Keep large:

```text
datasets
rtabmap.db
PLY files
```

out of Git.

Commit small reproducibility evidence under something like:

```text
docs/results/tum_xyz/
docs/results/tum_room/
```

containing:

```text
report.md
metrics JSON
trajectory plot
mesh preview
```

This makes the GitHub repo visibly demonstrate that the benchmark was actually run.

---

# P9 — Add an end-to-end automated validation script

Create:

```bash
./scripts/test_benchmarks.sh
```

It should run:

```bash
./scripts/run_tum_xyz.sh
./scripts/run_tum_room.sh
```

and validate output artifacts.

Fail if:

```text
rtabmap.db missing or empty
optimized trajectory missing
optimized trajectory has no poses
mesh has zero vertices
mesh has zero triangles
point cloud has zero points
NaN/Inf geometry detected
trajectory evaluation failed
report missing
```

Do not invent overly aggressive numerical SLAM thresholds just to label runs pass/fail.

Instead, fail on clear correctness problems such as:

```text
wrong scale
axis inversion
huge discontinuities
empty graph
empty reconstruction
timestamp association failure
```

Record actual accuracy metrics in the report.

---

# P10 — Expand unit/integration tests

Keep the existing tests; they are a good starting point.

Add tests for:

## Dataset

```text
unique timestamp association
TUM depth units
phone depth units
missing frames
invalid paths
invalid pose matrix
```

## Geometry

```text
T_world_camera convention
inverse transforms
quaternion round-trip
projection / unprojection
synthetic plane reconstruction
synthetic cube reconstruction
```

## RTAB-Map

```text
pose format 11 parser
raw vs optimized exporter invocation
SQLite graph statistics
node/link counting
global closure type parsing
```

## Full integration

Add a small smoke test that processes a limited frame slice.

Full TUM benchmark runs may remain outside normal CI due to download/runtime cost.

---

# P11 — Fix the Android Raw Depth recorder

Only address Android after both benchmark gates work.

The current recorder already obtains:

```text
CPU RGB
ARCore pose
Raw Depth 16-bit
Raw Depth confidence
camera intrinsics
```

and writes a custom dataset.

Keep that general approach.

However, make the following corrections.

---

## P11.1 Correct Raw Depth “new frame” detection

Current code uses:

```kotlin
if (frame.timestamp != depth.timestamp) return
```

Replace this.

ARCore documents that Raw Depth is normally updated at a lower rate than camera frames, with intermediate outputs being 3D reprojections of earlier depth data. Google explicitly recommends comparing the current depth-image timestamp with the **previous depth-image timestamp** to detect newly computed depth.

Use:

```kotlin
if (depth.timestamp == lastDepthTimestamp) {
    // Reprojected/reused depth.
    return
}

lastDepthTimestamp = depth.timestamp
```

Optionally allow a configuration:

```text
record_new_depth_only = true/false
```

Default to `true` for this offline reconstruction dataset.

Store both:

```text
rgb_timestamp_ns
depth_timestamp_ns
```

---

## P11.2 Store per-frame intrinsics

The current recorder writes camera intrinsics once into the manifest.

ARCore documents that image intrinsics may change per frame.

Store per-frame:

```text
rgb_fx
rgb_fy
rgb_cx
rgb_cy
rgb_width
rgb_height
```

and depth-specific calibration information described below.

The manifest may still contain nominal/default intrinsics for convenience.

---

# P12 — Fix ARCore RGB/depth geometric alignment

This is important.

Current Open3D loading code does:

```python
if depth.shape != color.shape:
    depth = cv2.resize(
        depth,
        color.shape,
        interpolation=cv2.INTER_NEAREST,
    )
```

Do not treat this as generally correct for ARCore.

Google documents that the CPU camera image and ARCore depth image can have different aspect ratios; in that case, the depth image is effectively a crop of the camera image, and coordinate conversion should be done through ARCore's image/texture coordinate transforms.

Google's own Raw Depth codelab obtains **texture intrinsics** and scales those intrinsics to the actual depth resolution before unprojecting Raw Depth pixels.

### Required implementation

Record enough information to reconstruct correct correspondences offline.

At minimum store, for each recorded frame:

```text
RGB image intrinsics
texture/depth-relevant intrinsics
RGB dimensions
depth dimensions
mapping needed between depth normalized coordinates and CPU RGB coordinates
```

Preferred approach:

On Android, generate and store a compact coordinate mapping/calibration description using:

```kotlin
Frame.transformCoordinates2d(
    Coordinates2d.TEXTURE_NORMALIZED,
    ...,
    Coordinates2d.IMAGE_PIXELS,
    ...
)
```

or the inverse mapping.

Do not just resize depth to RGB resolution unless it has been mathematically demonstrated that the recorded camera configuration makes that equivalent.

### Depth intrinsics

Follow Google's Raw Depth geometry:

```text
fx_depth = fx_texture * depth_width / texture_intrinsic_width
fy_depth = fy_texture * depth_height / texture_intrinsic_height
cx_depth = cx_texture * depth_width / texture_intrinsic_width
cy_depth = cy_texture * depth_height / texture_intrinsic_height
```

as illustrated by Google's Raw Depth codelab.

Store these values explicitly per depth frame.

---

# P13 — Keep Raw Depth native and confidence-aware

ARCore Raw Depth:

* is sparse;
* uses zero for invalid depth;
* is represented in millimetres;
* provides a matching confidence image.

Preserve the raw files.

Never destructively alter the stored depth.

Do confidence filtering offline.

Support:

```bash
--confidence-min 0
--confidence-min 64
--confidence-min 128
--confidence-min 192
```

or arbitrary `0..255`.

This enables later reconstruction experiments without rescanning.

---

# P14 — Move Android disk work off the GL thread

Current `record(frame)` performs:

```text
camera acquisition
YUV conversion
JPEG encoding
depth copying
confidence copying
CSV writing
flushing
```

inside the AR rendering/update path.

Refactor to:

```text
AR thread
   │
   ├── acquire/copy required frame data
   │
   ▼
bounded queue
   │
   ▼
background writer thread
   │
   ├── encode JPEG
   ├── write depth
   ├── write confidence
   └── append metadata
```

Important:

`android.media.Image` objects should not simply be passed to a background thread and held indefinitely.

Copy the required buffers/metadata promptly, close ARCore Images, then enqueue owned byte arrays / immutable frame packets.

Use a bounded queue.

If writer throughput cannot keep up:

```text
count dropped frames
log the event
report it in recording metadata
```

Do not allow unbounded memory growth.

---

# P15 — Stop swallowing Android errors

Current code has:

```kotlin
catch (_: Exception) {
}
```

around acquisition/recording.

Replace broad silent swallowing with specific handling.

Expected conditions such as ARCore depth not yet being available may be handled quietly or counted.

Unexpected exceptions must:

```text
Log.e(...)
increment error counter
appear in session summary
```

At recording end, show:

```text
RGB frames attempted
new Raw Depth frames recorded
reprojected depth frames skipped
RGB acquisition misses
depth acquisition misses
writer queue drops
unexpected errors
```

---

# P16 — Record phone IMU

The current Android implementation does not yet record IMU data.

Add Android `SensorManager` logging for:

```text
gyroscope
accelerometer
```

Write:

```text
imu.csv
```

with:

```text
timestamp_ns,
gx,gy,gz,
ax,ay,az
```

Record the exact Android sensor timestamp.

IMU is **not used by V1 RTAB-Map reconstruction** because ARCore already provides the pose.

Store it now for future:

```text
ORB-SLAM3
OpenVINS
stereo-inertial
ARCore-vs-custom-VIO comparisons
```

Do not delay V1 mapping because of IMU processing.

---

# P17 — Improve the phone dataset format

Move from relying on identical pose/frame timestamps toward an explicitly associated format.

Current loader performs exact dictionary lookup:

```python
pose_row = poses.get(timestamp_ns)
```

That works with the current synchronous recorder but is brittle.

Use `frames.csv` with explicit timestamps:

```text
frame_id
rgb_timestamp_ns
depth_timestamp_ns
pose_timestamp_ns

rgb_path
depth_path
confidence_path

rgb_fx
rgb_fy
rgb_cx
rgb_cy

depth_fx
depth_fy
depth_cx
depth_cy

rgb_width
rgb_height
depth_width
depth_height

is_new_depth
tracking_state
```

Keep poses in:

```text
poses.csv
```

and associate by timestamp with configurable tolerance.

Do not assume asynchronous streams always share exact integer timestamps.

---

# P18 — Make `phone_default.yaml` real

Current:

```text
reconstruct_phone.py --config ...
```

accepts a config path but does not actually load it; TSDF parameters are hard-coded.

Fix this.

Move into `phone_default.yaml`:

```text
depth truncation
confidence minimum
TSDF voxel size
TSDF truncation
frame stride
timestamp tolerances
depth registration strategy
```

The Python script must load and obey those values.

Print the final effective configuration in the reconstruction report.

---

# P19 — Build and install the actual Android app

After benchmark validation:

```bash
./scripts/build_android.sh
./scripts/install_android.sh
```

The current Dockerized Android build infrastructure may be retained.

On the connected S24 FE:

```text
1. install debug APK
2. grant camera permission
3. start app
4. verify RAW_DEPTH_ONLY reports supported
5. record a short 10–20 second scene
6. move the phone deliberately to generate parallax
7. stop recording
8. inspect logcat
9. pull recording
10. inspect dataset structure
```

Do not yet attempt an entire apartment scan.

Start with something geometrically easy:

```text
desk
chair
wall corner
box
```

with textured surfaces and camera movement.

---

# P20 — Reconstruct first real S24 FE scan

Run:

```bash
./scripts/pull_phone_recordings.sh
```

then:

```bash
docker compose run --rm slam \
python3 -m slam_pipeline.scripts.reconstruct_phone \
    data/phone_recordings/<recording> \
    --config config/phone_default.yaml \
    --output outputs/phone_scan
```

Verify:

```text
depth scale is metric
camera poses are finite
trajectory orientation looks sensible
point cloud is not mirrored
point cloud is not upside down
scene dimensions are plausible
mesh is non-empty
```

Generate:

```text
phone_trajectory.png
phone_pointcloud.ply
phone_mesh.ply
phone_mesh_preview.png
phone_stats.json
phone_report.md
```

---

# P21 — Add RTAB-Map to the phone recording path

First reconstruct the phone scan directly from ARCore poses.

Once that works, replay the same recording into RTAB-Map:

```text
S24 FE recording
   │
   ├── RGB
   ├── Raw Depth
   └── ARCore pose as /odom
   │
   ▼
RTAB-Map
   │
   ▼
full optimized trajectory
   │
   ▼
Open3D TSDF
```

Produce both:

```text
ARCore-only reconstruction
RTAB-Map-optimized reconstruction
```

for the same dataset.

Compare:

```text
trajectory
map consistency
start/end drift
mesh alignment
loop closures
```

Do not assume RTAB-Map will necessarily improve every short scan.

Report what actually happens.

---

# P22 — Add a real loop-closure phone experiment

After short phone scans work, record:

```text
start at desk
walk around room
return to desk
```

Process offline.

Report:

```text
ARCore start/end pose discrepancy
RTAB-Map detected loop closures
RTAB-Map optimized start/end discrepancy
visual comparison before/after optimization
```

This becomes the first meaningful phone SLAM demonstration.

---

# P23 — Explicitly out of scope

Do not implement these during this task:

```text
main + ultrawide stereo
custom visual-inertial odometry
ORB-SLAM3
OpenVINS
AnyDepth
Depth Anything
neural depth completion
Gaussian splatting
semantic mapping
real-time reconstruction
cloud backend
```

The existing modular architecture should make these future plug-ins possible.

Do not let them delay the verified ARCore + RTAB-Map + Open3D pipeline.

---

# Expected final repository architecture

Aim for approximately:

```text
phone-slam/
├── android/
│   └── app/
│
├── config/
│   ├── tum_fr1_xyz.yaml
│   ├── tum_fr1_room.yaml
│   └── phone_default.yaml
│
├── docs/
│   └── results/
│       ├── tum_xyz/
│       ├── tum_room/
│       └── phone/
│
├── scripts/
│   ├── setup.sh
│   ├── download_tum.sh
│   ├── run_tum_xyz.sh
│   ├── run_tum_room.sh
│   ├── test_benchmarks.sh
│   ├── build_android.sh
│   ├── install_android.sh
│   └── pull_phone_recordings.sh
│
├── src/slam_pipeline/
│   ├── dataset/
│   │   ├── schema.py
│   │   ├── association.py
│   │   ├── tum_rgbd.py
│   │   └── phone_dataset.py
│   │
│   ├── ros/
│   │   └── dataset_player.py
│   │
│   ├── rtabmap/
│   │   ├── export.py
│   │   └── database.py
│   │
│   ├── reconstruction/
│   │   └── tsdf.py
│   │
│   ├── evaluation/
│   │   └── trajectory.py
│   │
│   └── scripts/
│       ├── reconstruct_phone.py
│       ├── reconstruct_rtabmap.py
│       └── evaluate_rtabmap.py
│
└── tests/
```

Keep the existing modules where they are already suitable rather than moving files solely to match this exact tree.

---

# Final required commands

The following must actually work from a clean checkout after setup:

```bash
./scripts/setup.sh

./scripts/run_tum_xyz.sh

./scripts/run_tum_room.sh

./scripts/test_benchmarks.sh

./scripts/build_android.sh

./scripts/install_android.sh
```

For phone processing:

```bash
./scripts/pull_phone_recordings.sh
```

and:

```bash
docker compose run --rm slam \
python3 -m slam_pipeline.scripts.reconstruct_phone \
    data/phone_recordings/<recording> \
    --config config/phone_default.yaml \
    --output outputs/phone_scan
```

---

# Required final verification report

Before declaring completion, run everything rather than reasoning that it should work.

Return:

## Environment

```text
git SHA
ROS version
RTAB-Map version
Open3D version
Python version
Android Gradle/plugin versions
ARCore SDK version
```

## TUM fr1/xyz

```text
RGB observations
depth observations
associated frames
RTAB-Map nodes
RTAB-Map constraints
loop closures
raw odometry poses
optimized poses
ATE
RPE
TSDF integrated frames
mesh vertices
mesh triangles
point count
bounding box
runtime
artifact paths
```

## TUM fr1/room

Same metrics, plus:

```text
global loop closure count
before/after optimization trajectory plots
```

## S24 FE

```text
device detected by adb
APK build success
APK install success
ARCore Raw Depth support
recording duration
RGB frames
unique Raw Depth updates
skipped/reprojected Raw Depth frames
IMU samples
writer drops
recording errors
reconstructed frames
point count
mesh vertices
mesh triangles
artifact paths
```

---

# Critical checks before saying “done”

Answer all of these explicitly:

```text
1. Is TUM depth converted into the units RTAB-Map actually expects?

2. Are optimized poses coming from RTAB-Map global optimization rather
   than SQLite Node.pose?

3. Does rtabmap-export --opt 0 run successfully?

4. Is timestamp association one-to-one?

5. Does fr1/xyz run end-to-end from one command?

6. Does fr1/room run end-to-end from one command?

7. Are loop-closure statistics extracted from the graph?

8. Is the optimized trajectory actually used for the final TSDF?

9. Do ATE/RPE agree with an independent evaluator?

10. Does the Android recorder detect unique Raw Depth updates by comparing
    consecutive Raw Depth timestamps?

11. Are ARCore depth and CPU RGB coordinates handled geometrically rather
    than by blindly resizing?

12. Are the correct intrinsics stored for RGB and Raw Depth?

13. Is disk encoding/writing moved off the AR render thread?

14. Are unexpected Android recording errors visible?

15. Is IMU recorded?

16. Does phone_default.yaml actually affect reconstruction?

17. Has a real S24 FE recording been pulled and reconstructed?
```

If any answer is “no”, the implementation is not complete.

---

# Priority order

Execute strictly in this order:

```text
P0  TUM depth units
P0  RTAB-Map optimized pose export
 ↓
P1  timestamp association
 ↓
P2–P6 fr1/xyz end-to-end
 ↓
P7–P10 fr1/room + benchmark evidence
 ↓
P11–P18 Android recorder correctness
 ↓
P19–P20 first S24 FE scan
 ↓
P21 RTAB-Map on S24 FE recording
 ↓
P22 real room loop-closure experiment
```

Do not work on later phases while a P0/P1 correctness issue remains unresolved.

---

# Implementation philosophy

Prefer:

```text
simple
explicit
testable
dataset-neutral
reproducible
```

over abstraction for its own sake.

Preserve the current strong design choice:

```text
T_world_camera
```

everywhere internally, with conversion only at external API boundaries. The current Open3D integration already follows this correctly by passing `inverse(T_world_camera)` to Open3D.

For every external system boundary, document:

```text
coordinate convention
units
timestamp clock/domain
image encoding
intrinsics convention
```

Do not silently guess any of these.

Most importantly:

**Do not report that something works until it has actually been executed and its outputs inspected.**
