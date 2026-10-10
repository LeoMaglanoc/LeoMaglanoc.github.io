# Validation — 2026-10-10

## Reproduction

Run the README Docker commands. The project uses committed source and vendored
npm distributions, then the existing publishing manifest. Build the site before
starting the nginx preview. `tests/browser.cjs` uses Playwright with actual
Chrome DevTools touch input, software WebGL, three isolated browser contexts,
and normal game controls. The solver reads the opt-in debug state to steer; it
never sets the player, cube, portals, plate, door or completion state.

Physics at 120 Hz is independent of renderer FPS. The simulation clamps each
frame's catch-up to 100 ms to avoid a spiral under severe overload. The timer is
real active play time, not simulation time; reported browser JSON distinguishes
them. Help/backgrounding pause gameplay. Rendering continues while help is open.

## Checks

- Six unit tests: reversible frame transforms and velocity magnitude;
  forward plane sweep / aperture rejection; edge / overlap placement and actual
  collider holes; bidirectional player traversal; cube traversal / plate / door /
  completion / reset; carried-cube traversal as player follows.
- Browser desktop 1440 × 900; phone portrait 412 × 915; phone landscape 915 × 412.
  All start at a fresh chamber, aim and place both portals, enter the vault,
  collect and bring the cube back, put it on the plate, walk around it to the
  exit, complete and replay. Mobile playthroughs use real CDP touch swipes,
  joystick holds and action taps for all game actions, with no keyboard steering.
- Mobile checks hold movement and look simultaneously with a third action touch,
  then cancel touches and verify movement clears. Both graphics profiles switch
  in place. Swapping phone orientation resizes targets at the camera aspect.
- Browser checks collect page/console errors, missing asset responses and bounds
  for visible buttons. Linked-portal and completed-game screenshots plus states,
  FPS and target dimensions are saved in `results/`.
- Chrome computer-agent inspection separately checks the Jekyll route, desktop,
  portrait and landscape presentation, starting/resuming, right-side swipe look,
  portal actions, help layout and the Fast/Quality control. These are emulated
  phone viewport sizes on the laptop, not a connected Galaxy device.
- The complete Docker Jekyll build and stable-route checker validate the new
  iframe route alongside the existing demo routes. The blog archive adds Portal
  first; the four homepage feature cards are unchanged.

## Exploratory fixes

Physics tests exposed excessive player friction and a held cube's spring
initially choosing the wrong side of the link; both are fixed. Browser checks
caught keyboard focus after Start, a missing fullscreen-route favicon, portal
linear/sRGB conversion and decoration line raycasts accidentally blocking shots.
Only collision meshes now block portal shots; observation glass deliberately
passes them. The cube retains collisions while held, including the plate.

## Limits

No physical Galaxy S24 FE is available here; Android performance and touch comfort
on that device remain unverified. Software Chromium FPS must not be presented as
phone or GPU-backed desktop FPS. 60 FPS desktop / 30 FPS phone remain hardware
performance targets, not guarantees. Quality keeps the original sharper targets;
Fast reduces screen and portal pixel work. The explicit setting persists and
Quality is never automatically downgraded after an explicit choice.

Only floor-aligned rectangular wall portals are supported, with a single render
level. There are no floor/ceiling portals or recursive views. The whole body
changes rooms when its centre crosses the plane; there are no straddling-body
visual duplicates. Oblique near-plane replacement and a genuinely connected
Android playthrough are future validation work. Pressure plate is non-latching;
walking into the resting cube can push it away and close the door. Walk around
it along the green exit line.

The chamber can be completed using the shipped controls from a fresh state.
The debug URL exists for test inspection; completion is not scripted or triggered
through debug mutation. No machine-learning models were introduced or trained.

## Recorded results

The complete browser suite passed on 2026-10-10 with Chromium 154 in Docker.
All three contexts reported zero console/page errors and zero missing assets.
Every solved state records two player crossings and at least one cube crossing.

| Viewport | Simulation time to completion | Real active time | Fast FPS after replay |
| --- | ---: | ---: | ---: |
| desktop | 41.6 s | 60.6 s | 12.4 |
| phone-portrait | 44.4 s | 45.2 s | 32.5 |
| phone-landscape | 22.0 s | 22.2 s | 18.4 |

These FPS values are single post-replay samples with portals reset and SwiftShader,
not sustained gameplay benchmarks. Render resolution was 384 pixels on the portal
target long edge in Fast. JSON preserves exact states and dimensions. Screenshots
are from linked portals and completion; results do not claim physical Android QA.

Final production smoke checks also passed in all three viewports with the Jekyll
output (including minified modules): fresh load, public debug API absence, portal
shots, both graphics settings, pause/help bounds and route refresh. The final
local site uses the deployment workflow's separately built SLAM viewer before
running the stable-route checker.
