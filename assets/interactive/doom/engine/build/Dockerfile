ARG EMSDK_IMAGE=emscripten/emsdk:4.0.8
FROM ${EMSDK_IMAGE}

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git lemon ninja-build python3 re2c \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
ENTRYPOINT ["bash", "/workspace/assets/interactive/doom/engine/build/build.sh"]
