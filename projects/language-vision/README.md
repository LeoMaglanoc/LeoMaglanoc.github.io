# Language → Vision

A static, open-vocabulary semantic region retrieval experiment for Leo's website. Visitors can type arbitrary text, switch among twelve photographs, and inspect the five most similar stored SAM masks. There is no LLM, server inference, image encoder in the browser, camera, upload, fixed-label classifier or keyword fallback.

Live route: `/language-vision/`. Static assets: `assets/interactive/language-vision/`. The blog's existing demo list links to the route.

## Plan assessment and implementation choices

The plan's architecture is good. Matching checkpoint identity, tokenizer parity and retrieval regression tests matter more than nominal model size. This implementation makes these adjustments from the proposal:

- **MobileCLIP-S0**, selected after testing both S0 and MobileCLIP2-S0 on the development laptop and in Chrome. S0 was faster and smaller with comparable retrieval on this small dataset. Both towers use the official Apple checkpoint, SHA-256 `809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7`.
- **Eight-bit storage for linear/embedding weights, FP32 convolution weights and activations**. Dynamic integer activation quantization damaged embedding alignment: MobileCLIP2-S0 mean cosine 0.980 and S0 mean 0.948 in the initial experiments. We rejected those exports. The deployed model dequantizes constant weights during initialization. It reduces download size; it does not claim integer-only computation or a fourfold reduction in resident memory.
- **Weighted pooling**, `0.4 context + 0.4 isolated + 0.2 masked`, chosen using the selection portion of the query evaluation rather than intuition. Individual view metrics, maximum pooling and untouched holdout results are retained.
- **Twelve scenes / 373 regions**. SAM proposal counts vary from 17 to 53. Some masks describe object parts. The original photographs are up to 1800 px; exact SAM masks are at up to 1024 px, rendered over the same aspect ratio.
- **A physical Android phone was not tested**, as agreed with the user. Chrome desktop and portrait viewport tests verify browser functionality and layout, not phone CPU performance. The public benchmark lets a visitor measure their actual phone.

## Runtime

The main thread owns the UI, scene assets and masks. A dedicated module worker owns the tokenizer, ONNX session, query normalization and dot products. ONNX Runtime Web 1.23.2 is vendored and uses CPU/WASM with one thread, which needs neither WebGPU nor cross-origin isolation headers. Fonts, photographs, tokenizer, model and WASM files are served from this site. Queries are never sent to an inference API.

Search executes on submission or a suggestion chip, not on every keystroke. Each request has an ID; scene changes and newer searches invalidate old results. Worker jobs are serialized. Text remains editable while inference runs. The current query is rerun when scenes change.

Scores are cosine similarities, not probabilities. There is no calibrated rejection threshold: if the requested object is absent, some region will still rank first. Scene-level similarity compares the query with one whole-image vector.

`?debug=1` exposes every stored proposal, region IDs, area, bbox, SAM predicted IoU/stability, the three representation scores, final score and timing. Clicking a ranking or tapping a visible mask selects it. Only needed masks are decoded/cached during normal interaction; debug mode explicitly draws all proposals.

## Reproduce the offline build

From the repository root, with Python 3.10+ and `uv`:

```sh
uv venv projects/language-vision/.venv
uv pip install --python projects/language-vision/.venv/bin/python torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu
SAM2_BUILD_CUDA=0 uv pip install --python projects/language-vision/.venv/bin/python --no-build-isolation -r projects/language-vision/requirements.txt
```

All commands below use that environment:

```sh
PY=projects/language-vision/.venv/bin/python
$PY projects/language-vision/offline/setup_checkpoints.py
$PY projects/language-vision/offline/download_scenes.py
$PY projects/language-vision/offline/build_assets.py
$PY projects/language-vision/offline/export_text_encoder.py
$PY projects/language-vision/offline/quantize_text_encoder.py
$PY projects/language-vision/offline/validate_embeddings.py
$PY projects/language-vision/offline/extra_tokenizer_fixtures.py
$PY projects/language-vision/evaluation/evaluate_retrieval.py
node projects/language-vision/tests.mjs
```

`build_assets.py` skips scenes with an existing manifest; to rebuild, move the scene's generated manifest to the ignored `artifacts/` directory first. `--scene toolkit --points 20` builds just one scene. `reembed_scenes.py` rebuilds matching image embeddings from the exact retained masks without running SAM again. `reference_query.py --scene toolkit --query 'something used to tighten screws'` saves a Python debug overlay in `artifacts/reference.jpg`; `contact_sheets.py` renders every retained mask for inspection.

The checkpoints and source JPEGs are local/ignored. Source URLs, rights and scene dimensions are recorded in `data/scenes.json`. Every scene also includes `debug.webp`. Source and model license texts accompany the deployed assets.

SAM settings: Hiera tiny, SAM 2.1, 20×20 prompt grid, 32 points per batch, predicted IoU ≥0.75, stability ≥0.88, mask fraction 0.002–0.70. Cleanup sorts proposals deterministically by quality, uses bbox overlap before full-mask IoU, removes duplicates above 0.85 IoU or near-identical containment, and retains meaningful nesting. At most 60 proposals survive. Crop views use 15% padding; isolation composites onto gray 128; masked context suppresses surrounding pixels toward gray. All image vectors are L2 normalized from the exact deployed checkpoint.

## File formats

- `manifest.json`: checkpoint identity, image/mask geometry, embedding dimension, region count, normalization and encoding.
- `regions.json`: IDs, bbox (mask-coordinate x/y/width/height), pixel area, fraction, SAM quality and RLE slices.
- `embeddings.bin`: little-endian float32. First vector = whole scene, followed by three vectors per region in context/isolated/masked order. Dimension comes from metadata.
- `masks.bin`: little-endian uint32 run lengths, row-major, starting with a run of zeros (possibly length zero). Each region's `rleOffset` and `rleLength` count uint32 elements, not bytes. Run lengths must sum to mask width × height.
- `models/tokenizer.json`: exact Python CLIP vocabulary, merge ordering, special IDs, context length and HTML entities.

## Validation and benchmarks

`evaluation/prompts.json` contains 60 representative prompts for embedding parity. Another 18 tokenizer cases cover Unicode, contractions, HTML entities, punctuation, whitespace, full-width digits, emoji and truncation. `tests.mjs` checks exact JavaScript/Python token IDs, binary dimensions, normalized vectors, RLE pixel counts and real nearest-region retrieval.

`evaluation/queries.json` has 40 manually inspected prompts across literal, attribute, function, affordance, abstract and difficult categories. Intended region IDs were recorded before pooling selection. Thirty prompts choose the pooling strategy; ten are held out. These are small exploratory measurements, not claims about a general benchmark. Region-part masks are accepted when they depict the intended target. Full result rows and every pooling strategy are retained in `evaluation/`.

The public `benchmark.html` reports download/initialization, first query, 20 warm queries, median/p95, tokenizer parity, browser/Python embedding parity and retrieval agreement across all scenes. It exports JSON. Worker peak memory is explicitly unavailable. Static-server download time is not an internet cold-load estimate.

Candidate comparison: `evaluation/chrome-candidate-comparison.json` records Chrome measurements for both models. `candidate-comparison.json` contains native single-thread CPU measurements made during development (some while preprocessing ran, so do not compare those to idle-browser timings). `mobileclip2-*` files preserve the earlier candidate's evaluation; `s0-retrieval-results.json` holds its matching FP32 image/text evaluation.

To reproduce the candidate browser comparison:

```sh
$PY projects/language-vision/offline/export_s0.py
$PY projects/language-vision/offline/export_candidate_2.py
python3 -m http.server 8765
# Open /projects/language-vision/benchmark-candidates.html
```

Only the selected text tower ships. FP32 ONNX and other candidate exports remain ignored. No Python or Node server is needed after deployment.

## Known failures and remaining work

SAM occasionally proposes background surfaces, clothing/textures or only handles/parts, and misses thin objects. The kitchen scene splits food into many small proposals. A whole object can be absent even though a part is searchable. Nested masks can produce several very similar hits.

Semantic queries can select surprising associations. In particular, “tighten screws” performs poorly on the cluttered electrical-tools close-up, while literal queries and the separated toolkit are easier. Affordance, material and abstract matches do not establish physics or robot safety. Long text is truncated at 77 tokens and the UI reports this. Normal Unicode/tokenizer edge cases are tested; JavaScript does not reproduce every FTFY repair of corrupted mojibake strings.

The phone ≤300 ms target remains **unverified on physical hardware**. Portrait emulation is not a phone benchmark. Future work should first test real Android devices, improve mask curation/crops, then consider activation quantization with calibration. Do not introduce a fake semantic fallback.

See `VALIDATION.md` for the final measured numbers and UI checks, and the deployed `THIRD_PARTY_NOTICES.md` for model, runtime, font and photograph attribution.
