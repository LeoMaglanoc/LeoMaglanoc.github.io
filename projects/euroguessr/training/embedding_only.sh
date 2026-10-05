#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
RUN="${RUN_ROOT:-artifacts/geoclip-overnight}"
STOP_AT="${STOP_AT:-2026-10-06T08:25:00+02:00}"
COMMON=(--manifest "$RUN/manifest.json" --run-dir "$RUN/embedding-only" --teacher-cache "$RUN/teacher-cache" --geo-weight 0.7 --kd-weight 0 --embed-weight 0.3 --stop-at "$STOP_AT")
if [[ ! -f "$RUN/embedding-only/last.pt" ]]; then
 docker compose run --rm research python training/student_train.py "${COMMON[@]}" --cell-definition "$RUN/cells.json" --warm-start checkpoints/current/best.pt --prefix-cache "$RUN/prefix.npy" --epochs 80 --patience 20 2>&1 | tee "$RUN/embedding-only-bootstrap.log"
fi
if [[ ! -f "$RUN/embedding-only-finetune.done" ]]; then
 docker compose run --rm research python training/student_train.py "${COMMON[@]}" --resume --finetune --tail-blocks 2 --prefix-cache "$RUN/prefix-tail2.npy" --epochs 100 --patience 25 --export 2>&1 | tee "$RUN/embedding-only-finetune.log"
touch "$RUN/embedding-only-finetune.done"
fi
if [[ ! -f "$RUN/embedding-only/checkpoint-selection.json" ]]; then
 docker compose run --rm research python training/select_student_checkpoint.py --run-dir "$RUN/embedding-only" --audit-teacher "$RUN/validation-teacher" 2>&1 | tee "$RUN/embedding-only-checkpoint-comparison.log"
fi
