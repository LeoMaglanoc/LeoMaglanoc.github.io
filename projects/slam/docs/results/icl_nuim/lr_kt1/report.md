# ICL-NUIM lr_kt1 — synthetic benchmark

| Sequence | Poses | Mapper | ATE cm | Accuracy cm | Completeness cm | F@2cm | F@5cm |
|---|---|---|---:|---:|---:|---:|---:|
| lr_kt1 | GT | tsdf_clean_gt | 0 | 0.361 | 2.326 | 0.972 | 0.979 |
| lr_kt1 | GT | tsdf_gt | 0 | 0.888 | 2.768 | 0.942 | 0.978 |
| lr_kt1 | estimated | tsdf_estimated | 1.895 | 2.205 | 4.203 | 0.516 | 0.882 |
| lr_kt1 | estimated | rtab_estimated | 1.895 | 32.728 | 4.033 | 0.276 | 0.467 |
| lr_kt1 | GT | rtab_gt | 0 | 30.187 | 2.695 | 0.509 | 0.559 |

Shared mapper frames: 124/965. Completeness uses the same full-sequence clean-depth visible GT reference for every method. Accuracy uses exact GT triangles, deterministic area-weighted samples, and trajectory-only rigid alignment. GT poses were checked against raw native export. No scale fit or independent ICP.
