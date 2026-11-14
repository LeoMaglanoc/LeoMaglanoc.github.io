# Tiny World Planner browser release

Static CPU/WASM demo. Open `index.html` through an HTTP server or visit `/tiny-world-planner/` on the website. The application uses Planck 1.3.0 and the site's existing ONNX Runtime Web 1.21.0 assets.

Training, reproducible Docker commands, measured results, scientific boundaries and limitations are in [`tools/tiny-world-planner`](../../../tools/tiny-world-planner/README.md). The released model is **experimental and partly pose-supervised**, not a V-JEPA 2 reproduction. Diagnostic ghost poses never contribute to MPC costs.
