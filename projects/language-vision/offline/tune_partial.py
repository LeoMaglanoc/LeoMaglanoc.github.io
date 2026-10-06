import json, numpy as np, onnx, onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType
from common import ASSETS, PROJECT, normalize

m = onnx.load(str(PROJECT / "artifacts/text-fp32.onnx"))
exclude = [n.name for n in m.graph.node if n.op_type == "MatMul" and "/attn/" in n.name]
f = json.loads((ASSETS / "models/parity-fixtures.json").read_text())
ref = np.array([x["reference"] for x in f])
opts = ort.SessionOptions()
opts.intra_op_num_threads = 4
p = PROJECT / "artifacts/text-partial.onnx"
quantize_dynamic(
    str(PROJECT / "artifacts/text-fp32.onnx"),
    str(p),
    weight_type=QuantType.QUInt8,
    per_channel=True,
    op_types_to_quantize=["MatMul", "Gather"],
    nodes_to_exclude=exclude,
)
s = ort.InferenceSession(str(p), opts, providers=["CPUExecutionProvider"])
out = []
for x in f:
    out.append(
        s.run(None, {"input_ids": np.array([x["tokens"]], dtype=np.int64)})[0][0]
    )
cos = np.sum(ref * normalize(np.array(out)), axis=1)
print(
    "partial mean", cos.mean(), "min", cos.min(), "bytes", p.stat().st_size, flush=True
)
