# ICL-NUIM lr_kt2 — synthetic benchmark

| Sequence | Poses | Mapper | ATE cm | Accuracy cm | Completeness cm | F@2cm | F@5cm |
|---|---|---|---:|---:|---:|---:|---:|
| lr_kt2 | GT | tsdf_clean_gt | 0 | 0.210 | 3.356 | 0.941 | 0.952 |
| lr_kt2 | GT | tsdf_gt | 0 | 1.042 | 3.818 | 0.852 | 0.952 |
| lr_kt2 | estimated | tsdf_estimated | 1.819 | 2.084 | 4.546 | 0.614 | 0.905 |
| lr_kt2 | estimated | rtab_estimated | 1.819 | 19.976 | 4.529 | 0.366 | 0.588 |
| lr_kt2 | GT | rtab_gt | 0 | 20.844 | 3.749 | 0.512 | 0.622 |

Shared mapper frames: 119/880. Completeness uses the same full-sequence clean-depth visible GT reference for every method. Accuracy uses exact GT triangles, deterministic area-weighted samples, and trajectory-only rigid alignment. GT poses were checked against raw native export. No scale fit or independent ICP.
