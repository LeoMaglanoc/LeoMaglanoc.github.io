# G1 baseline — 2026-10-06

Before modifying the website:

- `node --test projects/g1/tests/*.mjs`: input and heading-relative push suites pass.
- Docker `g1-site` serves the published assets on localhost:8000.
- Chrome: policy and MuJoCo load, robot renders and stays upright at rest.
- Push left increments the push count; Pause changes to Resume; Reset clears distance, walk time and pushes.
- Portrait 390×844: robot and touch controls render within the viewport; reset/pause and push buttons remain visible.
- The input test covers keyboard focus, touch press/release and cancellation. Sustained directional motion still needs a final interactive regression check.

The new shell should reuse the existing G1 page and controller without modifications. Switching away should unload its frame to stop the independent physics/inference loop.
