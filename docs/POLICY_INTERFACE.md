# Unitree G1 policy interface

The browser demo uses the contract in Unitree Robotics' `deploy/deploy_mujoco/deploy_mujoco.py` and `deploy/deploy_mujoco/configs/g1.yaml`.

| Field | Value |
| --- | --- |
| Observation dimension | 47 |
| Action dimension | 12 |
| MuJoCo timestep | 0.002 s / 500 Hz |
| Policy update | every 10 physics steps / 50 Hz |
| Gait period | 0.8 s |

## Observation layout

| Indices | Contents | Scaling |
| --- | --- | --- |
| `0:3` | base angular velocity | `0.25` |
| `3:6` | projected gravity | none |
| `6:9` | command `[vx, vy, yaw]` | `[2, 2, 0.25]` |
| `9:21` | leg joint position error | `1.0` |
| `21:33` | leg joint velocity | `0.05` |
| `33:45` | previous 12-element action | none |
| `45:47` | `[sin(phase), cos(phase)]` | phase period `0.8 s` |

The joint order is left hip pitch/roll/yaw, left knee, left ankle pitch/roll, followed by the corresponding right-leg joints. Actions are transformed into target positions as:

```text
target_q = default_angles + 0.25 * action
```

The default angles are:

```text
[-0.1, 0, 0, 0.3, -0.2, 0,
 -0.1, 0, 0, 0.3, -0.2, 0]
```

The PD command is:

```text
tau = kp * (target_q - q) + kd * (0 - dq)
```

with:

```text
kp = [100, 100, 100, 150, 40, 40, 100, 100, 100, 150, 40, 40]
kd = [2, 2, 2, 4, 2, 2, 2, 2, 2, 4, 2, 2]
```

The source model is the official G1 12-DoF scene, not the 29-DoF model. The ONNX artifact is generated from Unitree's TorchScript actor with `tools/export_policy.py`; `tools/validate_policy.py` checks 1,000 seeded random observations against the TorchScript output.

The actor includes a 64-unit LSTM. The browser artifact makes that state explicit so each inference receives `hidden` and `cell` tensors shaped `[1, 1, 64]` and returns `next_hidden` and `next_cell` alongside the 12 actions. Resetting the simulation clears both tensors.
