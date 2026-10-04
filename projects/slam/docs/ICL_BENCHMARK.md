# ICL-NUIM SLAM and reconstruction benchmark

The benchmark compares noisy RGB-D tracking and reconstructed geometry against
independent camera and surface ground truth. TUM remains the real-camera public
demo; ICL is explicitly labelled synthetic. Browser assets are precomputed.

## Commands

From `projects/slam`:

```bash
./scripts/run_icl.sh lr_kt0
./scripts/sweep_icl.sh
./scripts/run_icl.sh all --resume
./scripts/export_icl_web.sh
# Python acceptance gate, inside the existing ROS container:
docker compose run --rm -T slam python3 -m slam_pipeline.scripts.validate_icl
```

`run_icl.sh all` also works without the sweep. `--resume` reuses only successful
sequence results; failures remain visible. The sweep is required before the web
export, so the published report includes tuning evidence. It changes neither the
baseline config nor the original baseline scores.

The runner reuses `offline-slam:jazzy`; use `scripts/setup.sh` if it is absent.
Images/depth stay in ignored `data/icl_nuim`, intermediates in ignored
`outputs/icl_nuim`. Small results, provenance and figures are copied to
`docs/results/icl_nuim`. Large sensor archives are never committed.

## Disk policy

A 5 GiB free-space reserve is enforced during download, extraction, and external
processes. Extraction is bounded to 4 GiB per archive and rejects traversal,
links and special files. Archives are removed after extraction, including on
failure. Sequences run sequentially. By default kt1–kt3 sensor packages and
RTAB databases are deleted after their reports and master meshes are retained.
kt0 is retained for tuning and web export. `--keep-data` opts into retention.

After export, `scripts/cleanup_icl.sh` removes only ignored ICL sensor packages,
reference assets, databases and display-export intermediates, including duplicate
full-resolution error-colored geometry. It retains scores, figures and master
meshes. It does not prune Docker or touch unrelated projects.

## Camera and frame conventions

The official calibration is `fx=481.2, fy=-480, cx=319.5, cy=239.5`. The loader
flips RGB and depth vertically together, converting `v` to `479-v`. Internal
intrinsics are positive and the camera basis remains unchanged. All poses are
proper `T_world_camera`; Open3D receives their inverse.

The PNG archives use zero-based IDs in `associations.txt`, not real seconds.
The published global `.gt.sim` stream uses **one-based** frame IDs. Block zero
belongs to PNG frame 1; PNG frame 0 lacks published GT. Timestamp conversion is
`frame_id / 30`. The advertised frame counts and actual evaluable counts differ;
reports retain both. No approximate timestamp association shifts the poses.

The official OBJ world is reflected in X relative to `.gt.sim`. The reference
geometry is normalized with this fixed reflection and reversed triangle winding,
while camera poses retain proper rotations. This is a declared dataset basis
conversion, not fitted registration. OBJ quads are triangulated explicitly;
loading this OBJ through Open3D directly can silently omit its quad surfaces.

PNG depths are Z depth in units of 1/5000 m. Native POVRay `.depth` radial ranges
are not inputs. Per-sequence raw clean depth is checked against exact GT triangles
before SLAM or reconstruction scores are accepted. Its residual is reported
separately; do not attribute all clean-oracle residual to fusion alone.

## Experiment protocol

Primary noisy-depth comparison:

| Poses | Open3D TSDF | RTAB native Poisson mesh |
|---|---|---|
| GT | yes | yes |
| RGB-D SLAM estimate | yes | yes |

Both mappers and both pose conditions use identical source IDs selected from the
estimated graph. The clean-depth GT condition uses these same IDs; an additional
full-sequence clean-depth GT TSDF oracle is reported separately. Coverage is
reported so tracking loss cannot disappear behind low error on a small subset.

Estimated replay loads no GT pose file and publishes zero external-odometry
messages. GT replay disables optimization, and native GT export uses `--opt 3`
(raw odometry). Exported poses are checked against the supplied GT poses before
accepting that condition. Estimated optimization is saved once; native mesh export
uses stored poses (`--opt 2`), matching TSDF's exported optimized trajectory.

The kt0 native GT depth cloud is also compared to an independently unprojected
PNG cloud using the same frames, decimation and 10 mm voxel size. Its nearest-point
p95 must be below two voxels, allowing different voxel-grid origins. This checks
the native camera coordinates separately from Poisson extraction. The diagnostic
also reports both clouds' distances to GT, using uniform voxel-point sampling;
these are not area-weighted surface scores and must not be subtracted from them.

ATE uses a proper rigid position alignment with no scale. That exact matrix also
aligns the estimated mesh. RPE uses consecutive associated graph poses. An
independent `evo` check must agree within 1e-5. GT geometry uses identity alignment.
No independent ICP is allowed in the primary metric.

Accuracy samples 100,000 reconstruction points with uniform triangle-area
weighting and fixed NumPy seed 2026, then queries exact closest GT triangles.
Completeness uses a shared clean-depth/GT-pose visibility union, projected onto
GT triangles and voxelized at 5 mm. Pixel stride is 4, with every frame included.
Clean points inconsistent with GT by more than 5 mm are omitted; the count and
raw-depth residual are reported. Completeness queries exact predicted triangles,
not a sampled predicted point cloud. Precision, recall and F-score are recorded
at 1, 2 and 5 cm. Heatmap colors are presentation only, capped at 10 cm.

Historical ICL-style mean/median/std/min/max statistics are also emitted. They
use this project's sampling and trajectory alignment and are **not official
SurfReg numbers**. Upstream SurfReg is an interactive PCL viewer with registration,
so it remains an optional independent cross-check rather than a required headless
pipeline dependency. Its expected first-frame/native-camera coordinates differ
from the browser bundle. Do not compare its independently registered score to
our end-to-end score without naming the protocol.

Sampling/evaluation are deterministic. ROS scheduling and graph construction may
vary; reproducibility means identical recorded inputs/settings and independently
verified metrics, not byte-identical ROS databases. JSON includes versions,
archive hashes, parameters, pose validation, graph coverage and runtime.
`config/icl_downloads.json` pins all 17 official archive and pose-file SHA-256
digests; changed downloads are rejected before use.

## Controlled tuning

The kt0 TSDF sweep tests 30/20/10 mm voxels, 2×/3× truncation and strides 1/2:
12 configurations. The top two by F@2cm (accuracy mean breaks ties) are validated
on kt1–kt3. A separate native sweep changes only Poisson resolution to
30/20/10 mm; its best kt0 candidate is also validated on the held-out sequences.
Baseline and tuning results remain distinct in JSON. Sequence means are equally
weighted. No parameter change is selected by appearance.

Web GLBs are simplified display derivatives; scores always use master geometry.
RTAB color mode uses native projected UV textures; TSDF color mode uses fused
observed RGB vertex colors, with this representation identified in metadata.
Geometry and heatmap views share topology. Native RGB view uses a separate UV
display export, which may omit untextured triangles; its actual triangle count
is read from the resulting GLB.

## Attribution

ICL-NUIM: A. Handa, T. Whelan, J. McDonald and A. Davison, *A Benchmark for RGB-D
Visual Odometry, 3D Reconstruction and SLAM*, ICRA 2014. Living-room scene:
Jaime Vives Piqueres. Dataset and derived assets: [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

Sources: [official dataset](https://www.doc.ic.ac.uk/~ahanda/VaFRIC/iclnuim.html),
[camera conventions](https://www.doc.ic.ac.uk/~ahanda/VaFRIC/codes.html),
[GT OBJ](https://www.doc.ic.ac.uk/~ahanda/VaFRIC/living_room.html),
[SurfReg](https://github.com/mp3guy/SurfReg).
