import json, numpy as np, onnx, onnxruntime as ort, time
from onnxruntime.quantization import quantize_dynamic, QuantType
from common import ASSETS, PROJECT, normalize

f = json.loads((ASSETS / "models/parity-fixtures.json").read_text())
ref = np.array([x["reference"] for x in f])
tokens = np.array([x["tokens"] for x in f], dtype=np.int64)
options = ort.SessionOptions()
options.intra_op_num_threads = 4
for name, ops in [("gather", ["Gather"]), ("matmul", ["MatMul"])]:
    p = PROJECT / f"artifacts/text-{name}.onnx"
    quantize_dynamic(
        str(PROJECT / "artifacts/text-fp32.onnx"),
        str(p),
        weight_type=QuantType.QUInt8,
        per_channel=True,
        op_types_to_quantize=ops,
    )
    session = ort.InferenceSession(str(p), options, providers=["CPUExecutionProvider"])
    out = []
    for t in tokens:
        out.append(session.run(None, {"input_ids": t[None]})[0][0])
    z = normalize(np.array(out))
    cos = np.sum(ref * z, axis=1)
    print(
        name,
        "mean",
        cos.mean(),
        "min",
        cos.min(),
        "bytes",
        p.stat().st_size,
        flush=True,
    )
    del session
