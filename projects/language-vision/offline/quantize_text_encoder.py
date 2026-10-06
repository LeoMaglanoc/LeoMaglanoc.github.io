"""8-bit weight-only quantization. FP32 activations preserve MobileCLIP fidelity.

ORT folds constant dequantization at initialization. This reduces download size,
not resident weight memory; it does NOT claim integer-only execution.
"""

import json, onnx, numpy as np
from onnx import numpy_helper, helper, TensorProto
from common import PROJECT, ASSETS


def quantize(source, target):
    graph = onnx.load(str(source))
    initializers = {x.name: x for x in graph.graph.initializer}
    quantized = {}
    new_nodes = []
    for node in graph.graph.node:
        index = (
            1
            if node.op_type in ("MatMul", "Gemm")
            else 0
            if node.op_type == "Gather"
            else None
        )
        if index is not None and node.input[index] in initializers:
            name = node.input[index]
            weight = numpy_helper.to_array(initializers[name])
            if weight.dtype == np.float32 and weight.ndim == 2:
                if name not in quantized:
                    # Per output channel, affine UINT8 weights.
                    lo = weight.min(axis=0)
                    hi = weight.max(axis=0)
                    lo = np.minimum(lo, 0)
                    hi = np.maximum(hi, 0)
                    scale = np.maximum((hi - lo) / 255, 1e-12)
                    zero = np.clip(np.round(-lo / scale), 0, 255).astype(np.uint8)
                    q = np.clip(np.round(weight / scale) + zero, 0, 255).astype(
                        np.uint8
                    )
                    for suffix, value in [
                        ("quant", q),
                        ("scale", scale),
                        ("zero", zero.astype(np.float32)),
                    ]:
                        graph.graph.initializer.append(
                            numpy_helper.from_array(value, name + "_" + suffix)
                        )
                    dequant = name + "_dequant"
                    new_nodes.extend(
                        [
                            helper.make_node(
                                "Cast",
                                [name + "_quant"],
                                [name + "_float"],
                                to=TensorProto.FLOAT,
                            ),
                            helper.make_node(
                                "Sub",
                                [name + "_float", name + "_zero"],
                                [name + "_centered"],
                            ),
                            helper.make_node(
                                "Mul", [name + "_centered", name + "_scale"], [dequant]
                            ),
                        ]
                    )
                    quantized[name] = dequant
                node.input[index] = quantized[name]
        new_nodes.append(node)
    del graph.graph.node[:]
    graph.graph.node.extend(new_nodes)
    kept = [x for x in graph.graph.initializer if x.name not in quantized]
    del graph.graph.initializer[:]
    graph.graph.initializer.extend(kept)
    onnx.checker.check_model(graph)
    onnx.save(graph, str(target))
    return target.stat().st_size


if __name__ == "__main__":
    size = quantize(
        PROJECT / "artifacts/text-fp32.onnx", ASSETS / "models/text-int8.onnx"
    )
    p = ASSETS / "models/model.json"
    m = json.loads(p.read_text())
    m.update(
        modelBytes=size,
        precision="UINT8 linear/embedding weights; FP32 convolution/activations",
        quantization="weight-only, per-channel affine; constant dequantization at initialization",
        scoringStrategy="weighted",
    )
    p.write_text(json.dumps(m, indent=2) + "\n")
    print("Model bytes:", size)
