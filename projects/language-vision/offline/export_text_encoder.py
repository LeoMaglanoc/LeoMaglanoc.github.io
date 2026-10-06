"""Export the exact OpenCLIP text path and tokenizer vocabulary. FP32 stays offline."""

import json, torch, numpy as np, html.entities
from common import PROJECT, ASSETS, MODEL, CHECKPOINT_REVISION, load_model


class TextEncoder(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.text = model.text_encoder if hasattr(model, "text_encoder") else model.text

    def forward(self, input_ids):
        return self.text(input_ids)


def main():
    model, _, tokenizer = load_model()
    wrapper = TextEncoder(model).eval()
    tokens = tokenizer(["something used to tighten screws"])
    out = PROJECT / "artifacts/text-fp32.onnx"
    torch.onnx.export(
        wrapper,
        (tokens,),
        str(out),
        input_names=["input_ids"],
        output_names=["text_embedding"],
        opset_version=17,
        dynamo=False,
    )
    st = tokenizer
    # SimpleTokenizer vocabulary is the Python reference, not a separately sourced tokenizer.
    vocab = dict(
        entities={k.rstrip(";"): v for k, v in html.entities.html5.items()},
        encoder=st.encoder,
        merges=[
            list(pair) for pair, _ in sorted(st.bpe_ranks.items(), key=lambda x: x[1])
        ],
        contextLength=st.context_length,
        sot=st.sot_token_id,
        eot=st.eot_token_id,
    )
    (ASSETS / "models/tokenizer.json").write_text(
        json.dumps(vocab, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    meta = dict(
        model=MODEL,
        checkpoint="apple/MobileCLIP-S0",
        pretrained="official Apple mobileclip_s0.pt",
        checkpointRevision=CHECKPOINT_REVISION,
        embeddingDim=int(model.projection_dim)
        if hasattr(model, "projection_dim")
        else int(model.text.text_projection.shape[-1]),
        contextLength=st.context_length,
        precision="FP32 reference (offline only)",
        provider="wasm",
        input="input_ids",
        output="text_embedding",
    )
    (ASSETS / "models/model.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("Exported", out, flush=True)


if __name__ == "__main__":
    main()
