# EuroGuessr AI — third-party notices

## Street imagery and metadata

[OpenStreetView-5M](https://huggingface.co/datasets/osv5m/osv5m), Astruc et al., CVPR 2024. Dataset license: **CC BY-SA 4.0**. Original imagery comes from Mapillary contributors. Each published image is accompanied by its original image ID, creator username, source link, license and modification notice in `rounds.json`. Images are resized to a maximum of 640 pixels and JPEG recompressed; these adapted images are distributed under CC BY-SA 4.0. Contributor attribution is displayed on each round's reveal. Full license: `licenses/OSV5M-CC-BY-SA-4.0.txt`.

Training uses metadata and images from the dataset's train archives. The game pack is an uncurated prefix of the selected test sample. Image IDs are stable; third-party source links may become unavailable. Attribution is retained locally.

## Vision encoder

[PyTorch TorchVision MobileNetV3-Small](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.mobilenet_v3_small.html), ImageNet-1K V1 pretrained weights. TorchVision code is BSD-3-Clause; see `licenses/torchvision-BSD.txt`. PyTorch notes pretrained weights may have separate terms associated with their training data; the code license alone does not establish ownership of ImageNet source images. This project distributes an exported pretrained encoder with a newly trained geographic head and documents its provenance.

## Runtime

[ONNX Runtime Web](https://github.com/microsoft/onnxruntime), version 1.23.2, Microsoft, MIT license: `licenses/onnxruntime-MIT.txt`. The WASM-only distribution is vendored from the official npm package. This app explicitly selects `wasm` and runs with one CPU thread; it does not request WebGPU.

## Map

[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), 1:110m Admin 0 countries. Public-domain map geometry; reduced to country names, ISO codes and geometry. Source: [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson). No map tile service is used.

## Model artifact

Version, preprocessing, data fingerprint, parameter count and evaluation results are saved in `models/metadata.json`. Training reference coordinates and feature vectors derive from OSV-5M. This project conservatively distributes its OSV-derived reference pack and geographic model artifacts under CC BY-SA 4.0, while retaining upstream notices. This notice is not a claim that an ImageNet code license covers every upstream data right.
