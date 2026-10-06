# Validation — 6 October 2026

The plan is sound: expensive segmentation and image embeddings belong offline, with only matching text inference in the browser. The implementation keeps that architecture and chooses S0 plus partial weight quantization after measuring both candidates.

## Deployed configuration

| Item                  | Result                                                               |
| --------------------- | -------------------------------------------------------------------- |
| Model                 | MobileCLIP-S0, matching Apple image/text checkpoint                  |
| Storage / compute     | UINT8 linear and embedding weights; FP32 convolution and activations |
| Model bytes           | 55,519,555 (53.0 MiB)                                                |
| Execution             | ONNX Runtime Web 1.23.2, CPU/WASM, one thread, Web Worker            |
| Scenes / regions      | 12 / 373                                                             |
| Pooling               | 0.4 context + 0.4 isolated + 0.2 masked                              |
| Physical phone tested | No; Chrome portrait emulation agreed with user                       |

## Chrome measurements

Intel i7-8565U, Linux x86_64, Chrome 154, 1440 × 1000 viewport. Exact measurements and 20 individual warm latencies are in `evaluation/chrome-final.json`.

| Measurement                               | Result                      |
| ----------------------------------------- | --------------------------- |
| Local static-server model transfer        | 412 ms                      |
| Session initialization                    | 1,732 ms                    |
| First inference                           | 267 ms                      |
| Median of 20 warm queries                 | 231 ms                      |
| Warm p95                                  | 254 ms                      |
| Tokenizer parity                          | 60 / 60 exact               |
| Mean / minimum embedding cosine vs Python | 0.999902 / 0.999857         |
| Top-1 retrieval agreement                 | 98.75% over 720 comparisons |
| Top-3 overlap                             | 99.17%                      |
| Worker peak memory                        | Unavailable                 |

This final run overlapped a site build. The earlier idle candidate comparison measured S0 median 191 ms / p95 205 ms and MobileCLIP2-S0 median 275 ms / p95 294 ms. Both reports are retained. Local transfer timing is **not an internet cold-load measurement**. No Android latency or phone-memory claim is made; the ≤300 ms phone target is unverified.

The 60-query native PyTorch/ONNX validation agrees with the browser measurements. Nine top-1 changes had FP32 margins below 0.0004; these are near ties rather than large embedding drift. Dynamic activation quantization failed the fidelity gate and was rejected.

## Retrieval evaluation

Forty manually inspected prompts across literal, property, functional, affordance, abstract and difficult categories. Thirty select pooling and ten are held out. These small, curated scene-specific results are exploratory, not a general accuracy benchmark.

| Split          | Recall@1 | Recall@3 | MRR   |
| -------------- | -------- | -------- | ----- |
| Selection (30) | 73.3%    | 86.7%    | 0.810 |
| Holdout (10)   | 50.0%    | 80.0%    | 0.645 |
| All (40)       | 67.5%    | 85.0%    | 0.769 |

See `evaluation/retrieval-results.json` and `retrieval-details.json` for every view/pooling strategy and query. Background proposals, object parts, thin-object misses and semantic association errors remain visible; the site documents them.

## Checks

- `node projects/language-vision/tests.mjs`: PASS, including 78 Python/JavaScript tokenizer fixtures, all 373 RLE mask reconstructions, embedding normalization and dimensions, and real nearest-region retrieval.
- Chrome desktop 1440 × 1000 and portrait 390 × 844 / 320 × 568: input, arbitrary query submission, exact overlay alignment, ranking selection, scene switching with retained query, natural scrolling, and no horizontal page overflow.
- Chrome debug mode: all retained masks, clickable region IDs, bbox/area/SAM scores and individual embedding-view scores.
- Overlay toggle and expanded photo view work; loading shows byte progress and the text field remains editable.
- Production Jekyll excludes the generated tokenizer/runtime assets from minification so their bytes remain intact.

No physical Android phone, real touch interaction, phone thermal throttling, mobile-network cold load, or reliable peak worker memory was tested. The public benchmark is available for those measurements.

The production Jekyll build completed successfully. The stable-route checker passed all 19 demo URLs and 82 HTML dependencies after including the existing separately built SLAM viewer. Every Language → Vision runtime asset was hash-checked against the generated site and remained byte-identical; the generated blog contains the new demo link. Chrome also executed queries through the generated `/language-vision/` iframe route.
