# Milestone outcome

| Milestone | Implemented components/files | Validation | Remaining limitation |
|---|---|---|---|
| 1. Physics/interaction | Shared Planck physics, raster sensor, renderer, main UI | Contact translates/rotates block; deterministic replay; touch goal drag preserves physical body | Physical Android device unavailable |
| 2. Dataset/baseline | `generate.mjs`, `generate_contact.mjs`, inspection, offline learned numerical baseline | Whole-episode splits, real contact labels, finite shared images/actions; original numerical predictor beat static prediction | Datasets/checkpoints excluded from Git; regenerate locally |
| 3. Representation | Initial VICReg and later supervised spatial-keypoint encoders | Original SSL gate failed; supervised fallback retains pose; stronger rigidity projection tested | Current perception is explicitly pose-supervised, not pure JEPA |
| 4. Latent dynamics | Object-frame learned rigid/rest transition; separate diagnostic head | Held-out 1/3/5/8/16-step metrics with variability/contact subsets; PyTorch/ONNX/WASM parity | Prediction error grows with horizon/contact changes |
| 5. MPC | Batched knot-parameterized CEM, warm start, visual hold, Worker | 3/50 reserved easy successes vs 0/50 random; large coverage gain; real 14-action default success | ≥50% easy reliability target **not met** |
| 6. Explanation | Real/goal/decoded-prediction layers, inspect/step, error/latency metrics | Browser tests distinguish predicted and actual movement; edits invalidate plans | Diagnostic ghosts remain predictions and can be wrong |
| 7. Integration | Jekyll fullscreen route, existing blog link, model cache versions, Docker workflow | Desktop/portrait/landscape Chrome success and interactions locally; post-push Docker/live proof recorded separately | Experimental controller; physical-phone timing unverified |

The interface/runtime implementation is usable, but the research reliability goal remains open. This distinction must be preserved in any presentation of the demo. Next research work would need better contact-model calibration and uncertainty handling; the current release does not claim that those problems are solved.
