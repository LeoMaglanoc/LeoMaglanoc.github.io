# G1 Locomotion Playground

This is a fullscreen, fully static browser demo of Unitree's G1 12-DoF locomotion stack. It runs the MuJoCo simulation, ONNX policy, observation builder, and PD controller in the visitor's browser; there is no inference server or WebSocket backend.

The playground has a large flat locomotion area plus an optional rough-terrain section with low uneven blocks, a shallow ramp, and wide low steps. The existing policy and controller are unchanged, so the obstacles are there to explore and stress-test rather than to guarantee success.

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

```text
desired velocity [vx, vy, yaw]
        ↓
47-element observation
        ↓
Unitree PPO actor (ONNX Runtime Web)
        ↓
12 scaled target joint positions
        ↓
PD controller at 500 Hz
        ↓
MuJoCo G1 12-DoF model
```

Controls are W/A/S/D or the arrow keys for forward, strafe-left, backward, and strafe-right movement; Q/E turn. On phones, use the touch controls shown in the simulator. With no key held, the robot settles in place. Space pauses; Backspace or Reset restores the initial state. Push buttons apply a short horizontal force to the pelvis.

## Scope and limitations

The browser controller mirrors Unitree's supplied MuJoCo deployment contract. It does not claim bit-for-bit long-horizon physics parity across MuJoCo builds or browsers; the offline exporter and native trace tool provide the observation/action contract used for debugging. The supplied policy is most reliable near the commands used during its original deployment.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for attribution and license information.
