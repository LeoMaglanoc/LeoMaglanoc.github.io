# ICL-NUIM — noisy RGB-D benchmark

| Sequence | Poses | Mapper | ATE cm | Accuracy cm | Completeness cm | F@2cm | F@5cm |
|---|---|---|---:|---:|---:|---:|---:|
| lr_kt0 | estimated | tsdf_estimated | 0.772 | 1.651 | 1.906 | 0.645 | 0.989 |
| lr_kt0 | estimated | rtab_estimated | 0.772 | 21.272 | 1.809 | 0.372 | 0.595 |
| lr_kt0 | GT | tsdf_gt | 0.000 | 1.023 | 1.275 | 0.861 | 0.990 |
| lr_kt0 | GT | rtab_gt | 0.000 | 21.672 | 1.612 | 0.447 | 0.630 |
| lr_kt0 | GT | tsdf_clean_gt | 0.000 | 0.363 | 0.484 | 0.986 | 0.992 |
| lr_kt1 | estimated | tsdf_estimated | 1.895 | 2.205 | 4.203 | 0.516 | 0.882 |
| lr_kt1 | estimated | rtab_estimated | 1.895 | 32.728 | 4.033 | 0.276 | 0.467 |
| lr_kt1 | GT | tsdf_gt | 0.000 | 0.888 | 2.768 | 0.942 | 0.978 |
| lr_kt1 | GT | rtab_gt | 0.000 | 30.187 | 2.695 | 0.509 | 0.559 |
| lr_kt1 | GT | tsdf_clean_gt | 0.000 | 0.361 | 2.326 | 0.972 | 0.979 |
| lr_kt2 | estimated | tsdf_estimated | 1.819 | 2.084 | 4.546 | 0.614 | 0.905 |
| lr_kt2 | estimated | rtab_estimated | 1.819 | 19.976 | 4.529 | 0.366 | 0.588 |
| lr_kt2 | GT | tsdf_gt | 0.000 | 1.042 | 3.818 | 0.852 | 0.952 |
| lr_kt2 | GT | rtab_gt | 0.000 | 20.844 | 3.749 | 0.512 | 0.622 |
| lr_kt2 | GT | tsdf_clean_gt | 0.000 | 0.210 | 3.356 | 0.941 | 0.952 |
| lr_kt3 | estimated | tsdf_estimated | 3.371 | 2.838 | 3.907 | 0.481 | 0.834 |
| lr_kt3 | estimated | rtab_estimated | 3.371 | 19.709 | 3.806 | 0.273 | 0.545 |
| lr_kt3 | GT | tsdf_gt | 0.000 | 0.704 | 2.206 | 0.949 | 0.972 |
| lr_kt3 | GT | rtab_gt | 0.000 | 23.463 | 2.087 | 0.529 | 0.582 |
| lr_kt3 | GT | tsdf_clean_gt | 0.000 | 0.272 | 1.730 | 0.968 | 0.975 |
| MEAN | estimated | tsdf_estimated | 1.964 | 2.195 | 3.640 | 0.564 | 0.902 |
| MEAN | estimated | rtab_estimated | 1.964 | 23.421 | 3.544 | 0.321 | 0.549 |
| MEAN | GT | tsdf_gt | 0.000 | 0.914 | 2.517 | 0.901 | 0.973 |
| MEAN | GT | rtab_gt | 0.000 | 24.041 | 2.536 | 0.499 | 0.598 |
| MEAN | GT | tsdf_clean_gt | 0.000 | 0.301 | 1.974 | 0.967 | 0.974 |

Clean-depth GT diagnostic rows are included separately from the noisy 2×2 comparison. Means weight each sequence equally. Failures are preserved in JSON; incomplete sets are not a complete benchmark. kt0 is the development/tuning sequence; kt1–kt3 validate chosen parameters.

| Sequence | Graph/input frames | ATE cm | RPE translation cm | RPE rotation rad | Clean depth → GT p95 cm |
|---|---:|---:|---:|---:|---:|
| lr_kt0 | 212/1508 | 0.772 | 0.427 | 0.003733 | 0.647 |
| lr_kt1 | 124/965 | 1.895 | 0.620 | 0.003307 | 0.718 |
| lr_kt2 | 119/880 | 1.819 | 0.612 | 0.008107 | 0.421 |
| lr_kt3 | 228/1240 | 3.371 | 0.975 | 0.006682 | 0.414 |

Graph coverage reports the retained keyframes, not dense frame-wise tracking coverage. RPE compares consecutive associated graph poses. Raw clean depth has a small residual against the reference; the clean TSDF error therefore includes that residual as well as fusion and discretization. Diagnostic differences are not assumed to add linearly.


The kt0 native GT cloud agrees with independent PNG unprojection to 5.75 mm at p95. The native and independent voxel clouds have GT-distance means of 7.10 and 7.14 cm, with a substantial noisy-depth outlier tail. These diagnostics sample voxel points uniformly, not surface area, and cannot be subtracted from mesh scores. [Native input check](native_source_cloud_validation.json).

## Controlled tuning

| Sequence | Configuration | Accuracy cm | Completeness cm | F@2cm |
|---|---|---:|---:|---:|
| lr_kt0 | tsdf_v10_t2_s2 | 1.437 | 1.351 | 0.765 |
| lr_kt1 | tsdf_v10_t2_s2 | 2.315 | 3.948 | 0.523 |
| lr_kt2 | tsdf_v10_t2_s2 | 1.678 | 4.169 | 0.697 |
| lr_kt3 | tsdf_v10_t2_s2 | 2.583 | 3.404 | 0.558 |
| MEAN | tsdf_v10_t2_s2 | 2.003 | 3.218 | 0.636 |
| lr_kt0 | tsdf_v10_t2_s1 | 1.428 | 1.352 | 0.761 |
| lr_kt1 | tsdf_v10_t2_s1 | 2.226 | 3.943 | 0.527 |
| lr_kt2 | tsdf_v10_t2_s1 | 1.817 | 4.245 | 0.674 |
| lr_kt3 | tsdf_v10_t2_s1 | 2.653 | 3.482 | 0.542 |
| MEAN | tsdf_v10_t2_s1 | 2.031 | 3.256 | 0.626 |
| lr_kt0 | rtab_p10 | 15.840 | 1.395 | 0.488 |
| lr_kt1 | rtab_p10 | 29.223 | 3.753 | 0.320 |
| lr_kt2 | rtab_p10 | 13.545 | 3.874 | 0.497 |
| lr_kt3 | rtab_p10 | 11.254 | 2.872 | 0.411 |
| MEAN | rtab_p10 | 17.466 | 2.973 | 0.429 |

Selected TSDF configuration: `tsdf_v10_t2_s2`, parameters `{"frame_stride": 2, "sdf_trunc": 0.02, "voxel_length": 0.01}`. Held-out mean F@2cm: 0.593; baseline: 0.537. kt0 scores select finalists; kt1–kt3 validate them. The complete 15-configuration development sweep is in `sweep.json`. Baseline metrics are frozen. Increasing mesh resolution alone does not guarantee greater accuracy.
