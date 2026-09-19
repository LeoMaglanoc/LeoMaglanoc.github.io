# Arnold Track-1 policy interface

This is derived from the pinned upstream source and checkpoint—not inferred from the README. It describes a local-only reproduction while redistribution remains blocked; see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Decision contract

| Item | Exact value |
| --- | --- |
| Upstream revision | `86af06d2fdb35c4bf552ecacfe8fe6ac1abd8cd4` |
| Checkpoint | `pretrained/vizdoom_2017_track1.pth` (`08a59e…8d36f`) |
| Native simulation | Doom/ViZDoom, 35 tics/s |
| Frame skip | 3 tics |
| Decision cadence | 11.6667 Hz; 85.714 ms control-step budget |
| Frame history | `hist_size=4`; recurrent evaluation supplies only the newest frame after the initial history is filled |
| Policy | convolutional DQN with one LSTM layer; greedy `argmax` action selection |

## Inputs

### Observation

- ViZDoom `CRCGCB` screen buffer, RGB, channel-first.
- Source render size is 400×225. `process_buffers` resizes it to 108×60 with OpenCV `INTER_AREA`, then transposes to `C,H,W`.
- The policy receives one frame per decision as `float32` values in the original `0…255` range, shape `[1, 1, 3, 60, 108]` (`N,T,C,H,W`). The module divides by 255 internally.
- No grayscale conversion, depth buffer, labels buffer, previous action, or game-feature prediction is an input.

### Game variables

The Track-1 scenario config overrides the general game-variable list; only these two are model inputs:

| ONNX input | Native source | Values | Encoding |
| --- | --- | --- | --- |
| `health` | `HEALTH` | 0–100 | `floor(health / 10)` → 11×32 embedding |
| `selected_ammo` | `SELECTED_WEAPON_AMMO` | 0–300 | direct index → 301×32 embedding |

The exported ONNX contract accepts integer-valued `float32` values and casts them to `int64` inside the graph. This avoids requiring JavaScript `BigInt64Array` inputs without changing native embedding indices.

### Recurrent state

- `hidden_in`: `float32 [1, 1, 512]`
- `cell_in`: `float32 [1, 1, 512]`
- Both are zeroed on a new match and each respawn. They must never be queued, skipped, or reused after a reset.

## Network and outputs

- CNN: `Conv2d(3,32,8,stride=4) → ReLU → Conv2d(32,64,4,stride=2) → ReLU`; flattened output is 4,608 values.
- Two 32-dimensional embeddings concatenate with the CNN output, yielding 4,672 LSTM input values.
- LSTM: one layer, 512 hidden units. Upstream config sets dropout 0.5, but it is inactive in evaluation because there is one recurrent layer and the module is in eval mode.
- `q_values`: `float32 [1,35]`. These are Q-values/action scores, **not probabilities**.
- `aux_features`: `float32 [1,2]`, sigmoid predictions for `target` and `enemy`; they are auxiliary outputs, not inputs.
- `hidden_out`, `cell_out`: `float32 [1,1,512]`.

## Action mapping

The exact upstream declaration is `attack+move_lr;turn_lr;move_fb`, with speed always on and crouch off. `ActionBuilder` generates 35 non-empty combinations in this precise order; the checkpoint output index is that array index:

```text
0 FWD                 1 BACK                2 LEFT TURN
3 LEFT TURN + FWD      4 LEFT TURN + BACK    5 RIGHT TURN
6 RIGHT TURN + FWD     7 RIGHT TURN + BACK   8 ATTACK
9 ATTACK + FWD        10 ATTACK + BACK      11 ATTACK + LEFT TURN
12 ATTACK + LEFT + FWD 13 ATTACK + LEFT + BACK
14 ATTACK + RIGHT TURN 15 ATTACK + RIGHT + FWD 16 ATTACK + RIGHT + BACK
17 STRAFE LEFT        18 STRAFE LEFT + FWD  19 STRAFE LEFT + BACK
20 STRAFE LEFT + LEFT TURN 21 STRAFE LEFT + LEFT + FWD
22 STRAFE LEFT + LEFT + BACK 23 STRAFE LEFT + RIGHT TURN
24 STRAFE LEFT + RIGHT + FWD 25 STRAFE LEFT + RIGHT + BACK
26 STRAFE RIGHT       27 STRAFE RIGHT + FWD 28 STRAFE RIGHT + BACK
29 STRAFE RIGHT + LEFT TURN 30 STRAFE RIGHT + LEFT + FWD
31 STRAFE RIGHT + LEFT + BACK 32 STRAFE RIGHT + RIGHT TURN
33 STRAFE RIGHT + RIGHT + FWD 34 STRAFE RIGHT + RIGHT + BACK
```

`manual_control` is enabled upstream: when movement is absent for 30 decisions or turning is absent for 60 decisions, the environment injects a temporary forward/right-turn escape action. A browser parity implementation must include this behavior or establish that it is not occurring in the native reference trace.
