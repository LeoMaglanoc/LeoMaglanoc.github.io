import { distance } from './config.js';
export function attachInput(canvas, game, renderer, clock) {
  let activePointer = null;
  const release = () => { activePointer = null; game.pause(); clock.reset(); };
  canvas.addEventListener('pointerdown', event => {
    if (activePointer !== null || event.button > 0) return;
    const point = renderer.toWorld(event.clientX, event.clientY);
    if (distance(point, game.target) > 0.18 || !game.grab()) return;
    activePointer = event.pointerId;
    canvas.setPointerCapture(activePointer); event.preventDefault(); clock.reset();
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    // Coalesced events are timestamped relative to the latest simulation boundary.
    // All are available now; clamp their times to that boundary, never extrapolate.
    const events = event.getCoalescedEvents?.() || [event];
    const batch = events.length ? events : [event];
    for (const e of batch) {
      const t = game.time - Math.max(0, event.timeStamp - e.timeStamp) / 1000;
      game.move(renderer.toWorld(e.clientX, e.clientY), t);
    }
    event.preventDefault();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
    if (event.pointerId !== activePointer) return;
    const id = activePointer; release();
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  window.addEventListener('blur', release);
  return { release };
}
