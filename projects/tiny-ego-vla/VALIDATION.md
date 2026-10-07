# TinyEgoVLA validation record

Date: 2026-10-07. Browser: installed Google Chrome, controlled through the Chrome computer-use agent. Viewport overrides test responsive layout; these are not physical-phone hardware or touch-performance measurements.

## Browser checks during development

- Desktop: 1440 × 1000.
- Phone portrait: 390 × 844, plus narrower 320 × 740.
- Phone landscape: 844 × 390.
- Real human/expert MP4s decode and advance; recorded overlays follow playback.
- Human clip selection changes source and train/validation attribution. Overlay mode controls work.
- Human held-out prediction navigation advances the recorded example; architecture disclosure shows actual parameters, loss and CPU time.
- Learned policy replay selects the requested held-out start; playback is synchronized, with shorter episodes holding their final frame. Speed persists across selection changes; restart and keyboard timeline controls are checked.
- Adaptation explains which weights transfer and which output head is discarded. Practice is explicitly marked not performed.

Issues found and fixed through Chrome:

1. Long checkpoint SHA in the method drawer widened portrait layout: permit wrapping and allow grid children to shrink.
2. Large title overflowed the 320-pixel viewport: clamp the mobile title size.
3. Old overlay could linger during asynchronous clip switching: clear the canvas immediately and ignore stale label requests.
4. Changing a rollout reset playback to 1× while showing 2×: preserve default playback rate across video loads.
5. Stage switching during asynchronous playback could leave stale control state: invalidate stale playback requests.
6. Pipeline navigation now scrolls the selected stage into view.
7. Seeking against Python’s basic HTTP server was unsupported (Chrome reported zero seekable range). Rechecked using `http-server@14.1.1`, which supports byte ranges: both videos seek exactly to their own final frame and restart at zero. Playback controls remain disabled until both video metadata records load.

The local UI preview uses only completed, real records and is prominently labeled incomplete. Both the experiment tests and production route checker reject preview exports. Final full-export, built-route and live deployment checks are recorded below when complete.
