# Ask Leo model comparison log

Run this log on the target WebGPU browser rather than treating a server or CPU result as representative.

| Metric | SmolLM2 135M | SmolLM2 360M | Qwen3 0.6B |
| --- | ---: | ---: | ---: |
| q4f16 first download | ~117 MB | ~272 MB | ~570 MB |
| Browser / GPU tested | pending | pending | pending |
| Model loads successfully | pending | pending | pending |
| Warm first-token latency | pending | pending | pending |
| Tokens/sec | pending | pending | pending |
| Grounded answers (of 42) | pending | pending | pending |
| Obvious fabricated claims | pending | pending | pending |
| Correct unknown/privacy refusals | pending | pending | pending |
| Useful synthesis | pending | pending | pending |
| Notes | pending | pending | pending |

The currently shipped default is the 360M model, pending this hardware-dependent comparison. Do not replace it solely because a candidate is larger.
