# Patched AlvaAR build

The shipped `app/assets/alva_ar.js` is built from [alanross/AlvaAR](https://github.com/alanross/AlvaAR) commit `7796af500ee92001ac2a9888363ff64d7a3bee75`.

This fork adds one read-only binding:

```text
System.getMapPoints(bufferPtr, maxPoints)
```

It copies initialized, non-bad map points as packed `x y z r g b` floats. No SLAM algorithm changes are made. The exact source changes are recorded in [`alvaar.patch`](./alvaar.patch).

## Rebuild

Install and activate Emscripten, then run:

```bash
./assets/interactive/slam/engine/build-wasm.sh
```

The script downloads the pinned upstream source into a temporary build directory, applies the patch, compiles the dependencies, and writes the generated browser runtime into `app/assets/alva_ar.js`. The upstream repository includes the dependency source and licenses used by the build.

The upstream build currently requires a few portability fixes for modern Emscripten: it disables Eigen tests, removes native CPU flags from wasm targets, uses `python3`, removes a retired OpenCV linker flag, and applies portable shell commands. The build script applies those compatibility edits after the API patch so the build remains reproducible across an activated Emscripten installation.
