# TinyEgoVLA

A CPU-scale experiment: egocentric human interaction prediction → shared representation → Panda behavioral cloning. Static research exhibit at `/tiny-ego-vla/`.

## Assessment and scope

The original plan's central comparison is sound. Human hand coordinates are supervision for a representation, never robot actions. We preserve the embodiment gap and measure whether pretraining helps rather than assume it does.

Changes based on feasibility evidence:

- MobileCLIP-S0 is selected over MobileCLIP2-S0 after local CPU benchmarks.
- Small EPIC-KITCHENS source videos and supplied hand-object detector outputs avoid gated datasets and SAM processing. MediaPipe supplies 21-joint hand skeletons. Detector contact and matched box motion are noisy pseudo-labels, not manual physical ground truth.
- Official LIBERO spatial tasks: bowl next to plate; bowl next to ramekin. Both place the indicated black bowl onto the plate. Different distractor arrangements mean language grounding cannot be established independently of scene cues.
- Two-step action chunks with four cached image observations. No image encoder training. Runtime browser has no model, API, simulator or training dependency.
- Reinforcement learning is gated behind successful imitation experiments. It must not be implied by the exhibit if it was not performed.

## Layout

`tools/` contains offline scripts; `configs/experiment.json` fixes splits and budgets. `data/`, `artifacts/`, `.venv/`, and `checkpoints/` are local and ignored. Public static assets live in `assets/interactive/tiny-ego-vla/`.

Full environment, run instructions, checkpoint restoration, measured results and validation records will be finalized after experiments complete. The source brief remains in the user's `plan.md` without modification by this implementation.
