# G1 Locomotion Playground

Browser-native simulation of a Unitree G1 locomotion policy. A PPO actor exported to ONNX maps proprioceptive state and commanded velocity to joint-position targets; a high-rate PD controller converts those targets to torques inside MuJoCo, while Three.js renders the result.

Everything runs locally in the browser—no inference server or simulation backend.

## Pipeline

```text
keyboard / touch
desired [vx, vy, yaw]
        │
        ▼
┌───────────────────────────────┐
│      47-D observation         │
│                               │
│ base angular velocity         │
│ gravity orientation           │
│ velocity command              │
│ joint position errors         │
│ joint velocities              │
│ previous action               │
│ gait phase                    │
└───────────────────────────────┘
        │
        ▼
 PPO locomotion actor
 ONNX Runtime Web
       @ 50 Hz
        │
        ▼
12 normalized actions
        │
        ▼
12 target joint positions
        │
        ▼
 PD controller @ 500 Hz
τ = Kp(q_target - q) - Kd q̇
        │
        ▼
 MuJoCo WASM physics
        │
        ├──────────────► next observation
        │
        ▼
 Three.js renderer
```

The policy produces position targets; the PD controller produces torques; physics produces the next state.

## Tech stack

Browser runtime

- JavaScript ES modules
- MuJoCo WebAssembly
- ONNX Runtime Web
- Three.js + OrbitControls

Policy / control

- PPO locomotion policy
- 47-D proprioceptive observation
- 12-DoF lower-body action space
- 50 Hz policy
- 500 Hz PD / physics loop

Offline tooling

- Python
- PyTorch
- ONNX
- Docker

## Running locally

Open `/g1/` on the website, or serve the repository locally with Docker:

```bash
docker compose -f assets/interactive/g1/docker-compose.yml up g1-site
# open http://localhost:8000/assets/interactive/g1/
```

The Docker tooling is also the reproducible path for model export and native reference traces:

```bash
docker compose -f assets/interactive/g1/docker-compose.yml build g1-tools
docker compose -f assets/interactive/g1/docker-compose.yml run --rm g1-tools \
  python assets/interactive/g1/tools/export_policy.py
docker compose -f assets/interactive/g1/docker-compose.yml run --rm g1-tools \
  python assets/interactive/g1/tools/validate_policy.py
docker compose -f assets/interactive/g1/docker-compose.yml run --rm g1-tools \
  python assets/interactive/g1/tools/reference_rollout.py
```

The shipped policy is Unitree's `deploy/pre_train/g1/motion.pt`, exported once to `models/policy.onnx`. The policy contract is documented in [`docs/POLICY_INTERFACE.md`](../../../docs/POLICY_INTERFACE.md).

## Runtime contract

The browser implementation mirrors Unitree's deployment contract: a 47-element observation is evaluated at 50 Hz, while the 12-DoF MuJoCo model and PD controller step at 500 Hz.

Controls are W/A/S/D or the arrow keys for forward, strafe-left, backward, and strafe-right movement; Q/E turn. On phones, use the touch controls shown in the simulator. With no key held, the robot settles in place. Space pauses; Backspace or Reset restores the initial state. Push buttons apply a short horizontal force to the pelvis.

## Scope and limitations

The browser controller mirrors Unitree's supplied MuJoCo deployment contract. It does not claim bit-for-bit long-horizon physics parity across MuJoCo builds or browsers; the offline exporter and native trace tool provide the observation/action contract used for debugging. The supplied policy is most reliable near the commands used during its original deployment.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for attribution and license information.
