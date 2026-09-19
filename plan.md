Continue the AI Doom project. **Do not treat Arnold licensing as a blocking gate anymore.**

For this MVP, assume we are permitted to use and convert the publicly available Arnold Track-1 pretrained checkpoint. Keep proper attribution to the Arnold authors and retain a brief note in `THIRD_PARTY_NOTICES.md` that the upstream repository has no explicit license, but **do not stop implementation or deployment work because of this**.

The ML side is already solved:

* native Arnold Track-1 vs 10 bots works;
* 512-observation validation completed;
* 0 greedy-action mismatches;
* maximum ONNX error ≈ 6.1e-05;
* CPU p95 inference ≈ 1.97 ms;
* exact recurrent policy contract documented.

Do not redo this work unnecessarily.

## Next priority: make the browser game work

Evaluate and integrate:

`https://github.com/mungus43/tomb-engine`

This is a GZDoom 4.11.3 WebAssembly browser port with Web Worker + OffscreenCanvas rendering, keyboard/mouse forwarding, FreeDM support, and a working browser runtime.

GZDoom includes built-in bot support. The target remains:

**Arnold Track-1 policy vs 10 built-in Doom bots**

### Step 1 — browser deathmatch without Arnold

First get GZDoom WASM running locally with:

* FreeDM;
* deathmatch mode;
* player;
* built-in bots;
* ultimately 10 bots;
* deaths and respawns;
* stable browser rendering.

Do this before integrating ONNX.

If necessary, minimally extend the WASM/browser harness to invoke GZDoom bot commands such as `addbot`.

### Step 2 — expose the minimum state Arnold needs

Create a small browser/engine bridge exposing only:

* RGB framebuffer / rendered observation;
* player health;
* selected weapon ammo.

And an action interface for:

* forward;
* backward;
* strafe left/right;
* turn left/right;
* attack.

Do not recreate ViZDoom as a giant API.

### Step 3 — connect Arnold ONNX

Reuse the already validated ONNX export and exact policy contract:

```text
GZDoom WASM
    ↓
RGB frame + health + ammo
    ↓
108×60 Arnold preprocessing
    ↓
Arnold ONNX + LSTM state
    ↓
35 Q-values
    ↓
argmax
    ↓
exact Arnold action mapping
    ↓
GZDoom controls
```

Preserve:

* frame skip / ~11.67 Hz decision cadence;
* health encoding;
* selected-ammo encoding;
* hidden/cell state;
* respawn recurrent reset;
* exact 35-action ordering;
* Arnold manual-control escape behavior where applicable.

Do not retrain or fine-tune.

### Step 4 — test whether the policy actually works

Run Arnold against 10 bots for several minutes in the browser.

Measure:

* kills;
* deaths;
* action diversity;
* stuck/wall time;
* FPS;
* inference median/p95;
* effective policy frequency.

This browser environment does not need to exactly reproduce the original Track-1 WAD if Arnold remains visibly competent.

If using FreeDM/GZDoom rather than the original competition environment, describe the demo accurately as:

> A pretrained ViZDoom visual RL policy deployed into browser-native GZDoom against built-in bots.

Do not claim exact Track-1 environment reproduction unless it actually is exact.

### Step 5 — if Arnold performs poorly

Before abandoning it, investigate environment mismatch:

* FOV;
* HUD;
* resolution/aspect ratio;
* weapon rendering;
* movement/turning speed;
* action timing;
* frame skip;
* ammo semantics;
* map;
* bot configuration.

Try to configure the environment closer to the native Arnold setup.

Do **not** retrain.

If it still fails badly after reasonable compatibility work, document why and report back before switching policies.

## Once Arnold works in browser

Immediately continue with the original UI implementation.

### Default mode

On game start:

**AI CONTROL**

Arnold plays automatically.

### Human takeover

Provide:

**TAKE CONTROL**

Human takes over the existing game state without restarting.

Also provide:

**RETURN TO AI**

Keep Arnold running in shadow mode during human control if performance permits so its recurrent state remains synchronized.

### Reset

Visible:

**RESET MATCH**

Reset:

* game;
* bots;
* player;
* score;
* frame history;
* LSTM hidden/cell state;
* telemetry.

Return to AI mode after reset.

### Desktop

Use:

* WASD movement;
* mouse aiming;
* left-click shooting;
* pointer lock.

### Phone

Landscape only.

Portrait → show a full-screen rotate-phone message.

In landscape:

* left thumb: movement joystick;
* right half of screen: swipe/drag aiming;
* bottom-right: FIRE;
* only expose additional buttons that the environment genuinely needs.

Support simultaneous move + aim + shoot.

### UI

Take inspiration from existing:

* `assets/interactive/g1/`
* `assets/interactive/pong/`

Game fills the viewport.

Use sparse translucent HUD elements showing approximately:

```text
AI DOOM / RL CONTROL

FRAGS
DEATHS
HEALTH
AMMO

AI CONTROL / YOU CONTROL

Policy ~11.7 Hz
Inference X ms
Local / WASM
```

Optionally provide a collapsible action-score inspector showing the 35 Arnold Q-values. Label them **Q-values / action scores**, not probabilities.

## Testing

Do real browser tests.

Use Playwright for:

* AI starts by default;
* game changes over time;
* policy produces actions;
* TAKE CONTROL works;
* keyboard/mouse control works;
* RETURN TO AI works;
* RESET works repeatedly;
* mobile landscape layout;
* touch move + aim + shoot;
* no console errors.

Run a several-minute AI soak test and verify:

* no inference backlog;
* no runaway memory growth;
* no duplicate loops after resets;
* policy remains responsive.

Also test on a real Android phone before calling mobile support complete.

## Website integration

Once the browser game is demonstrably working:

* add standalone implementation under `assets/interactive/doom/`;
* add `/doom/` fullscreen wrapper similar to `/g1/`;
* add AI Doom to the existing Interactive WebApp-AI Demos homepage section;
* preserve existing G1, Pong, and SLAM entries.

Attribution should clearly say the pretrained policy comes from Arnold / the ViZDoom work and that this project implements browser deployment/integration.

**Do not stop again merely because Arnold lacks an explicit license. For this MVP, proceed under the assumption that policy use is acceptable.**
