# Native MPC benchmark

CPU: Intel(R) Core(TM) i7-8565U CPU @ 1.80GHz; Python 3.12.15; CasADi 3.6.7; Pinocchio 3.3.0; Fatrop bundled plugin.

Unmodified upstream OCP, 14 nodes, 3 torque nodes, warm start, 15–80 ms horizon steps. State advances with the upstream predicted next state; this is not a physics closed loop.

| Gait | First ms | Median ms | p95 ms | Max violation |
|---|---:|---:|---:|---:|
| stand | 84.26 | 61.56 | 106.00 | 1.62334e-06 |
| walk | 414.17 | 213.85 | 694.41 | 7.9856e-06 |
| trot | 97.30 | 109.16 | 160.10 | 2.68156e-06 |
