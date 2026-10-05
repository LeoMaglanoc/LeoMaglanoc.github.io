/* Pointer gestures use incremental deltas and rebase whenever pointer count changes. */
export function clampPhoto(state, box, fitted) {
  const scale = Math.max(1, Math.min(4, state.scale));
  const x = Math.max(0, (fitted.width * scale - box.width) / 2);
  const y = Math.max(0, (fitted.height * scale - box.height) / 2);
  return { scale, x: Math.max(-x, Math.min(x, state.x)), y: Math.max(-y, Math.min(y, state.y)) };
}
export function photoStep(state, factor, anchor, delta = { x: 0, y: 0 }) {
  const scale = Math.max(1, Math.min(4, state.scale * factor)),
    ratio = scale / state.scale;
  return { scale, x: anchor.x - (anchor.x - state.x) * ratio + delta.x, y: anchor.y - (anchor.y - state.y) * ratio + delta.y };
}
export function mapStep(view, factor, anchor, delta = { x: 0, y: 0 }) {
  const width = Math.max(87.5, Math.min(700, view[2] / factor)),
    ratio = width / view[2];
  const height = width * 0.9;
  return [
    Math.max(0, Math.min(700 - width, anchor.x - (anchor.x - view[0]) * ratio - delta.x * ratio)),
    Math.max(0, Math.min(630 - height, anchor.y - (anchor.y - view[1]) * ratio - delta.y * ratio)),
    width,
    height,
  ];
}
function geometry(pointers) {
  const p = [...pointers.values()].slice(0, 2);
  return {
    x: p.reduce((s, v) => s + v.x, 0) / p.length,
    y: p.reduce((s, v) => s + v.y, 0) / p.length,
    distance: p.length === 2 ? Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) : 0,
  };
}
export function pointerGestures(el, { change, tap = () => {} }) {
  const pointers = new Map();
  let previous,
    start,
    moved = false,
    pinched = false;
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    if (!pointers.size) {
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      pinched = false;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size > 1) pinched = true;
    previous = geometry(pointers);
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const current = geometry(pointers);
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) moved = true;
    if (moved || pinched)
      change({
        factor: previous.distance > 0 && current.distance > 0 ? current.distance / previous.distance : 1,
        anchor: { x: previous.x, y: previous.y },
        delta: { x: current.x - previous.x, y: current.y - previous.y },
        pinched,
      });
    previous = current;
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    // Even a final pointerup far from pointerdown must not create a guess.
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) moved = true;
    pointers.delete(e.pointerId);
    if (e.type === "pointercancel" || e.type === "lostpointercapture") moved = true;
    if (!pointers.size) {
      if (!moved && !pinched) tap(e);
      previous = null;
    } else previous = geometry(pointers);
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(type, end);
  return {
    cancel() {
      pointers.clear();
      previous = null;
      moved = true;
    },
  };
}
