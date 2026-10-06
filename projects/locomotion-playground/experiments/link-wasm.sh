#!/bin/bash
set -euo pipefail
cd /workspace/projects/locomotion-playground/experiments
emcc -O1 -c decode_solution.c -o build/decode_solution.o
emcc -O1 -c wrapper.c -o build/wrapper.o
em++ build/solver_function.o build/decode_solution.o build/wrapper.o build/fatrop/libfatrop.a build/external/blasfeo/libblasfeo.a -O1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8388608 -sEXPORTED_FUNCTIONS='["_solve_mpc","_malloc","_free"]' -o ../mpc/generated.js
