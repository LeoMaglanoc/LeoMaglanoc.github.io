# G1 mesh-loading recovery — 2026-10-09

The reported Android Chrome screenshot shows `pelvis_contour_link.STL` returning
HTTP 503. The public page loaded successfully during this investigation, so the
original server failure was transient; its upstream cause was not established.

A Docker Python HTTP server serving the generated Jekyll site injected 503
responses for precisely that mesh. Chrome at 390 × 844 reproduced the original
blank scene and `Simulator unavailable` before the change.

The fixed loader keeps at most four mesh downloads in flight. Asset downloads
have a 15-second timeout and up to four attempts, with 350/700/1400 ms backoff for
network/body interruptions, HTTP 408/429 and server errors. Retries bypass the
HTTP cache. Manifest and XML requests also check status and retry. Other HTTP
errors, including 404, fail immediately. A failed startup exposes a Retry button
that reloads the inner simulator, clearing partially initialized resources.

Validation:

- Docker Node 22: all 11 G1 tests passed, including transient recovery, bounded
  retries, immediate 404 failure, interrupted body recovery, concurrency and
  draining active downloads on failure.
- Chrome phone portrait (390 × 844): two injected mesh 503s followed by 200
  recovered automatically and rendered the robot. Pause, Reset and Push worked.
- Chrome phone landscape (844 × 390): robot and controls rendered correctly.
- Chrome portrait, four injected 503s: automatic attempts stopped, Retry appeared,
  and clicking it recovered when the fifth mesh request succeeded.
- Chrome desktop (1440 × 900): rendered robot, running physics, push counter,
  pause and reset; body width and scroll width both 1440.
- Docker Jekyll build, CSS purge and SLAM build/assets check passed. Published
  runtime parity checked 549 files. Site checker passed 22 project URLs and
  90 HTML dependencies; generated site was 999,366,247 bytes.

These are Chrome viewport checks, not a test on the physical Android phone.
Temporary fault servers and screenshots were kept outside the repository.
