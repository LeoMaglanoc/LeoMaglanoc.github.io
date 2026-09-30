import { C } from "./config.js";
import { distance } from "./stroke-processing.js";
export function bindDrawing(canvas, handlers) {
  let pointer = null,
    last = null;
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(C.width - 1, ((event.clientX - r.left) / r.width) * C.width)),
      Math.max(0, Math.min(C.height - 1, ((event.clientY - r.top) / r.height) * C.height)),
    ];
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (pointer !== null || (e.pointerType === "mouse" && e.button !== 0) || !handlers.enabled()) return;
    e.preventDefault();
    pointer = e.pointerId;
    last = point(e);
    canvas.setPointerCapture(pointer);
    handlers.start(last, e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointer) return;
    e.preventDefault();
    const p = point(e);
    if (distance(p, last) >= 2) {
      handlers.move(p, last, e);
      last = p;
    }
  });
  function end(e) {
    if (e.pointerId !== pointer) return;
    if (e.type === "pointerup") handlers.move(point(e), last, e);
    pointer = null;
    last = null;
    handlers.end(e);
  }
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("lostpointercapture", end);
}
export function compactInput(strokes) {
  const total = strokes.reduce((n, s) => n + s.length, 0);
  if (total > C.maxInputPoints) {
    for (let i = 0; i < strokes.length; i++) {
      // Bound live input without joining disconnected strokes.
      const s = strokes[i];
      if (s.length > 2) strokes[i] = [s[0], ...s.slice(1, -1).filter((_, j) => j % 2 === 0), s.at(-1)];
    }
  }
}
