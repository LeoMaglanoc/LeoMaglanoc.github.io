# ICL-NUIM lr_kt0 — synthetic benchmark

| Sequence | Poses | Mapper | ATE cm | Accuracy cm | Completeness cm | F@2cm | F@5cm |
|---|---|---|---:|---:|---:|---:|---:|
| lr_kt0 | GT | tsdf_clean_gt | 0 | 0.363 | 0.484 | 0.986 | 0.992 |
| lr_kt0 | GT | tsdf_gt | 0 | 1.023 | 1.275 | 0.861 | 0.990 |
| lr_kt0 | estimated | tsdf_estimated | 0.772 | 1.651 | 1.906 | 0.645 | 0.989 |
| lr_kt0 | estimated | rtab_estimated | 0.772 | 21.272 | 1.809 | 0.372 | 0.595 |
| lr_kt0 | GT | rtab_gt | 0 | 21.672 | 1.612 | 0.447 | 0.630 |

Shared mapper frames: 212/1508. Completeness uses the same full-sequence clean-depth visible GT reference for every method. Accuracy uses exact GT triangles, deterministic area-weighted samples, and trajectory-only rigid alignment. GT poses were checked against raw native export. No scale fit or independent ICP.
