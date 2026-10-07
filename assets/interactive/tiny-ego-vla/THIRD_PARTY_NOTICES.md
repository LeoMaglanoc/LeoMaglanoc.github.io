# TinyEgoVLA third-party notices

## Human footage and annotations

EPIC-KITCHENS, University of Bristol and collaborators, Damen et al., _Scaling Egocentric Vision: The EPIC-KITCHENS Dataset_ (ECCV 2018); _Rescaling Egocentric Vision_ (IJCV 2022).

Sources: https://epic-kitchens.github.io/ and https://github.com/epic-kitchens/epic-kitchens-100-annotations

License: Creative Commons Attribution-NonCommercial 4.0 International, https://creativecommons.org/licenses/by-nc/4.0/ . This exhibit uses short clips from P01_03, P01_04, P01_08. Changes: trimming, resizing, frame sampling, muting, video compression, hand/object overlays and prediction arrows. No endorsement is implied. The noncommercial restriction applies to the included footage and dataset-derived annotations; do not assume the repository's software license grants commercial footage rights.

Hand-object detections supplied by EPIC were generated using Shan et al., _Understanding Human Hands in Contact at Internet Scale_ (CVPR 2020), https://github.com/ddshan/Hand_Object_Detector . Supporting format library: https://github.com/epic-kitchens/epic-kitchens-100-hand-object-bboxes . These are automated detections, not manually verified physical contact or persistent object identities.

Hand skeletons are extracted offline with MediaPipe Hands, Google, Apache-2.0, https://github.com/google-ai-edge/mediapipe . No MediaPipe runtime is shipped to the browser.

## Robot environment and demonstrations

LIBERO: Liu, Zhu, Gao, Feng, Liu, Zhu, Stone, _LIBERO: Benchmarking Knowledge Transfer for Lifelong Robot Learning_ (NeurIPS 2023), https://github.com/Lifelong-Robot-Learning/LIBERO . Code/dataset source license: MIT (see upstream LICENSE and https://huggingface.co/datasets/yifengzhu-hf/LIBERO-datasets ). Two official spatial tasks are used, with provenance and exact revision recorded in the project. Panda footage is rendered offline from genuine LIBERO states/policies.

robosuite, https://github.com/ARISE-Initiative/robosuite , MIT. MuJoCo, Google DeepMind, https://github.com/google-deepmind/mujoco , Apache-2.0. Included rendered scenes inherit upstream object/texture asset provenance; consult LIBERO's asset directory and upstream notices for reuse.

## Frozen representation

MobileCLIP: Vasu et al., _MobileCLIP: Fast Image-Text Models through Multi-Modal Reinforced Training_ (CVPR 2024), Apple, https://github.com/apple-aiml-research/ml-mobileclip . Official S0 checkpoint is retained locally; no encoder weights are distributed in the website. Model weights are covered by Apple's model license in the upstream repository; code is covered by its corresponding upstream license. OpenCLIP and PyTorch are offline dependencies only.

The browser contains authored HTML/CSS/JavaScript, compressed videos/images, recorded labels and exported measurements. No inference service or model download is required.
