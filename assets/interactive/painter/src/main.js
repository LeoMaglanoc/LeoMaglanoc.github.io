import { C } from "./config.js";
import { PandaSimulation } from "./simulation.js";
import { PandaRenderer } from "./renderer.js";
import { MarkerIK } from "./ik.js";
import { planPath } from "./planner.js";
import { Executor } from "./executor.js";
import { InkModel } from "./ink-model.js";
import { DrawingView } from "./canvas-renderer.js";
import { bindDrawing, compactInput } from "./drawing-input.js";
import { detectMissing } from "./error-detector.js";
import { repairRuns } from "./repair-planner.js";
import { worldToPixel } from "./coordinate-map.js";
import { distance } from "./stroke-processing.js";
import { UI, STATES as S, busyState } from "./ui.js";

export class PainterApp {
  constructor() {
    this.state = S.LOADING;
    this.auto = false;
    this.strokes = [];
    this.preview = [];
    this.ink = new InkModel();
    this.sim = new PandaSimulation();
    this.ui = new UI();
    this.view = new DrawingView(document.getElementById("reference"), document.getElementById("current"));
    this.token = 0;
    this.accumulator = 0;
    this.lastTime = null;
    this.lastDetection = 0;
    this.erasing = false;
    this.referenceGesture = false;
    this.resumeRepair = false;
    this.eraser = null;
    this.bindInputs();
    this.view.renderReference(this.strokes);
    this.observe();
  }
  setState(state, message) {
    this.state = state;
    this.ui.progress.textContent = "";
    this.ui.update(this, message);
  }
  async init() {
    try {
      this.renderer = new PandaRenderer(document.getElementById("robot"));
      await this.sim.init();
      this.ik = new MarkerIK(this.sim);
      this.executor = new Executor(this.sim, this.ink);
      // Validate contact and hover reachability before enabling controls.
      for (const p of [
        [320, 256],
        [0, 0],
        [639, 0],
        [0, 511],
        [639, 511],
      ]) {
        const { pixelToWorld } = await import("./coordinate-map.js");
        this.ik.solve(pixelToWorld(p), this.sim.home);
        this.ik.solve(pixelToWorld(p, C.hoverZ), this.sim.home);
      }
      this.renderer.buildModel(this.sim.model);
      this.renderer.addInkBoard(this.view.inkRaster);
      this.setState(S.READY, "Ready. Draw on REFERENCE, then press Paint.");
      requestAnimationFrame((t) => this.frame(t));
    } catch (error) {
      this.fail(error);
    }
  }
  fail(error) {
    this.executor?.cancel();
    this.preview = [];
    this.setState(S.ERROR, error.message || String(error));
    this.display();
    console.error(error);
  }
  syncInk() {
    const changed = this.view.syncInk(this.ink);
    if (changed && this.renderer?.inkTexture) this.renderer.inkTexture.needsUpdate = true;
    return changed;
  }
  observe() {
    this.syncInk();
    this.detection = detectMissing(this.strokes, this.view.pixels());
    this.lastDetection = performance.now();
    this.ui.update(this);
    this.display();
  }
  display() {
    this.view.display(this.detection, this.preview, this.eraser);
  }
  cancel(message = "Cancelled. Robot holds its current pose.") {
    this.token++;
    this.deadline = null;
    this.resumeRepair = false;
    this.executor?.cancel();
    this.preview = [];
    this.setState(S.CANCELLED, message);
    this.observe();
  }
  reset() {
    this.cancel();
    this.sim.reset();
    this.strokes = [];
    this.ink.clear();
    this.eraser = null;
    this.erasing = this.referenceGesture = false;
    this.view.renderReference(this.strokes);
    this.observe();
    this.setState(S.READY, "Reset. Draw a new reference.");
  }
  scheduleRepair() {
    if (!this.detection.missingSamples) {
      this.setState(S.COMPLETE, "Complete. All reference samples are covered.");
      return;
    }
    this.deadline = performance.now() + 2000;
    this.setState(S.REPAIR_COUNTDOWN, "Repairing in 2.0s…");
  }
  async run(repair = false, cycleStart = null) {
    if (!this.sim.model || busyState(this.state) || this.erasing || this.referenceGesture) return;
    this.deadline = null;
    this.observe();
    let strokes = this.strokes.map((s) => s.map((p) => [...p]));
    if (repair) {
      strokes = repairRuns(this.detection, worldToPixel(this.sim.tipPosition()));
      if (!strokes.length) {
        this.setState(S.COMPLETE, "Complete. All reference samples are covered.");
        return;
      }
    }
    const token = ++this.token;
    this.cycleStart = repair ? cycleStart ?? this.detection.missingPercent : null;
    this.preview = repair ? strokes : [];
    this.display();
    this.setState(repair ? S.PLANNING_REPAIR : S.PLANNING_DRAW, repair ? "Planning repair from the current marker pose…" : "Planning drawing…");
    try {
      const plan = await planPath(
        this.ik,
        strokes,
        this.sim.data.qpos,
        () => token !== this.token,
        (p) => {
          this.ui.progress.textContent = `${Math.round(p * 100)}% planned`;
        },
        repair ? 2 : C.planningSpacing
      );
      if (!plan || token !== this.token) return;
      this.executor.start(plan);
      this.setState(
        repair ? S.REPAIRING : S.DRAWING,
        repair ? "Repairing damaged strokes. You can erase again to replan." : "Drawing from simulated marker motion…"
      );
    } catch (error) {
      if (token === this.token) this.fail(error);
    }
  }
  finishMotion() {
    const wasRepair = this.state === S.REPAIRING;
    this.preview = [];
    this.observe();
    if (wasRepair && this.detection.missingSamples) {
      if (this.cycleStart - this.detection.missingPercent < 0.05) {
        this.setState(S.REPAIR_STALLED, `Repair stalled. ${this.detection.missingPercent.toFixed(1)}% unresolved.`);
        return;
      }
      this.setState(S.COMPLETE, "Checking remaining damage…");
      void this.run(true);
      return;
    }
    this.setState(
      S.COMPLETE,
      this.detection.missingSamples
        ? `Drawing complete. ${this.detection.missingPercent.toFixed(1)}% missing; press Repair now.`
        : "Complete. All reference samples are covered. Erase CURRENT to damage the drawing."
    );
  }
  frame(time) {
    try {
      const dt = this.lastTime === null ? 0 : Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
      this.lastTime = time;
      this.accumulator += dt;
      let completed = false,
        steps = 0;
      while (this.accumulator >= C.dt && steps++ < 25) {
        completed = this.executor.step() || completed;
        this.accumulator -= C.dt;
      }
      const changed = this.syncInk();
      if (changed) {
        this.renderer.inkTexture.needsUpdate = true;
        this.display();
      }
      if (changed && time - this.lastDetection > 350) this.observe();
      if (completed) this.finishMotion();
      if (this.state === S.REPAIR_COUNTDOWN && !this.erasing && !this.referenceGesture) {
        const seconds = (this.deadline - performance.now()) / 1000;
        if (seconds <= 0) void this.run(true);
        else this.ui.status.textContent = `Repairing in ${seconds.toFixed(1)}s…`;
      }
      this.renderer.update(this.sim.data);
    } catch (error) {
      this.fail(error);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
  bindInputs() {
    bindDrawing(this.view.reference, {
      enabled: () => !!this.sim.model && !busyState(this.state) && !this.erasing && this.strokes.length < C.maxStrokes,
      start: (p) => {
        if (this.state === S.REPAIR_COUNTDOWN) this.cancel();
        this.referenceGesture = true;
        this.strokes.push([p]);
        this.preview = [];
        this.ui.update(this);
      },
      move: (p) => {
        if (!this.referenceGesture || !this.strokes.length) return;
        this.strokes.at(-1).push(p);
        compactInput(this.strokes);
        this.view.renderReference(this.strokes);
      },
      end: () => {
        this.referenceGesture = false;
        this.view.renderReference(this.strokes);
        this.observe();
        this.setState(S.READY, "Reference updated. Press Paint to draw it.");
      },
    });
    bindDrawing(this.view.current, {
      enabled: () => !!this.sim.model && !this.referenceGesture,
      start: (p, e) => {
        const resume = [S.PLANNING_REPAIR, S.REPAIRING, S.REPAIR_COUNTDOWN].includes(this.state);
        if (busyState(this.state) || this.state === S.REPAIR_COUNTDOWN) this.cancel("Damage detected. Motion stopped; release to replan.");
        this.resumeRepair = resume;
        this.erasing = true;
        // Keep a minimum finger-friendly CSS radius on narrow screens.
        const radius =
          e.pointerType === "touch" ? Math.max(C.eraserRadius, (18 * C.width) / this.view.current.getBoundingClientRect().width) : C.eraserRadius;
        this.eraser = { point: p, radius };
        this.ink.erase(p, radius);
        this.observe();
      },
      move: (p, from) => {
        if (!this.erasing || !this.eraser) return;
        const n = Math.max(1, Math.ceil(distance(p, from) / (this.eraser.radius / 2)));
        for (let i = 1; i <= n; i++)
          this.ink.erase(
            from.map((v, k) => v + ((p[k] - v) * i) / n),
            this.eraser.radius
          );
        this.eraser.point = p;
        this.syncInk();
        this.display();
      },
      end: () => {
        const resume = this.resumeRepair;
        this.erasing = false;
        this.eraser = null;
        this.resumeRepair = false;
        this.observe();
        if (this.detection.missingSamples && (this.auto || resume)) this.scheduleRepair();
        else this.setState(S.COMPLETE, "Damage observed. Press Repair now to redraw missing strokes.");
      },
    });
    const b = this.ui.buttons;
    b.paint.onclick = () => void this.run();
    b.repair.onclick = () => void this.run(true);
    b.cancel.onclick = () => this.cancel();
    b.reset.onclick = () => this.reset();
    b.auto.onclick = () => {
      this.auto = !this.auto;
      if (!this.auto && this.state === S.REPAIR_COUNTDOWN) this.cancel("Auto repair off.");
      else if (this.auto && !busyState(this.state) && !this.erasing && this.ink.segments.length && this.detection.missingSamples)
        this.scheduleRepair();
      this.ui.update(this);
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.cancel();
      if (e.key.toLowerCase() === "e" && !b.paint.disabled) b.paint.click();
      if (e.key.toLowerCase() === "a" && !b.auto.disabled) b.auto.click();
    });
  }
}
export const app = new PainterApp();
void app.init();
