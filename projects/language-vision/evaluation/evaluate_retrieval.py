"""Empirical view selection; report untouched holdout separately. No class labels at runtime."""

import json, sys, time, numpy as np, torch, onnxruntime as ort
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "offline"))
from common import PROJECT, ASSETS, load_model, normalize

Q = json.loads((PROJECT / "evaluation/queries.json").read_text())
model, _, tok = load_model()
with torch.inference_mode():
    ref = normalize(model.encode_text(tok([q["query"] for q in Q])).numpy())
opts = ort.SessionOptions()
opts.intra_op_num_threads = 4
session = ort.InferenceSession(
    str(ASSETS / "models/text-int8.onnx"), opts, providers=["CPUExecutionProvider"]
)
quant = normalize(
    np.array(
        [
            session.run(None, {"input_ids": row[None]})[0][0]
            for row in tok([q["query"] for q in Q]).numpy()
        ]
    )
)
cache = {}
for q in Q:
    if q["scene"] in cache:
        continue
    folder = ASSETS / "data" / q["scene"]
    m = json.loads((folder / "manifest.json").read_text())
    e = np.fromfile(folder / "embeddings.bin", dtype="<f4")[
        m["embeddingDim"] :
    ].reshape(m["numRegions"], 3, m["embeddingDim"])
    cache[q["scene"]] = (m, e)
all_results = {}
details = {}
for name, z in [("fp32", ref), ("weight8", quant)]:
    for strategy in ["context", "isolated", "masked", "max", "weighted"]:
        rows = []
        for i, q in enumerate(Q):
            m, e = cache[q["scene"]]
            scores = e @ z[i]
            if strategy in ["context", "isolated", "masked"]:
                scores = scores[:, ["context", "isolated", "masked"].index(strategy)]
            elif strategy == "max":
                scores = scores.max(axis=1)
            else:
                scores = scores @ np.array([0.4, 0.4, 0.2])
            indices = np.argsort(-scores)
            ids = np.array(m.get("regionIds", list(range(1, m["numRegions"] + 1))))[
                indices
            ]
            rank = next(
                (n + 1 for n, r in enumerate(ids) if r in q["acceptableRegions"]),
                len(ids) + 1,
            )
            rows.append(dict(**q, top5=ids[:5].tolist(), rank=rank))
        summary = {}
        for split in ["selection", "holdout", "all"]:
            subset = [r for r in rows if split == "all" or r["split"] == split]
            summary[split] = dict(
                queries=len(subset),
                recallAt1=sum(r["rank"] == 1 for r in subset) / len(subset),
                recallAt3=sum(r["rank"] <= 3 for r in subset) / len(subset),
                MRR=sum(1 / r["rank"] for r in subset) / len(subset),
            )
        all_results[name + "-" + strategy] = summary
        details[name + "-" + strategy] = rows
best = max(
    ["max", "weighted"],
    key=lambda strategy: all_results["weight8-" + strategy]["selection"]["MRR"],
)
p = ASSETS / "models/model.json"
meta = json.loads(p.read_text())
meta["scoringStrategy"] = best
p.write_text(json.dumps(meta, indent=2) + "\n")
result = dict(
    model=meta["model"],
    datasetNote="40 manually inspected prompts. Exploratory view selection on 30 prompts; 10 held out. Region-part masks accepted when they depict the target.",
    selectedStrategy=best,
    metrics=all_results,
)
(PROJECT / "evaluation/retrieval-results.json").write_text(
    json.dumps(result, indent=2) + "\n"
)
(PROJECT / "evaluation/retrieval-details.json").write_text(
    json.dumps(details, indent=2) + "\n"
)
print(json.dumps(result, indent=2))
