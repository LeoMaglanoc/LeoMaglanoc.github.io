# Offline RGB-D SLAM and dense 3D reconstruction

Offline RGB-D SLAM and dense 3D reconstruction for both benchmark data and Android phone recordings. TUM RGB-D uses learned-free RGB-D odometry, while the Galaxy S24 FE uses ARCore VIO as the motion estimate; RTAB-Map performs loop closure, pose-graph optimization, native dense meshing, and RGB image-projected texture-atlas generation.

The canonical browser demo uses TUM `freiburg3_long_office_household` and is rendered entirely from precomputed assets—no SLAM runs in the browser.

## Pipeline

```text
                 TUM RGB-D
              RGB + metric depth
                      │
                      ▼
             RGB-D odometry
                      │
                      │
                      ├─────────────────────┐
                      │                     │
Galaxy S24 FE         │                     │
RGB + Raw Depth       │                     │
+ ARCore VIO ─────────┘                     │
                                            ▼
                                        RTAB-Map
                              place recognition + loop closure
                                  + pose-graph optimization
                                            │
                                            ▼
                                  optimized SE(3) poses
                                            │
                         original RGB-D observations │
                                            ▼
                         RTAB-Map native dense mesh
                                            │
                              UV projection + texture atlas
                                            │
                              gain compensation + blending
                                            ▼
                                         textured OBJ/MTL
                                            │
                                            ▼
                                          textured GLB + trajectory JSON
                                                      │
                                                      ▼
                                             Three.js viewer
```

Open3D TSDF remains available as an independent baseline for regression and
geometry comparison. Regression benchmarks can substitute TUM ground-truth
poses as external odometry to isolate and test the RTAB-Map → optimization →
reconstruction paths.
Ground truth is not used as odometry in the canonical Freiburg SLAM demo.

## Tech stack

Acquisition

- Kotlin / Android
- ARCore Raw Depth + VIO
- Android SensorManager
- ADB

SLAM / robotics

- ROS 2 Jazzy
- RTAB-Map
- Python
- NumPy / SciPy / OpenCV

Reconstruction / evaluation

- Open3D TSDF
- evo
- TUM RGB-D benchmark

Web / tooling

- Three.js
- Vite
- JavaScript
- ffmpeg
- Docker

## Canonical demo

TUM RGB-D: `freiburg3_long_office_household`

```text
RGB-D odometry
    ↓
481 graph nodes
    ↓
90 global loop closures
    ↓
global pose-graph optimization
    ↓
ATE: 6.15 cm → 4.39 cm
    ↓
native RTAB-Map UV-textured reconstruction
```

Live viewer: https://leonardo-maglanoc.com/slam/

## Pose convention

Every internal pose is `T_world_camera`: camera-coordinate points are transformed
to world coordinates with `p_world = T_world_camera @ p_camera`. Open3D receives
the inverse because its integration API expects world-to-camera extrinsics.

## Reproducible environment

The project uses Docker for ROS 2 Jazzy, RTAB-Map, and Python dependencies. The
workspace is mounted into the container, so datasets and generated artifacts
remain in `data/` and `outputs/` on the host.

```bash
./scripts/setup.sh
./scripts/run_tum_xyz.sh
./scripts/run_tum_room.sh
./scripts/run_tum_long_office.sh
./scripts/test_benchmarks.sh
./scripts/build_android.sh
```

`run_tum_xyz.sh` and `run_tum_room.sh` are complete gates: download, one-to-one
association, ground-truth TSDF baseline, ROS replay, graph inspection, official
`rtabmap-export --opt 0`, raw/optimized ATE/RPE, `evo` cross-check, optimized
TSDF, validation, and small evidence under `docs/results/`.

## Android recording

The recorder writes `offline-slam-phone-v2`: native ARCore Raw Depth (`uint16`
little-endian millimetres), confidence, per-frame CPU-RGB and depth intrinsics,
per-frame texture-to-CPU-image coordinate mapping, asynchronous timestamps,
ARCore poses, and accelerometer/gyroscope samples. JPEG encoding and disk writes
run on a bounded background queue; its session summary reports missed, skipped,
dropped, and unexpected-error counts.

USB ADB stays on the host while the APK build remains Dockerized:

```bash
./scripts/build_android.sh
./scripts/install_android.sh
./scripts/pull_phone_recordings.sh
```

Process a recording directly from ARCore poses with:

```bash
docker compose run --rm slam python3 -m slam_pipeline.scripts.reconstruct_phone \
  data/phone_recordings/recording_YYYYMMDD_HHMMSS \
  --config config/phone_default.yaml --output outputs/phone_scan
```

Then replay the same recording through RTAB-Map with:

```bash
./scripts/run_phone_rtabmap.sh data/phone_recordings/recording_YYYYMMDD_HHMMSS
```

V2 does not resize raw depth to CPU RGB dimensions. It projects CPU RGB onto
the native depth grid using the coordinate mapping recorded from ARCore and
integrates using texture-derived depth intrinsics.

The phone recorder deliberately uses one logical RGB camera plus ARCore raw
depth and pose. Multi-camera stereo is out of scope for this pipeline.

TUM archives, phone recordings, databases, APKs, and generated geometry are
ignored by Git. Small benchmark reports, JSON metrics, and preview PNGs are
kept in `docs/results/`.

## Public Freiburg viewer demo

`freiburg3_long_office_household` is the public demonstration sequence. Unlike
the two regression benchmarks, it does **not** feed TUM ground truth into
RTAB-Map: RGB-D odometry produces `/odom`, RTAB-Map performs loop closure and
global optimization, and TUM ground truth is used only afterward for ATE/RPE.

```bash
./scripts/run_tum.sh freiburg3_long_office_household
cd web && npm ci && npm run build
```

The one-command reconstruction downloads the official data and presentation AVI,
transcodes `demo.mp4`, creates an RTAB-Map mesh textured from the original RGB-D
observations, converts OBJ/MTL/textures to GLB with pinned `obj2gltf` in the
existing Docker `web` service, then creates the browser-only bundle under
`web/public/demos/freiburg3_long_office_household/`.
It refuses to accept a run with zero global loop closures. `scene.glb` and
`trajectory.json` are converted together to Three.js coordinates offline;
browser code performs display only. The source PLY, database, logs, data
archives, and other heavy artifacts stay ignored in `outputs/`/`data/`.

Native texturing capability is recorded reproducibly with:

```bash
docker compose run --rm slam bash scripts/check_rtabmap_reconstruction_support.sh
```

The current Ubuntu 24.04 / ROS Jazzy package is RTAB-Map 0.22.1. It supports
native UV texture atlases, RGB gain compensation, and blending. Its packaged
build does not include AliceVision, so multi-band texturing is unavailable and
the production method is standard RTAB-Map gain-compensated blending. Exact
mesh/texture settings and final counts are emitted to
`outputs/tum_long_office/rtabmap_textured/master/reconstruction_stats.json`.

## ICL-NUIM tracking and geometry benchmark

The synthetic ICL-NUIM living-room benchmark compares RTAB-Map and Open3D TSDF
with estimated and frozen GT poses on all four trajectories. Clean-depth GT
oracles provide a fusion reference alongside measured raw-depth residuals. Surface accuracy, observable
completeness and F-scores use exact triangle distances and trajectory-derived
rigid alignment. The public viewer keeps TUM and adds an ICL dataset selector.

```bash
./scripts/run_icl.sh lr_kt0
./scripts/sweep_icl.sh
./scripts/run_icl.sh all --resume
./scripts/export_icl_web.sh
./scripts/cleanup_icl.sh
```

See [benchmark protocol, frame conventions and disk policy](docs/ICL_BENCHMARK.md)
and [recorded results](docs/results/icl_nuim/report.md).

ICL-NUIM: A. Handa, T. Whelan, J. McDonald and A. Davison, ICRA 2014;
living-room scene by Jaime Vives Piqueres. Data and derived assets are
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
