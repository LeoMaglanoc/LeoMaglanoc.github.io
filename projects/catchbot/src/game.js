import { CONFIG as C, distance, boundTarget } from './config.js';
import { fk, caught } from './robot.js';
import { historyAt, predict, PredictionGate, cleanEvents } from './predictors.js';
import { control } from './controller.js';
export class Game {
  constructor(mode = 'velocity') {
    this.mode = mode;
    this.gate = new PredictionGate();
    this.reset();
  }
  reset(mode = this.mode) {
    this.mode = mode;
    this.q = [...C.initialQ];
    this.target = { x: 0.43, y: 0.38 };
    this.time = 0;
    this.score = 0;
    this.phase = 'ready';
    this.active = false;
    this.events = [];
    this.pendingInput = [];
    this.lastInputTime = 0;
    this.trace = [];
    this.nextPrediction = 0;
    this.segmentStart = 0;
    this.gate.reset();
    this.diagnostics = {
      updates: 0,
      warmingSteps: 0,
      expiredSteps: 0,
      projected: 0,
      failures: 0,
      latencyMs: [],
    };
  }
  start() {
    this.reset();
    this.phase = 'paused';
  }
  grab() {
    if (!['paused', 'warmup', 'playing'].includes(this.phase) || this.active) return false;
    this.active = true;
    this.phase = 'warmup';
    this.segmentStart = this.time;
    this.pendingInput = [];
    this.lastInputTime = this.time;
    this.events = [{ t: this.time, ...this.target }];
    this.trace.push({ t: this.time, ...this.target, kind: 'resume' });
    this.gate.reset();
    this.nextPrediction = this.time;
    return true;
  }
  move(point, timestamp = this.time) {
    if (!this.active || ![point.x, point.y, timestamp].every(Number.isFinite)) return;
    const p = { t: Math.max(this.segmentStart, timestamp), ...boundTarget(point) };
    if (p.t > this.time + 1e-10) this.pendingInput.push(p);
    else this.applyInput(p);
  }
  applyInput(p) {
    if (p.t < this.lastInputTime - 1e-10) return;
    this.lastInputTime = p.t;
    this.target = { x: p.x, y: p.y };
    this.events.push(p);
    this.trace.push({ ...p, kind: 'move' });
  }
  pause() {
    if (this.active) {
      this.trace.push({ t: this.time, ...this.target, kind: 'pause' });
      this.phase = 'paused';
    }
    this.active = false;
    this.pendingInput = [];
    this.gate.reset();
  }
  tick() {
    if (!this.active) return;
    this.time += C.dt;
    const pending = cleanEvents(this.pendingInput);
    this.pendingInput = pending.filter((p) => p.t > this.time + 1e-10);
    for (const p of pending) if (p.t <= this.time + 1e-10) this.applyInput(p);
    this.trace.push({ t: this.time, ...this.target, kind: 'sample' });
    // Bound memory while retaining more than the required 64-sample context.
    this.events = this.events.filter((p) => p.t >= this.time - 3 || p === this.events.at(-1));
    // Retain a held observation even without browser pointermove events.
    // This is a measurement at the current time, not a synthetic future event.
    this.events.push({ t: this.time, ...this.target });
    if (this.time + 1e-9 >= this.nextPrediction) {
      this.nextPrediction = this.time + C.predictionPeriod;
      const h = historyAt(this.events, this.time - C.delay);
      if (h) this.requestPrediction(h);
    }
    if (this.phase === 'warmup') {
      this.diagnostics.warmingSteps++;
      if (
        this.time - this.segmentStart >= C.warmup &&
        this.gate.latest &&
        distance(fk(this.q).tip, this.target) > C.captureRadius + 0.1
      )
        this.phase = 'playing';
      return;
    }
    if (this.phase !== 'playing') return;
    const result = control(this.q, this.gate.latest, this.time, this.mode);
    this.q = result.q;
    if (result.status === 'expired') this.diagnostics.expiredSteps++;
    if (result.projected) this.diagnostics.projected++;
    this.score = Math.min(C.duration, this.score + C.dt);
    if (caught(this.q, this.target)) {
      this.phase = 'caught';
      this.active = false;
    } else if (this.score >= C.duration - 1e-9) {
      this.phase = 'won';
      this.active = false;
    }
  }
  requestPrediction(h, implementation = predict) {
    const ticket = this.gate.ticket(),
      requestedAt = this.time,
      start = performance.now();
    const accept = (p) => {
      const latencyMs = performance.now() - start;
      p = { ...p, latencyMs };
      if (this.gate.accept(ticket, p, this.time, this.mode)) {
        this.diagnostics.updates++;
        this.diagnostics.latencyMs.push(latencyMs);
      }
    };
    try {
      const result = implementation(h, h.at(-1).t, C.horizon, requestedAt, this.mode);
      if (result?.then)
        result.then(accept).catch(() => {
          this.diagnostics.failures++;
        });
      else accept(result);
    } catch {
      this.diagnostics.failures++;
    }
  }
  exportTrace() {
    return {
      schema: 'catchbot-trace-v1',
      units: 'normalized world units and active simulation seconds',
      mode: this.mode,
      config: C,
      survivalTime: this.score,
      events: this.trace,
      diagnostics: this.diagnostics,
      note: 'Local opt-in export. Resume boundaries require separate histories. Fixed-trace replay is not a human-policy counterfactual.',
    };
  }
}
// A large frame gap pauses, rather than awarding unattended survival or catching up.
export class FixedClock {
  constructor() {
    this.reset();
  }
  reset() {
    this.last = null;
    this.accumulator = 0;
  }
  observationTime(timestampMs, game) {
    if (this.last === null) return game.time;
    const offset = (timestampMs - this.last) / 1000 + this.accumulator;
    if (offset > C.suspensionThreshold) {
      game.pause();
      this.reset();
      return null;
    }
    return Math.max(game.segmentStart, game.time + offset);
  }
  advance(timestampMs, game) {
    if (this.last === null) {
      this.last = timestampMs;
      return 0;
    }
    const elapsed = Math.max(0, (timestampMs - this.last) / 1000);
    this.last = timestampMs;
    if (elapsed > C.suspensionThreshold) {
      game.pause();
      this.accumulator = 0;
      return 0;
    }
    if (!game.active) {
      this.accumulator = 0;
      return 0;
    }
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator + 1e-10 >= C.dt) {
      game.tick();
      this.accumulator -= C.dt;
      steps++;
    }
    return steps;
  }
}
