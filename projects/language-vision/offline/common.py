from pathlib import Path
import torch, open_clip, numpy as np
from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "projects/language-vision"
ASSETS = ROOT / "assets/interactive/language-vision"
MODEL = "MobileCLIP-S0"
CHECKPOINT_REVISION = "809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7"


def load_model():
    torch.set_num_threads(4)
    if MODEL == "MobileCLIP-S0":
        import mobileclip

        checkpoint = PROJECT / "artifacts/mobileclip_s0.pt"
        if not checkpoint.exists():
            import urllib.request

            urllib.request.urlretrieve(
                "https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_s0.pt",
                checkpoint,
            )
        import hashlib

        if (
            hashlib.sha256(checkpoint.read_bytes()).hexdigest()
            != "809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7"
        ):
            raise ValueError("MobileCLIP checkpoint hash mismatch")
        model, _, preprocess = mobileclip.create_model_and_transforms(
            "mobileclip_s0", pretrained=str(checkpoint)
        )
        return model.eval(), preprocess, open_clip.get_tokenizer("MobileCLIP2-S0")
    checkpoint = hf_hub_download(
        "timm/MobileCLIP2-S0-OpenCLIP",
        "open_clip_model.safetensors",
        revision="095906d28bf54d7584dc411e8ffe448f34289e05",
    )
    model, _, preprocess = open_clip.create_model_and_transforms(
        MODEL,
        pretrained=checkpoint,
        image_mean=(0, 0, 0),
        image_std=(1, 1, 1),
        image_interpolation="bilinear",
        image_resize_mode="shortest",
    )
    model.eval()
    # FastViT's inference reparameterization is required before exporting/encoding.
    if hasattr(model.visual.trunk, "reparameterize"):
        model.visual.trunk.reparameterize()
    return model, preprocess, open_clip.get_tokenizer(MODEL)


def normalize(x):
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)
