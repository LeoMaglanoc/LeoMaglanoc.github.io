"""Reproduce the non-deployed MobileCLIP2-S0 comparison artifacts."""

import json, torch, open_clip, numpy as np
from huggingface_hub import hf_hub_download
from common import PROJECT, normalize
from quantize_text_encoder import quantize

revision = "095906d28bf54d7584dc411e8ffe448f34289e05"
p = hf_hub_download(
    "timm/MobileCLIP2-S0-OpenCLIP", "open_clip_model.safetensors", revision=revision
)
torch.set_num_threads(4)
m, _, _ = open_clip.create_model_and_transforms(
    "MobileCLIP2-S0",
    pretrained=p,
    image_mean=(0, 0, 0),
    image_std=(1, 1, 1),
    image_interpolation="bilinear",
)
m.eval()
tok = open_clip.get_tokenizer("MobileCLIP2-S0")


class Tower(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.text = m.text

    def forward(self, input_ids):
        return self.text(input_ids)


fp = PROJECT / "artifacts/mobileclip2-fp32.onnx"
target = PROJECT / "artifacts/mobileclip2-weight8.onnx"
torch.onnx.export(
    Tower(m).eval(),
    (tok(["a cup"]),),
    str(fp),
    input_names=["input_ids"],
    output_names=["text_embedding"],
    opset_version=17,
    dynamo=False,
)
size = quantize(fp, target)
(PROJECT / "artifacts/mobileclip2-model.json").write_text(
    json.dumps(
        dict(
            model="MobileCLIP2-S0",
            contextLength=77,
            embeddingDim=512,
            input="input_ids",
            output="text_embedding",
            precision="UINT8 weights / FP32 activations",
            modelBytes=size,
        )
    )
)
queries = json.loads((PROJECT / "evaluation/prompts.json").read_text())
tokens = tok(queries)
with torch.inference_mode():
    z = normalize(m.encode_text(tokens).numpy())
(PROJECT / "artifacts/mobileclip2-fixtures.json").write_text(
    json.dumps(
        [
            dict(query=q, tokens=t.tolist(), reference=e.tolist())
            for q, t, e in zip(queries, tokens, z)
        ]
    )
)
