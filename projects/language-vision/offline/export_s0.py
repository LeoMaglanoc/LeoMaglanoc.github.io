import torch, mobileclip, json, numpy as np
from common import PROJECT, ASSETS, normalize
from quantize_text_encoder import quantize
from mobileclip.modules.common.mobileone import reparameterize_model

torch.set_num_threads(4)
m, _, p = mobileclip.create_model_and_transforms(
    "mobileclip_s0", pretrained=str(PROJECT / "artifacts/mobileclip_s0.pt")
)
m.eval()
tok = mobileclip.get_tokenizer("mobileclip_s0")


class Tower(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.text = m.text_encoder

    def forward(self, input_ids):
        return self.text(input_ids)


t = tok(["a cup"])
fp = PROJECT / "artifacts/s0-fp32.onnx"
print("Exporting MobileCLIP-S0", flush=True)
torch.onnx.export(
    Tower(m).eval(),
    (t,),
    str(fp),
    input_names=["input_ids"],
    output_names=["text_embedding"],
    opset_version=17,
    dynamo=False,
)
quantize(fp, PROJECT / "artifacts/s0-weight8.onnx")
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    str(fp),
    str(PROJECT / "artifacts/s0-dynamic.onnx"),
    weight_type=QuantType.QUInt8,
    per_channel=True,
    op_types_to_quantize=["MatMul", "Gather"],
)
queries = json.loads((PROJECT / "evaluation/prompts.json").read_text())
with torch.inference_mode():
    ref = normalize(m.encode_text(tok(queries)).numpy())
f = [
    dict(query=q, tokens=t.tolist(), reference=r.tolist())
    for q, t, r in zip(queries, tok(queries), ref)
]
(PROJECT / "artifacts/s0-fixtures.json").write_text(json.dumps(f))
