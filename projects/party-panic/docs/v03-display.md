# v0.3 persistent display

DisplayMode remains the sole owner of fullscreen/orientation/wake resources.
Main-menu Enter Party Panic, Host, Join and invitation Continue synchronously
invoke enter() in a genuine gesture. Solo, Ready and Start retain that behavior.
No automatic entry on load, navigation click inheritance or fullscreen loop.

Room reset, leave, connection failure, rematch, results and mode switching do not
exit display. Brand uses in-document reset (no navigation) to preserve fullscreen.
Explicit Exit Fullscreen and browser/system exit remain available. Escape invalidates
pending orientation/wake grants and never triggers reentry. Visibility only manages
wake resources. Persisted pagehide releases resources; a later gesture can reenter.
A failed or unsupported API never blocks game controls; portrait gets a rotation hint.

MDN requestFullscreen, ScreenOrientation.lock and User activation pages were read.
Transient activation belongs to the requesting document; cross-document links cannot
make the destination fullscreen. No PWA/service worker or new architecture is needed.

Tests: existing lifecycle units plus genuine-click browser tests with mocked success,
fullscreen denial and orientation denial, early menu entry, Back, results, rematch,
leave, explicit exit/reentry and browser exit. Results and raw logs: v03-validation.md.
These tests establish application behavior, not physical iOS/Android API support.
Android Chrome and iPhone Safari fullscreen/orientation/wake: NOT TESTED.
