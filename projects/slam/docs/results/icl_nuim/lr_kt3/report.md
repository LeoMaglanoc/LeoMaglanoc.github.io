# ICL-NUIM lr_kt3 — synthetic benchmark

| Sequence | Poses | Mapper | ATE cm | Accuracy cm | Completeness cm | F@2cm | F@5cm |
|---|---|---|---:|---:|---:|---:|---:|
| lr_kt3 | GT | tsdf_clean_gt | 0 | 0.272 | 1.730 | 0.968 | 0.975 |
| lr_kt3 | GT | tsdf_gt | 0 | 0.704 | 2.206 | 0.949 | 0.972 |
| lr_kt3 | estimated | tsdf_estimated | 3.371 | 2.838 | 3.907 | 0.481 | 0.834 |
| lr_kt3 | estimated | rtab_estimated | 3.371 | 19.709 | 3.806 | 0.273 | 0.545 |
| lr_kt3 | GT | rtab_gt | 0 | 23.463 | 2.087 | 0.529 | 0.582 |

Shared mapper frames: 228/1240. Completeness uses the same full-sequence clean-depth visible GT reference for every method. Accuracy uses exact GT triangles, deterministic area-weighted samples, and trajectory-only rigid alignment. GT poses were checked against raw native export. No scale fit or independent ICP.
