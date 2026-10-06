"""Validate PyTorch / FP32 ONNX / INT8, with real region ranking regressions."""

import json, time, numpy as np, torch, onnxruntime as ort
from common import PROJECT, ASSETS, load_model, normalize


def main():
    model, _, tokenizer = load_model()
    queries = json.loads((PROJECT / "evaluation/prompts.json").read_text())
    tokens = tokenizer(queries)
    with torch.inference_mode():
        ref = normalize(model.encode_text(tokens).numpy())
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    fp = ort.InferenceSession(
        str(PROJECT / "artifacts/text-fp32.onnx"),
        options,
        providers=["CPUExecutionProvider"],
    )
    qi = ort.InferenceSession(
        str(ASSETS / "models/text-int8.onnx"),
        options,
        providers=["CPUExecutionProvider"],
    )
    outputs = []
    latencies = []
    for session in [fp, qi]:
        emb = []
        times = []
        for row in tokens.numpy():
            start = time.perf_counter()
            emb.append(session.run(None, {"input_ids": row[None]})[0][0])
            times.append((time.perf_counter() - start) * 1000)
        outputs.append(normalize(np.array(emb)))
        latencies.append(times)
    fpz, qz = outputs
    results = dict(
        model=__import__("common").MODEL,
        queries=len(queries),
        fp32MeanCosine=float(np.mean(np.sum(ref * fpz, axis=1))),
        quantizedMeanCosine=float(np.mean(np.sum(ref * qz, axis=1))),
        quantizedMinCosine=float(np.min(np.sum(ref * qz, axis=1))),
        maxAbsError=float(np.max(np.abs(ref - qz))),
        nativeWarmMedianMs=float(np.median(latencies[1][1:])),
        nativeWarmP95Ms=float(np.percentile(latencies[1][1:], 95)),
        modelBytes=(ASSETS / "models/text-int8.onnx").stat().st_size,
    )
    regression = []
    same = []
    overlap = []
    for manifest in sorted((ASSETS / "data").glob("*/manifest.json")):
        m = json.loads(manifest.read_text())
        e = np.fromfile(manifest.parent / "embeddings.bin", dtype="<f4")[
            m["embeddingDim"] :
        ].reshape(m["numRegions"], 3, m["embeddingDim"])
        strategy = json.loads((ASSETS / "models/model.json").read_text()).get(
            "scoringStrategy", "max"
        )
        av = np.einsum("qd,rvd->qrv", ref, e)
        bv = np.einsum("qd,rvd->qrv", qz, e)
        a = (
            av @ np.array([0.4, 0.4, 0.2])
            if strategy == "weighted"
            else av.max(axis=-1)
        )
        b = (
            bv @ np.array([0.4, 0.4, 0.2])
            if strategy == "weighted"
            else bv.max(axis=-1)
        )
        results["scoringStrategy"] = strategy
        for n, query in enumerate(queries):
            ra = np.argsort(-a[n])
            rb = np.argsort(-b[n])
            same.append(ra[0] == rb[0])
            overlap.append(len(set(ra[:3]) & set(rb[:3])) / 3)
            if ra[0] != rb[0]:
                regression.append(
                    dict(
                        scene=m["sceneId"],
                        query=query,
                        reference=int(ra[0]) + 1,
                        quantized=int(rb[0]) + 1,
                        referenceGap=float(a[n, ra[0]] - a[n, rb[0]]),
                    )
                )
    if same:
        results.update(
            top1Agreement=float(np.mean(same)),
            top3Overlap=float(np.mean(overlap)),
            rankingComparisons=len(same),
            regressions=regression,
        )
    (PROJECT / "evaluation/parity-results.json").write_text(
        json.dumps(results, indent=2) + "\n"
    )
    fixtures = [
        dict(query=q, tokens=t.tolist(), reference=r.tolist(), quantized=z.tolist())
        for q, t, r, z in zip(queries, tokens, ref, qz)
    ]
    (ASSETS / "models/parity-fixtures.json").write_text(
        json.dumps(fixtures, separators=(",", ":")) + "\n"
    )
    print(json.dumps(results, indent=2))
    assert results["fp32MeanCosine"] > 0.9999
    assert results["quantizedMeanCosine"] > 0.99


if __name__ == "__main__":
    main()
