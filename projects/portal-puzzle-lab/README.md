# Portal Puzzle Lab

Original WebGL puzzle at `/portal/`. No ML, backend, API, WebGPU, downloaded game
assets or inference service. Three.js 0.180.0 + Cannon-es 0.20.0 are vendored
locally from the pinned lockfile. Source is here; published runtime is under
`assets/interactive/portal-puzzle-lab/` using the site's project-assets manifest.

## Docker development

From the repository root:

```sh
docker compose -f projects/portal-puzzle-lab/compose.yaml run --rm tools
# npm ci, restore vendored distributions, physics/math tests

docker run --rm -v "$PWD":/work -w /work python:3.10-slim \
  sh -c 'pip install pyyaml && python scripts/publish-project-assets.py --site-only'
docker run --rm -v "$PWD":/srv/jekyll -w /srv/jekyll \
  amirpourmand/al-folio:v0.14.7 bundle exec jekyll build
docker compose -f projects/portal-puzzle-lab/compose.yaml up -d preview
# http://127.0.0.1:8098/portal/
```

See VALIDATION.md for browser checks and CHECKPOINTS.md for continuation.

## Architecture

- `src/level.js`: metre-scale chamber, spawn, cube, plate and panel geometry.
- `src/portal.js`: local frame, half-turn transfer, swept plane crossing and
  physical position / orientation / linear and angular velocity transforms.
- `src/simulation.js`: fixed 120 Hz Cannon world, dynamic player and cube,
  paired wall apertures, carry spring, plate, door, reset and completion.
- `src/view.js`: Three scene, original geometry / canvas labels, one-level
  screen-space render targets with transformed camera and exit-plane clipping.
- `src/input.js`: pointer lock, keyboard and independent touch pointer capture.
- `src/game.js`: lifecycle, accumulator, timer, synthesized sound and overlays.

The MIT upstream portal frame / camera / screen-space technique is adapted,
with attribution and the original license preserved. The upstream starter UI,
level system, texture and audio assets are not imported. See THIRD_PARTY_NOTICES.md.

White panels use floor-aligned rails: portal height is fixed at 2.8 m, its centre
at 1.4 m. Horizontal aim controls placement; margins reject edges and overlap.
This intentionally narrows the plan's surface support to wall portals for a
reliable first chamber. Every portal normal is horizontal, keeping gravity
upright; general floor/ceiling portals require further controller work.

Pairing opens a rectangular 1.9 × 2.8 m aperture by splitting the host collider
and visual wall into side/top pieces. With only one portal the wall stays solid.
A moved portal closes its old aperture; relocation is refused while a body is
near it. Swept centre-plane crossings teleport bodies, preserving rotational
and linear momentum and updating Cannon interpolation and broadphase state.
A 160 ms cooldown prevents instant loops. The player motor accelerates toward
walking velocity; transformed momentum is preserved at crossing then affected
by the ordinary motor. The cube remains a dynamic box while held, driven by a
bounded damped spring. It may cross first; the spring chooses the shorter carry
point across the portal link until the player follows. Glass blocks bodies but
passes portal shots, so the remote panel can be reached from the starting room.

The cube must rest over the plate and be released. The exit stays open only
while the cube occupies the plate; it does not latch. Enter the green-lined exit
to finish. Reset restores all gameplay state without rebuilding the renderer.

Desktop: WASD, mouse or arrow look, left/right click portals, E grab/drop,
Space jump, R restart, Esc unlock cursor. Touch: left joystick, right swipe,
BLUE/ORANGE/GRAB buttons. Pointer cancellation, blur and backgrounding clear
held input. Help pauses physics. Sound is opt-in and generated with Web Audio.

DPR ≤ 1.5; portal texture long edge ≤ 1000 px desktop / 640 px coarse pointer.
Aspect is maintained across resize. Offscreen and back-facing portals skip their
passes. There are no shadows, recursion or postprocessing. Published dependencies
are fully local. Test inspection is only available at the runtime `?debug=1` URL.
