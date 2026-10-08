# Shared MuJoCo → Three.js renderer

`mujoco-three-renderer.js` consumes `mjv_updateScene` each rendered frame. It uses
MuJoCo Z-up world poses directly, cached geometry, independent face-corner normal
and UV indices, model materials, RGBA, transparency, and authored 2D/cube textures.
Mesh `dataid / 2` follows MuJoCo's visualization convention. Physics and policies
remain application owned. Common rigid geoms are supported: plane, sphere,
capsule, ellipsoid, cylinder, box and mesh. Flex/skin/heightfield rendering and
visualization arrows are outside the current scope; unsupported types fail clearly.

```js
const view = new MujocoThreeRenderer({ canvas, mujoco, model, data, geomGroups: [1, 2], excludeGeomIds: [] });
view.setCameraPreset({ position: [0.24, -0.32, 0.75], target: [-0.065, 0, 0.54] });
view.initialize();
view.update();
// dispose before replacing a model; dispose the application-owned model/data later.
view.dispose();
```

Applications choose visual groups, camera/follow, lighting scale and overlays.
G1 uses its original framing and floor palette. Its plane comes from the model;
the grid is decorative. The shared class contains no robot names or task logic.
Source is published with the repository asset manifest to `assets/interactive/shared`.

## Validation, 2026-10-08

Docker preview (`dexterous-rl-preview`, port 8093), Chrome computer-use agent.
Open `/tests/mujoco-renderer/` and run G1, Wuji and Primitive checks independently.
Checks cover visual geom counts, world positions, alpha, source normals, authored
cube textures, and stable mesh/geometry identities across 120 scene updates.
The infinite plane is exempt from position parity: MuJoCo centers it for the camera.

- G1 policy regression (`/tests/g1/`): 10 native traces pass; maximum observation
  error 1.49e-8, action error 6.56e-7, target error 2.98e-8. Standing for two
  simulated seconds retains a 0.776 m base height; a 0.4 m/s command walks
  1.04 m over three simulated seconds; reset returns the step count to zero.
- G1: 47 geoms, 27 source-normal meshes, 29 cached geometries; PASS.
- Wuji: 28 geoms, 27 source-normal meshes, 28 cached geometries, six textured
  physical cube faces; PASS.
- Primitive fixture: six geoms, including an alpha-0.5 box; PASS.
- G1 desktop 1440×900, portrait 390×844, landscape 844×390: reset/paused fixed
  screenshots before/after, intact links and silhouettes, shadows, no collision
  mesh duplicates. Reset, pause/resume and push exercised in Chrome.
- Source-normal versus generated-normal Wuji comparison is retained in `validation/`.
  Source normals preserve authored CAD creases and the palm recess edges;
  regenerated indexed normals visibly round these edges. Source normals remain
  the default. The comparison checkbox is only on the test page.

Scene update timings are samples from desktop Chrome with responsive emulation,
not physical Android hardware or GPU timings. Reports are in `validation/`.
Physics and policy code are unchanged by the G1 migration.
