export const STATES = Object.freeze({
  LOADING: "LOADING",
  READY: "READY",
  PLANNING_DRAW: "PLANNING_DRAW",
  DRAWING: "DRAWING",
  COMPLETE: "COMPLETE",
  PLANNING_REPAIR: "PLANNING_REPAIR",
  REPAIR_COUNTDOWN: "REPAIR_COUNTDOWN",
  REPAIRING: "REPAIRING",
  REPAIR_STALLED: "REPAIR_STALLED",
  CANCELLED: "CANCELLED",
  ERROR: "ERROR",
});
export const busyState = (state) => ["PLANNING_DRAW", "DRAWING", "PLANNING_REPAIR", "REPAIRING"].includes(state);
export class UI {
  constructor() {
    this.buttons = Object.fromEntries(["paint", "repair", "auto", "reset", "cancel"].map((id) => [id, document.getElementById(id)]));
    this.status = document.getElementById("status");
    this.metric = document.getElementById("metric");
    this.progress = document.getElementById("progress");
  }
  update(app, message) {
    if (message) this.status.textContent = message;
    const loaded = !!app.sim?.model,
      busy = busyState(app.state),
      hasStrokes = app.strokes.some((s) => s.length > 1);
    this.buttons.paint.disabled = !loaded || busy || app.erasing || app.referenceGesture || !hasStrokes;
    this.buttons.repair.disabled = !loaded || busy || app.erasing || app.referenceGesture || !hasStrokes || !app.detection?.missingSamples;
    this.buttons.cancel.disabled = !busy && app.state !== STATES.REPAIR_COUNTDOWN;
    this.buttons.reset.disabled = this.buttons.auto.disabled = !loaded;
    this.buttons.auto.setAttribute("aria-pressed", String(app.auto));
    this.buttons.auto.textContent = `Auto repair: ${app.auto ? "on" : "off"}`;
    this.metric.textContent = `MISSING / UNRECOVERED: ${(app.detection?.missingPercent || 0).toFixed(1)}%`;
  }
}
