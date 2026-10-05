#!/usr/bin/env bash
# Reproducible CPU workflow. Exports remain private; promotion requires a separate gate.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT_RUN="artifacts/geoclip-overnight"
STOP_AT="${STOP_AT:-2026-10-06T08:25:00+02:00}"
TEACHER_STOP_AT="${TEACHER_STOP_AT:-2026-10-06T01:15:00+02:00}"
mkdir -p "$ROOT_RUN" data/model-cache
research() { docker compose run --rm research python "$@"; }
docker compose build
if [[ ! -f "$ROOT_RUN/teacher-benchmark.json" ]]; then
 research training/benchmark_teacher.py 2>&1 | tee "$ROOT_RUN/benchmark.log"
fi
if [[ ! -f "$ROOT_RUN/manifest.json" ]]; then
 research training/prepare_experiment.py --train 8500 --val 1000 --test 600 --shards 3 2>&1 | tee -a "$ROOT_RUN/prepare.log"
fi
research training/isolate_baseline_holdouts.py --run-root "$ROOT_RUN"
research training/validate_manifest.py --manifest "$ROOT_RUN/manifest.json" --output "$ROOT_RUN/leakage-check.json"
# Head-only grid comparison shares the frozen prefix cache and ImageNet/baseline encoder.
for count in 64 96 128; do
 if [[ ! -f "$ROOT_RUN/grid-$count/completion.json" ]]; then
  START=(--warm-start checkpoints/current/best.pt)
  if [[ -f "$ROOT_RUN/grid-$count/last.pt" ]]; then START=(--resume); fi
  research training/student_train.py --manifest "$ROOT_RUN/manifest.json" --run-dir "$ROOT_RUN/grid-$count" --cells "$count" "${START[@]}" --prefix-cache "$ROOT_RUN/prefix.npy" --epochs 50 --patience 12 --stop-at "$STOP_AT" 2>&1 | tee "$ROOT_RUN/grid-$count.log"
 fi
done
if [[ ! -f "$ROOT_RUN/teacher-budget.json" ]]; then
 research training/plan_teacher.py --run-root "$ROOT_RUN" --teacher-stop-at "$TEACHER_STOP_AT"
fi
BATCH=$(python3 -c "import json; print(json.load(open('$ROOT_RUN/teacher-budget.json'))['batch_size'])")
COUNT=$(python3 -c "import json; print(json.load(open('$ROOT_RUN/teacher-budget.json'))['teacher_count'])")
research training/cache_teacher.py --manifest "$ROOT_RUN/manifest.json" --cells "$ROOT_RUN/cells.json" --output "$ROOT_RUN/teacher-cache" --batch-size "$BATCH" --count "$COUNT" --stop-at "$TEACHER_STOP_AT" 2>&1 | tee -a "$ROOT_RUN/teacher.log"
for run in supervised distilled; do
 TEACHER=()
 if [[ "$run" == distilled ]]; then TEACHER=(--teacher-cache "$ROOT_RUN/teacher-cache" --geo-weight 0.5 --kd-weight 0.2 --embed-weight 0.3); fi
 if [[ ! -f "$ROOT_RUN/$run/last.pt" ]]; then
  research training/student_train.py --manifest "$ROOT_RUN/manifest.json" --run-dir "$ROOT_RUN/$run" --cell-definition "$ROOT_RUN/cells.json" --warm-start checkpoints/current/best.pt --prefix-cache "$ROOT_RUN/prefix.npy" --epochs 80 --patience 20 --stop-at "$STOP_AT" "${TEACHER[@]}" 2>&1 | tee "$ROOT_RUN/$run-bootstrap.log"
 fi
 research training/student_train.py --manifest "$ROOT_RUN/manifest.json" --run-dir "$ROOT_RUN/$run" --resume --finetune --prefix-cache "$ROOT_RUN/prefix.npy" --epochs 100 --patience 25 --stop-at "$STOP_AT" --export "${TEACHER[@]}" 2>&1 | tee -a "$ROOT_RUN/$run-finetune.log"
done
research training/cache_teacher.py --manifest "$ROOT_RUN/manifest.json" --cells "$ROOT_RUN/cells.json" --output "$ROOT_RUN/validation-teacher" --role val --count 100 --batch-size "$BATCH" 2>&1 | tee -a "$ROOT_RUN/validation-teacher.log"
for run in supervised distilled; do
 research training/evaluate_student.py --run-dir "$ROOT_RUN/$run" --audit-teacher "$ROOT_RUN/validation-teacher" 2>&1 | tee "$ROOT_RUN/$run-evaluate.log"
done
research training/compare_baseline.py --manifest "$ROOT_RUN/manifest.json" --output "$ROOT_RUN/baseline-comparison.json" 2>&1 | tee "$ROOT_RUN/baseline-evaluate.log"
printf 'Validation comparisons ready. Lock the deployment selection before final test, promotion, browser checks and checkpoint bundling.\n'
