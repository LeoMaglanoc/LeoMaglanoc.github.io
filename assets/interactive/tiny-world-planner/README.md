# Tiny World Planner browser release

Static CPU/WASM image-goal planning demo. Visit `/tiny-world-planner/` or serve `index.html` over HTTP. The current experimental model uses explicitly pose-supervised CNN keypoints, geometric priors and a learned action-conditioned transition. It is not purely self-supervised or a V-JEPA reproduction.

The default example computes a fresh successful neural plan; general goals remain unreliable. See [training, results and reproduction](../../../tools/tiny-world-planner/README.md). Diagnostic ghost poses never enter MPC costs. Planck 1.3.0 and the site's existing ONNX Runtime Web 1.21.0 assets run locally, without WebGPU or inference APIs.
