# EuroGuessr AI — GeoCLIP Distillation Overnight V2

Work directly in the existing `projects/euroguessr/` implementation.

Do not rewrite the frontend or change the static GitHub Pages architecture.

The central objective tonight is now:

> **Distill geographic knowledge from pretrained GeoCLIP into a tiny Europe-specialized model that trains on this CPU laptop and runs entirely in the browser CPU.**

GeoCLIP is the priority experiment. Supervised-only MobileNet remains the baseline/fallback, not the main goal.

The second objective is to substantially improve the actual game UX:

- higher-resolution player imagery;
- real pinch zoom + pan for the photo;
- real pinch zoom + pan for the map;
- important European city labels on the map.

Hard deadline:

**09:00 Europe/Berlin, 6 October 2026.**

Stop expensive training by approximately **08:20–08:30**, leaving enough time for final evaluation, ONNX export, tests and the report.

No GPU, WebGPU requirement, cloud compute, paid API or inference backend.

---

# 1. Preserve the current model as the baseline

Before changing anything:

- preserve current deployed `models/`;
- preserve `rounds.json`;
- preserve `checkpoints/current/`;
- preserve current metrics;
- create a new run root such as:

`artifacts/geoclip-overnight/`

Never overwrite the current known-good model until the new model passes the promotion gate.

Record the current baseline metrics, including approximately:

- current train / val / test sizes;
- validation median error;
- test median error;
- <=200 km;
- <=750 km;
- ONNX size;
- browser latency.

Never use test performance for model selection.

---

# 2. FIRST TASK: benchmark GeoCLIP on this laptop

Before downloading thousands of images or launching training, establish actual GeoCLIP CPU throughput.

Install GeoCLIP in an isolated environment if needed so its dependencies cannot break the existing EuroGuessr training environment.

Run GeoCLIP on approximately **100 representative Europe images**.

Test batch sizes such as:

`1, 2, 4, 8`

while respecting RAM.

Measure:

- cold-start model-load time;
- steady-state images/sec;
- seconds/image;
- RAM usage;
- CPU utilization;
- best batch size;
- GeoCLIP output dimension;
- numerical sanity;
- whether repeated inference is stable.

Write:

`artifacts/geoclip-overnight/teacher-benchmark.json`

Do not guess teacher throughput.

Use the measured throughput to determine how many GeoCLIP examples can realistically be generated before roughly **01:00–01:30**.

The teacher pass must not consume the entire night.

---

# 3. Improve `cache_teacher.py`

The existing implementation processes one image at a time and is tied to the old checkpoint's existing geocell centers.

Refactor it.

The new teacher cache should operate from:

- a manifest;
- a selected teacher subset;
- a supplied geographic-cell definition;
- GeoCLIP itself.

It must not depend on old 48-cell centers from `checkpoints/current/best.pt`.

Add batching.

Add safe resume.

Write the cache incrementally and atomically.

If interrupted, rerunning must skip completed images.

---

# 4. Cache TWO GeoCLIP targets

Do not limit distillation to the current soft-geocell probabilities.

For every teacher-processed image cache:

## A. GeoCLIP image embedding

Cache the normalized GeoCLIP image representation:

`z_teacher ∈ R^512`

This is the most important teacher signal.

## B. Geographic soft distribution

Given our newly generated European geographic-cell centers:

`g_1 ... g_N`

run the GeoCLIP location encoder once over those coordinates.

Cache:

`p_teacher(g | image)`

using GeoCLIP image-location similarity with a configurable distillation temperature.

The location embeddings are static and must be computed once, not once per image.

Teacher cache schema should contain roughly:

- GeoCLIP/version identifier;
- manifest fingerprint;
- selected image IDs;
- 512-D normalized image embeddings;
- cell centers;
- cell location embeddings or their fingerprint;
- soft cell probabilities;
- temperature;
- preprocessing/version metadata.

---

# 5. Teacher subset: GeoCLIP is priority, but be adaptive

Create a larger European training pool first, preferably from multiple OSV-5M shards.

Target perhaps:

- 8k–12k total retained training images;
- ~1k validation;
- ~500–800 test;

if preparation time/storage allows.

Preserve:

- country balancing;
- sequence deduplication;
- geographic-block validation;
- ≥25 km training/holdout separation;
- test isolation;
- deterministic sampling;
- provenance.

Then select a **geographically balanced GeoCLIP teacher subset** from the training split.

Do not simply take the first N examples.

Balance the teacher subset across:

- countries;
- geographic cells;
- sequences where practical.

Determine N from the measured teacher throughput.

Desired hierarchy:

**ideal:** ~5k+ teacher images  
**good:** ~2k–5k  
**acceptable:** ~1k–2k  
**minimum useful experiment:** several hundred, geographically diverse images

If GeoCLIP is slower than expected, reduce teacher subset size.

**Do not drop GeoCLIP entirely.**

All training examples can still receive ordinary GPS/geocell supervision.

GeoCLIP losses should simply apply to examples for which teacher targets exist.

---

# 6. Recompute geographic cells for the new dataset

Do not preserve the old 48 centers when the dataset expands.

Using only the new training split, test geographic grids such as:

- 64 cells;
- 96 cells;
- 128 cells.

Do this cheaply using frozen MobileNet features / head training.

Select cell count on validation only.

The GeoCLIP location encoder should then embed those selected cell centers.

The teacher cache and student must reference exactly the same centers.

---

# 7. Change the student architecture slightly

Continue using **MobileNetV3-Small** as the CPU/browser student unless evidence strongly favors another similarly tiny architecture.

Current native visual representation:

`MobileNet → 576-D`

Add:

`576 → 512`

projection head for GeoCLIP representation distillation.

Architecture:

`image`
→ `MobileNetV3-Small encoder`
→ `576-D native feature`

then two heads:

### Geographic classifier

`576 → 256 → N geographic cells`

### GeoCLIP projection

`576 → 512`

then L2 normalize.

Call this:

`z_student`.

Do not increase the architecture substantially tonight.

---

# 8. Main training objective: GEOCLIP DISTILLATION

The main experiment should use a combined loss.

For every training image:

## Ground-truth geographic supervision

`L_geo = CE(student_cell_logits, true_cell)`

Use the current weighting / label smoothing unless validation suggests otherwise.

For GeoCLIP-cached examples additionally use:

## Soft geographic distillation

`L_KD = T² KL(p_teacher || p_student)`

## Embedding distillation

Use normalized representations:

`L_embed = 1 - cosine(z_student, z_teacher)`

Then:

`L = λ_geo L_geo + λ_KD L_KD + λ_embed L_embed`

Start with something reasonable such as:

`λ_geo = 0.5`  
`λ_KD = 0.2`  
`λ_embed = 0.3`

but expose these as command-line/config values.

Do not spend the whole night hyperparameter sweeping.

At minimum compare:

### Baseline A

GPS-supervised student only.

### Main model B

GPS supervision + GeoCLIP soft targets + GeoCLIP embedding distillation.

If compute permits, one ablation:

### Model C

GPS + embedding distillation only.

Validation decides.

---

# 9. Training sequence

## Stage A — feature/head bootstrap

Freeze MobileNet.

Train:

- geographic head;
- GeoCLIP projection head.

Because MobileNet is frozen, this should be comparatively inexpensive.

Use this stage to choose:

- 64 / 96 / 128 cells;
- basic KD weights if necessary.

## Stage B — partial fine-tuning

Unfreeze the final MobileNet block.

Train the complete student using the combined GeoCLIP + GPS objective.

Warm-start encoder weights from the current model where compatible.

Use a lower learning rate.

Save:

- `last.pt` every epoch;
- `best.pt` according to validation median geographic error.

Also log:

- total loss;
- supervised loss;
- KD loss;
- embedding cosine loss;
- validation median km;
- <=200 km;
- <=750 km.

Use early stopping if validation clearly plateaus.

---

# 10. Make the overnight process deadline-aware

Add something like:

`--stop-at 2026-10-06T08:25:00+02:00`

Check the deadline between epochs.

When deadline is reached:

- stop further training;
- preserve `last.pt`;
- load validation-selected `best.pt`;
- continue through evaluation/export.

SIGINT/SIGTERM should similarly preserve resumable state.

Do not simply exit before exporting.

---

# 11. Evaluate several inference strategies

This is important because GeoCLIP gives us additional possible inference spaces.

After training, evaluate on validation:

## A. Geographic head

Student logits → highest-probability cell.

## B. Existing MobileNet feature retrieval

Student native 576-D embedding → nearest training images.

Retune:

`K = 1, 3, 5, 10, 20, 50`

and similarity temperature.

## C. GeoCLIP-distilled embedding retrieval

Use normalized student 512-D GeoCLIP-style embedding.

Compare it to cached **GeoCLIP teacher embeddings of training reference images**.

Retrieve locations in this teacher representation space.

This is particularly important.

It directly tests whether the tiny student learned GeoCLIP's geographic representation.

Try several K values / weighting temperatures.

## D. Optional GeoCLIP-location gallery

If easy to implement and asset size stays reasonable:

precompute GeoCLIP location embeddings for a Europe-only candidate GPS gallery and compare the student's distilled embedding directly against them.

Do not make this necessary for success tonight.

Validation chooses the final deployed inference method.

Only then run test once.

---

# 12. Scientific measurements to report

The morning report must compare:

### Current tiny model

vs.

### New supervised-only model

vs.

### GeoCLIP-distilled student

Report:

- parameters;
- teacher images used;
- total training images;
- validation median error;
- test median error;
- mean error;
- <=25 km;
- <=100 km;
- <=200 km;
- <=500 km;
- <=750 km;
- country accuracy if implemented;
- ONNX size;
- reference-pack size;
- native CPU latency;
- browser latency.

Also report representation distillation quality:

`mean cosine(z_student, z_teacher)`

on a held-out validation subset.

Do not call the student "GeoCLIP" itself.

Prefer wording such as:

> **Tiny MobileNet student distilled from GeoCLIP.**

---

# 13. Deployment must contain NO GeoCLIP model

GeoCLIP is an offline teacher only.

Final browser:

`street image`
→ `tiny MobileNet student`
→ `ONNX Runtime Web / WASM CPU`
→ `location prediction`

No GeoCLIP ViT-L/14 download in the browser.

No server inference.

No API call.

No WebGPU requirement.

Keep the current worker architecture.

---

# 14. Higher-resolution player imagery

Current public game images are limited to max 640 px.

Separate:

**training image representation**

from

**human-facing game image.**

Training can keep compact images because the student input remains 224×224.

For the 40 held-out public game images:

- recover the highest available OSV-5M source resolution;
- export up to approximately **1600 px max dimension**;
- preserve aspect ratio;
- never upscale;
- JPEG quality approximately 88–92;
- preserve attribution;
- record original/exported dimensions.

Keep every public game image in the held-out test set.

The AI and human must still receive the same photograph.

Model preprocessing reduces it to 224×224 internally.

Target the total image pack to remain reasonably small, approximately <=20–25 MB if possible without noticeable degradation.

Preload only the next image.

---

# 15. Real pinch-to-zoom photo interaction

Replace the current binary `scale(1.8)` photo mode.

Maintain:

- scale;
- translation x/y;
- active pointer IDs.

Use Pointer Events.

Touch behavior:

- two-finger pinch zoom;
- zoom around gesture midpoint;
- one-finger pan when zoomed;
- min zoom = fitted image;
- max zoom ≈ 4×;
- clamp translation;
- no jumping when pointer count changes.

Desktop:

- `+`;
- `−`;
- reset;
- optional wheel/trackpad zoom.

Reset image transform every round.

Add a subtle first-use hint:

`Pinch to zoom · drag to pan`

and hide/fade it after interaction.

---

# 16. True pinch-to-zoom map

Keep the existing local SVG/Natural Earth map.

Do not introduce Google Maps, Mapbox or runtime map tiles.

Implement Pointer Events for simultaneous touch pointers.

One pointer:

- tap → guess;
- drag → pan.

Two pointers:

- pinch → zoom;
- midpoint movement → pan;
- zoom should remain anchored under pinch midpoint;
- pinch must never accidentally create a guess.

Desktop:

- wheel zoom around cursor position;
- existing `+`, `−`, reset controls.

Preserve keyboard accessibility.

Coordinate conversion after arbitrary pan/zoom must remain correct.

---

# 17. Add important European cities

Use Natural Earth **Populated Places** data.

During development:

- obtain the dataset;
- filter it offline to the EuroGuessr Europe bounds;
- generate a tiny checked-in `cities.json` or `cities.geojson`.

Keep only fields needed at runtime:

- city name;
- latitude;
- longitude;
- country;
- capital status;
- population/scale rank;
- display tier.

Approximately 50–100 cities is enough.

Render by tier.

### Europe-wide

Major capitals / major world cities.

### Medium zoom

More important cities.

### Close zoom

Regional cities.

Examples that should normally appear include:

London, Paris, Madrid, Barcelona, Lisbon, Dublin, Amsterdam, Brussels, Berlin, Hamburg, Munich, Copenhagen, Oslo, Stockholm, Helsinki, Warsaw, Prague, Vienna, Budapest, Rome, Milan, Athens, Bucharest, Sofia, Belgrade, Zagreb, Ljubljana, Bratislava, Tallinn, Riga, Vilnius, Kyiv and Reykjavík.

Derive the actual ranking from the dataset rather than only hardcoding this list.

Use:

- small city dot;
- restrained city name;
- collision suppression;
- pointer-events disabled.

Fade country labels as dense city labels appear.

---

# 18. Testing

Keep all existing pipeline tests.

Add tests for:

## GeoCLIP teacher

- benchmark works;
- batching does not alter outputs materially;
- teacher caching resumes;
- cache fingerprinting works;
- partial teacher coverage works;
- teacher never receives val/test images during training-cache creation;
- teacher embedding dimensions/norms are valid.

## Distillation

- teacher subset loss applied only where available;
- supervised loss still applies to all training examples;
- embedding projection normalization;
- warm start compatibility;
- new geocell generation;
- save/resume;
- deadline finalization.

## Leakage

- train/val/test IDs disjoint;
- sequences disjoint;
- ≥25 km training-to-holdout buffer;
- public game images remain test only.

## Gestures

- photo pinch in/out;
- map pinch in/out;
- midpoint anchoring;
- translation clamping;
- no accidental map guesses while pinching;
- coordinate unprojection remains correct.

## Browser

Test:

- desktop Chrome;
- responsive 390×844;
- model load;
- five rounds;
- pinch/pan photo;
- pinch/pan map;
- city labels;
- correct guess placement after map transforms;
- reveal pins;
- score totals;
- result export;
- no horizontal overflow.

Clearly distinguish emulated touch testing from physical-phone testing.

---

# 19. Promotion gate

The GeoCLIP experiment is the priority, but do not deploy a worse model merely because it uses GeoCLIP.

Promotion should require a meaningful validation improvement versus the current deployed model.

Preferred outcome:

`GeoCLIP-distilled student > supervised-only student > current model`

but report whatever actually happens.

If the supervised model wins validation, keep it deployed and preserve the GeoCLIP result as an experiment.

If the GeoCLIP-distilled model wins, deploy it and prominently explain the architecture:

`GeoCLIP teacher → tiny MobileNet student → browser CPU`

---

# 20. Suggested overnight timing

Adapt this according to actual measured runtime.

### ~20:00–20:30

- snapshot baseline;
- install/verify GeoCLIP;
- 100-image teacher benchmark.

### ~20:30–21:30

- prepare expanded multi-shard Europe dataset;
- choose geographic cells;
- choose balanced teacher subset.

Teacher caching can start as soon as enough images exist.

### ~21:00–01:00/01:30

**GeoCLIP teacher pass.**

This is the priority compute phase.

Use best measured batch size.

If projected finish extends far beyond 01:30, reduce teacher subset rather than abandoning GeoCLIP.

### ~01:00–02:00

- frozen student bootstrap;
- cell-count comparison;
- supervised vs distilled quick validation.

### ~02:00–08:20

- partial fine-tuning of best GeoCLIP-distilled configuration;
- preserve best validation checkpoint.

If it plateaus early, optionally try one carefully scoped variant.

### ~08:20–09:00

- stop expensive training;
- choose inference method on validation;
- final test;
- ONNX export;
- reference export;
- browser/tests;
- write report.

UI work that does not consume significant CPU can be done while teacher caching/training runs.

---

# 21. Morning report

Create:

`artifacts/geoclip-overnight/REPORT.md`

Start with:

## Outcome

**Did GeoCLIP distillation improve the tiny model? YES / NO**

Then report:

- measured GeoCLIP seconds/image;
- best batch size;
- GeoCLIP teacher subset size;
- total training-set size;
- number of shards;
- countries/sequences;
- cell count;
- GeoCLIP cache duration;
- student training duration;
- epochs;
- best epoch;
- supervised baseline metrics;
- distilled metrics;
- representation cosine similarity;
- selected inference method;
- final validation metrics;
- untouched test metrics;
- ONNX size;
- reference asset size;
- browser inference latency;
- high-resolution game-pack size;
- city-map implementation status;
- gesture implementation status;
- failed experiments;
- tests;
- recommended deployment.

Also give exact commands to:

- reproduce teacher cache;
- resume teacher caching;
- reproduce student training;
- resume training;
- publish;
- revert.

---

# 22. Scope guard

Tonight do NOT:

- train GeoCLIP itself;
- train worldwide from scratch;
- deploy GeoCLIP ViT-L/14 to the browser;
- use cloud/GPU compute;
- add live Street View navigation;
- add a backend;
- rebuild the site framework;
- sacrifice geographic holdout integrity;
- tune against test;
- make human-beating claims without human data.

The intended final story is:

> **A large worldwide GeoCLIP teacher transfers its geographic representation into a tiny Europe-specialized vision model. The student is trained on an ordinary CPU laptop and then runs locally in the visitor's browser CPU while playing a full Human-vs-AI geolocation game.**
