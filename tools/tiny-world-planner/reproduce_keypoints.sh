#!/bin/sh
set -eu
# From tools/tiny-world-planner. Every checkpoint is generated locally.
node generate.mjs 700 80 local-data
python train/train_keypoints.py --out local-models-keypoints --results results/keypoints-v3 --validation-schedule legacy
mkdir -p local-models-keypoints-equivariant
cp local-models-keypoints/encoder0.pt local-models-keypoints/encoder1.pt local-models-keypoints-equivariant/
python train/train_keypoints.py --reuse-encoders --equivariant --out local-models-keypoints-equivariant --results results/keypoints-v4 --validation-schedule legacy
node generate_contact.mjs 1400 60 local-data-contact
mkdir -p local-models-keypoints-precision
cp local-models-keypoints/encoder0.pt local-models-keypoints/encoder1.pt local-models-keypoints-precision/
python train/train_keypoints.py --reuse-encoders --equivariant --rest-preserving --initial-dynamics local-models-keypoints-equivariant/dynamics.pt --data local-data-contact --out local-models-keypoints-precision --results results/keypoints-v5 --dynamics-steps 8000
mkdir -p local-models-keypoints-projected
cp local-models-keypoints/encoder0.pt local-models-keypoints/encoder1.pt local-models-keypoints-projected/
python train/train_keypoints.py --reuse-encoders --equivariant --rest-preserving --projected --initial-dynamics local-models-keypoints-precision/dynamics.pt --data local-data-contact --out local-models-keypoints-projected --results results/keypoints-v6 --dynamics-steps 6000
python train/fixtures_keypoints.py
cp local-models-keypoints-projected/*.onnx local-models-keypoints-projected/parity_fixtures.json ../../assets/interactive/tiny-world-planner/models/
cp local-models-keypoints-projected/model_metadata.json ../../assets/interactive/tiny-world-planner/models/
node eval/planning.mjs 50 100 lite
python eval/evaluate_keypoints.py
node eval/parity.mjs
