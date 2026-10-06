#!/bin/bash
set -euo pipefail
cd /workspace/projects/locomotion-playground/experiments
emcmake cmake -S fatrop -B build -DBLASFEO_TARGET=GENERIC -DMARCH_NATIVE=OFF -DBUILD_EXECUTABLES=OFF -DBUILD_SHARED_LIBS=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build -j2
emcc -O1 -I fatrop -I fatrop/external/blasfeo/include -c solver_function.c -o build/solver_function.o
em++ build/solver_function.o build/fatrop/libfatrop.a build/external/blasfeo/libblasfeo.a -O1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8388608 -sEXPORTED_FUNCTIONS='["_solver_function","_solver_function_work","_solver_function_n_in","_solver_function_n_out","_solver_function_checkout","_solver_function_release","_malloc","_free"]' -o build/mpc.js
