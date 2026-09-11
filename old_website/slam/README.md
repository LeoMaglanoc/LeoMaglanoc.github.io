# Monocular SLAM browser app

This directory contains a standalone static application mounted at `/slam/` by the website deployment workflow. It does not use Jekyll at runtime. The application captures a rear-facing camera stream, sends frames to AlvaAR's WebAssembly visual-SLAM implementation, renders tracked feature points, and exposes a Three.js sparse-map view.

## Local development

```bash
cd assets/interactive/slam/app
npm test
python3 -m http.server 8080
```

Open `http://localhost:8080/` in a browser. Camera access is permitted on localhost. The application also accepts a local video file through **Developer inputs** for deterministic browser-path experiments.

For deterministic frame replay, select multiple image files in `rgb.txt` order. The developer panel can export a JSON pose trace containing tracking state, position, orientation, feature count, and sparse-map count for every processed frame.

## Architecture

```text
HTMLVideoElement → capture canvas → AlvaAR.findCameraPose()
                                      ├── pose → trajectory + camera frustum
                                      ├── frame points → camera overlay
                                      └── map points → sparse Three.js cloud
```

The map is sparse and monocular. Coordinates are map units, not meters; absolute scale is not observable from a monocular camera alone.

The current AlvaAR pipeline does not expose an integrated loop-closure signal, so the app reports tracking and mapping telemetry without claiming global loop closure.

## AlvaAR provenance

The browser runtime is derived from [alanross/AlvaAR](https://github.com/alanross/AlvaAR) at commit `7796af500ee92001ac2a9888363ff64d7a3bee75`. AlvaAR is GPLv3. The source patch and build instructions for the added `getMapPoints()` binding are in [`../engine/`](../engine/). The patch adds an export wrapper only; it does not change the SLAM algorithm.

## Regression data

The TUM RGB-D sequences are intentionally not committed because the raw frames are large. Use the scripts in [`../test-data/`](../test-data/) to download the official sequences and create local browser videos/manifests.
