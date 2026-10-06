# Language → Vision: sources and licenses

The deployed image and text towers both use **Apple MobileCLIP-S0**, the official `mobileclip_s0.pt` checkpoint (SHA-256 `809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7`). The text ONNX is a derived export with eight-bit weight storage and FP32 activations. The model is not a captioner or an LLM.

- [MobileCLIP authors and official repository](https://github.com/apple-aiml-research/ml-mobileclip): Vasu et al., _MobileCLIP: Fast Image-Text Models through Multi-Modal Reinforced Training_, CVPR 2024. Code: MIT. Weights: **Apple ML Research Model Terms of Use**, reproduced in [APPLE-MODEL-LICENSE.txt](licenses/APPLE-MODEL-LICENSE.txt). A third-party ONNX repository's MIT tag does not replace these terms.
- [SAM 2](https://github.com/facebookresearch/sam2): Ravi et al., _SAM 2: Segment Anything in Images and Videos_. SAM 2.1 Hiera tiny is used offline. Code/checkpoint: Apache 2.0; license reproduced in [SAM2-LICENSE.txt](licenses/SAM2-LICENSE.txt).
- [ONNX Runtime 1.23.2](https://github.com/microsoft/onnxruntime): MIT; browser runtime vendored under `vendor/`, license reproduced in [ORT-LICENSE.txt](licenses/ORT-LICENSE.txt).
- [OpenCLIP](https://github.com/mlfoundations/open_clip): MIT; Python reference tokenizer and export vocabulary. Its tokenizer derives from OpenAI CLIP (MIT). JavaScript BPE is implemented in this project.
- DM Sans and Space Grotesk: SIL Open Font License 1.1. Fonts are hosted locally; license texts are in `licenses/`.

## Photographs

**Toolkit**: Wilfredor, [Tools 66](https://commons.wikimedia.org/wiki/File:Tools_66.jpg), CC0 1.0. Resized and converted to WebP. Original photograph, not an AI-generated image.

All other images are resized/WebP derivatives of photographs available under the [Pexels license](https://www.pexels.com/license/). Each scene retains a direct source and license link in `data/scenes.json`. Neither Pexels nor the photographers endorse this experiment.

| Scene            | Source                                                                           |
| ---------------- | -------------------------------------------------------------------------------- |
| Electrical tools | [Pexels 6349402](https://www.pexels.com/photo/6349402/)                          |
| Hand tools       | [Csongor Kemény / Pexels 4346892](https://www.pexels.com/photo/4346892/)         |
| Workbench        | [Edward Eyer / Pexels 9180362](https://www.pexels.com/photo/9180362/)            |
| Desk             | [Pexels 4050315](https://www.pexels.com/photo/4050315/)                          |
| Kitchen table    | [Pexels 1640777](https://www.pexels.com/photo/1640777/)                          |
| Living room      | [Pexels 1571460](https://www.pexels.com/photo/1571460/)                          |
| City street      | [Pexels 378570](https://www.pexels.com/photo/378570/)                            |
| Market           | [Pexels 264636](https://www.pexels.com/photo/264636/)                            |
| Candlelight      | [Pexels 2031751](https://www.pexels.com/photo/2031751/)                          |
| Harvest          | [Pexels 1458694](https://www.pexels.com/photo/1458694/)                          |
| Train station    | [Abdel Rahman Abu Baker / Pexels 5617385](https://www.pexels.com/photo/5617385/) |

The photo collection is supplied as part of an interactive retrieval experiment, rather than a stock-photo service. Image embeddings and masks are derived offline from these photographs. The original source photo downloads are kept outside the published asset folder.
