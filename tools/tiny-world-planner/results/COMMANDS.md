# Actual experiment record

Date: 2026-11-14. Repository starting revision: `e563ba4dcb8aa664d757d994113ec2b5dcbfcfab`.

Local host: Linux x86_64, AMD EPYC 9V45. Python 3.12, PyTorch 2.5.1+cpu, ONNX 1.17.0, native ONNX Runtime 1.20.1, ONNX Runtime Web 1.21.0, Node 24.22.1, Planck 1.3.0. Training explicitly sets four Torch threads. WASM uses one thread.

1. Physics tests: `node --test tools/tiny-world-planner/tests/*.test.mjs`.
2. Initial smoke collection/training: 500 episodes ×80 actions, 500 VICReg steps/stream, 1000 auxiliary pose steps/stream, 3500 dynamics steps. Hard binary silhouettes. Insufficient probe accuracy; superseded.
3. Development experiment v1: 700×80, hard silhouettes, 500 VICReg steps/stream, 4000 auxiliary pose steps/stream, 3500 dynamics steps. Training report and the development planning rows are archived under `experiment-v1`. The archived planning file is a progress snapshot, not a complete three-difficulty benchmark; its 50 easy MPC episodes are complete.
4. Development experiment v2: same hard-mask dataset, 8000 auxiliary steps/stream, stronger position regression and pairwise pose-metric loss. Training report archived under `experiment-v2`.
5. Released run: `node generate.mjs 700 80 local-data`, then `python -u train/train.py > results/training.log 2>&1`. Uses shared antialiased sensor v2, true contact labels, 500 VICReg steps/stream, 8000 auxiliary pose/metric steps/stream, 3500 dynamics steps, 1300 diagnostic steps. No GPU training.
6. `python eval/baseline.py`: privileged learned numerical-state predictor, offline only.
7. `node eval/parity.mjs`: exported encoders and dynamics against PyTorch fixtures through ONNX Runtime Web WASM.
8. `node eval/planning.mjs 50 100 lite`: final reserved seeds 920000–920049, all three difficulties, paired random/MPC episodes. Previous development seeds were 900000 onward; ablations use 901000–901009.
9. `node eval/ablations.mjs`: horizon, candidate count and warm-start experiments, ten development seeds/configuration.
10. `CHROME_BIN=/tmp/chrome-shell/chrome-headless-shell-linux64/chrome-headless-shell node eval/browser.mjs`: Chrome for Testing 143.0.7499.4, desktop/portrait/landscape. Binary obtained from Google's official Chrome for Testing distribution. Touch viewport tests are emulated, not physical-phone timings.
11. `python eval/summarize.py`: plots and measured result summary from JSON, no manually invented results.

Docker was unavailable locally (no executable or daemon socket). The committed GitHub Actions workflow builds and runs the Docker `validate` target. Its actual workflow outcome must be checked separately; the presence of a Dockerfile is not a successful container test.

Raw datasets, NumPy arrays and PyTorch checkpoints are not committed. ONNX models include checkpoint/model hashes in metadata. This release deliberately retains a failed reliability gate rather than replacing neural planning with a privileged solver.
