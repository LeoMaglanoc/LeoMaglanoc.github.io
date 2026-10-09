# Featured demo source audit

Updated October 9, 2026 for the G1 Parkour featured-card swap. Paths below are relative
to the repository root. The README links individual files; this table records
which evidence answers each mandatory audit question.

| Question           | G1 Parkour | Dexterous Cube Orientation                                                                                                                  | EuroGuesser AI                                                                                                                                                          | RustZero                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Algorithm          | `projects/g1-parkour/src/policy/{policyController,releaseContract}.js`; `src/main.js` | `projects/dexterous-rl/web/{control,policy,app}.js`                                                                                         | `projects/euroguessr/src/{preprocess,geo,inference.worker}.js`                                                                                                          | `projects/rustzero/src/{game,model,mcts,training}.rs`                                                                               |
| Inputs/outputs     | 106×60 depth → 87×58 → 32-D latent; ordered 140-D student input → 29 actions; native fixtures | `control.js` builds 3×69 term-major history; `policy.js` supplies `[1,207]`; `config.json` maps 20 joint actions                            | `student_train.py`/`train.py` implement 576 features, 96 logits, normalized 512 projection; worker input `[1,3,224,224]`; `geo.js` outputs degrees                      | `game.rs`: two occupancy planes and canonical actions; `model.rs`: 72→64→108/1; `browser.rs` serializes legal moves/state           |
| Loaded model       | `projects/g1-parkour/public/php-release/{student,depth_backbone}.onnx`; official hash manifest | `projects/dexterous-rl/checkpoints/released/{model.pt,policy.onnx}` and `web/policy.onnx`                                                   | `projects/euroguessr/models/model.onnx`, `models/metadata.json`; optional `models/geoclip/metadata.json` records external weights                                       | `projects/rustzero/web/models/final.json`, Gen 200; `worker.js` loads selected JSON                                                 |
| Weight origin      | Official PHP `student-assets-v1` release, source/release/terrain pins in `upstream.json`; no local training | `checkpoints/provenance.json`: Wuji release/tag/commit/archive hashes, training/distillation false                                          | `teacher_common.py`: pinned CLIP revision and GeoCLIP 1.2.1; `train.py`: ImageNet V1; `checkpoints/geoclip-v2/`: local student artifacts                                | `web/metrics/run-metadata.json`: random initialization, exact source/config/checkpoint hashes and timestamps                        |
| Training data      | Published motion-matching/teacher/student method; original released-run rollouts and optimizer state absent | Pinned upstream scene, task/config and archived source define environment generation; original rollout logs not retained                    | `prepare_experiment.py`, `cache_teacher.py`, saved V2 manifest/checkpoints and model metadata; OSV-5M split and teacher coverage                                        | `training.rs::selfplay`: learner games, root noise, mirrored states/policies, FIFO replay; no heuristic labels                      |
| Targets/loss       | Upstream RL tracking teachers and DAgger + RL student; exact released-run loss/config not recovered | Retained PPO config and pinned reward builder/functions; rewards distinct from GAE/PPO targets; exact original optimizer/run history absent | `student_train.py::loss_terms`: weighted/smoothed CE + T² KL + cosine; `cache_teacher.py`: teacher soft cell probabilities; original upstream GeoCLIP training separate | `training.rs::loss`: search-visit CE + terminal-outcome MSE (equal coefficients), all-logit training softmax; Adam loop             |
| Browser deployment | `/parkour/` → isolated Vite iframe; depth rendering, CPU ONNX and MuJoCo WASM; no training backend | Public fullscreen iframe → evaluation physics/actor; target overlay only is visual                                                          | CPU Worker gets pixels/token only; matched preprocessing → projection/gallery retrieval → UI haversine comparison                                                       | `lib.rs` training feature gate; `browser.rs`, Worker WASM binding, streamed PUCT chunks and JS board                                |
| Measured claims    | `VALIDATION.md`, native fixtures and `results/`: contract parity, controls, depth, reset and partial-course probe; full course unverified | `VALIDATION.md`: ten frozen vectors, 12 seeded goal regressions; no population success claim                                                | Selected-method validation/fresh-test in shipped metadata; optional direct metadata; human win rate unmeasured                                                          | `training.json`, `holdout.json`, `tournament.json`, `promotions.json`, `VALIDATION.md`; fixed paired openings and one training seed |

## External-source verification

The local archive includes Wuji's reward builder/functions at revision
`26b99c6338641e8edc17caf87922e6e1767121fa`; the extracted vendor checkout was
inspected but is ignored, so README links use the pinned public source and the
tracked archive instead of broken links into an untracked checkout.

GeoCLIP upstream summary was checked against the authors' README, location
encoder and training implementation:

- https://github.com/VicenteVivan/geo-clip
- https://github.com/VicenteVivan/geo-clip/blob/main/geoclip/model/location_encoder.py
- https://github.com/VicenteVivan/geo-clip/blob/main/geoclip/train/train.py

These describe upstream data/method, not a recovered checkpoint-specific run.
The local teacher package/revision and conversion hashes are separately recorded.
Unitree's upstream README confirms the Gym → exported actor → MuJoCo deployment
workflow; current upstream configuration is not treated as original run evidence.

## Integration decisions

The first homepage demo is now G1 Parkour at `/parkour/`, with a preview from
the running Chrome simulator. Dexterous Cube Orientation, EuroGuesser AI and
RustZero remain in the other three slots. Shared card Liquid/CSS and the wider
blog archive remain intact. Root README contains extensive chapters only for
these four featured demos plus shared build instructions; other projects keep
their own project READMEs. The About page introduces those same four topics.
The old locomotion route and its models remain available through the blog.

Parkour's method summary was checked against the researchers' PHP README on
October 9, 2026: https://github.com/amazon-far/php_parkour . It describes motion
matching, privileged RL teachers and a DAgger + RL depth student. This is
method provenance, not a recovered exact checkpoint training record.
