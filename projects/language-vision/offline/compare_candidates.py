import json, time, numpy as np, onnxruntime as ort
from common import ASSETS, PROJECT, normalize

opts = ort.SessionOptions()
opts.intra_op_num_threads = 1
f = json.loads((PROJECT / "artifacts/s0-fixtures.json").read_text())
ref = np.array([x["reference"] for x in f])
results = {}
for name in ["s0-fp32", "s0-weight8", "s0-dynamic"]:
    p = PROJECT / f"artifacts/{name}.onnx"
    s = ort.InferenceSession(str(p), opts, providers=["CPUExecutionProvider"])
    out = []
    times = []
    for x in f:
        st = time.perf_counter()
        out.append(
            s.run(None, {"input_ids": np.array([x["tokens"]], dtype=np.int64)})[0][0]
        )
        times.append((time.perf_counter() - st) * 1000)
    cos = np.sum(ref * normalize(np.array(out)), axis=1)
    results[name] = dict(
        meanCosine=float(cos.mean()),
        minCosine=float(cos.min()),
        modelBytes=p.stat().st_size,
        medianWarmMs=float(np.median(times[1:])),
        p95WarmMs=float(np.percentile(times[1:], 95)),
        threads=1,
    )
    print(name, results[name], flush=True)
    del s
f2 = json.loads((ASSETS / "models/parity-fixtures.json").read_text())
ref2 = np.array([x["reference"] for x in f2])
s = ort.InferenceSession(
    str(ASSETS / "models/text-int8.onnx"), opts, providers=["CPUExecutionProvider"]
)
times = []
out = []
for x in f2:
    st = time.perf_counter()
    out.append(
        s.run(None, {"input_ids": np.array([x["tokens"]], dtype=np.int64)})[0][0]
    )
    times.append((time.perf_counter() - st) * 1000)
cos = np.sum(ref2 * normalize(np.array(out)), axis=1)
results["mobileclip2-weight8"] = dict(
    meanCosine=float(cos.mean()),
    minCosine=float(cos.min()),
    modelBytes=(ASSETS / "models/text-int8.onnx").stat().st_size,
    medianWarmMs=float(np.median(times[1:])),
    p95WarmMs=float(np.percentile(times[1:], 95)),
    threads=1,
)
(PROJECT / "evaluation/candidate-comparison.json").write_text(
    json.dumps(results, indent=2) + "\n"
)
print(results, flush=True)
