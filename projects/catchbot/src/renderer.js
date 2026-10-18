import { CONFIG as C } from './config.js';
import { fk } from './robot.js';
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = r.width;
    this.height = r.height;
    this.scale = Math.max(1, (Math.min(r.width, r.height) - 48) / 2);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.dpr = dpr;
  }
  toWorld(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (x - r.left - this.width / 2) / this.scale,
      y: -(y - r.top - this.height / 2) / this.scale,
    };
  }
  toScreen(p) {
    return { x: this.width / 2 + p.x * this.scale, y: this.height / 2 - p.y * this.scale };
  }
  draw(game) {
    const ctx = this.ctx,
      s = this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(s, -s);
    const line = (a, b, color, width) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    const circle = (p, r, fill, stroke, width = 0.006) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke();
      }
    };
    circle({ x: 0, y: 0 }, C.arenaRadius, '#101c29', '#344554', 0.006);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, C.arenaRadius, 0, Math.PI * 2);
    ctx.clip();
    for (let x = -1; x <= 1.01; x += 0.145) {
      line({ x, y: -1 }, { x, y: 1 }, '#1d2b39', 0.003);
      line({ x: -1, y: x }, { x: 1, y: x }, '#1d2b39', 0.003);
    }
    circle({ x: 0, y: 0 }, C.arenaRadius / 2, null, '#2a3945', 0.003);
    ctx.restore();
    const prediction = game.gate.latest;
    if (prediction && prediction.targetTime > game.time && game.active) {
      const p = prediction.predictedPosition;
      ctx.setLineDash([0.025, 0.025]);
      line(game.target, p, '#94f0c17a', 0.005);
      ctx.setLineDash([]);
      circle(p, 0.04, null, '#a2f9cd', 0.005);
      line({ x: p.x - 0.06, y: p.y }, { x: p.x + 0.06, y: p.y }, '#a2f9cd', 0.004);
      line({ x: p.x, y: p.y - 0.06 }, { x: p.x, y: p.y + 0.06 }, '#a2f9cd', 0.004);
    }
    const { elbow, tip } = fk(game.q);
    ctx.lineCap = 'round';
    for (const [a, b] of [
      [C.base, elbow],
      [elbow, tip],
    ]) {
      line(a, b, '#050c15', 0.085);
      line(a, b, '#f6b78e', 0.058);
      line(a, b, '#ffd8b1', 0.015);
    }
    circle(C.base, 0.082, '#233443', '#f6b78e', 0.012);
    circle(C.base, 0.025, '#f6b78e');
    circle(elbow, 0.058, '#182331', '#ffd5b2', 0.012);
    circle(elbow, 0.017, '#f6b78e');
    circle(tip, C.captureRadius, '#f6b78e18', '#ffbd90', 0.007);
    circle(tip, 0.023, '#ffe0b8');
    const target = game.target;
    ctx.shadowColor = '#9effc5';
    ctx.shadowBlur = 18 / this.dpr;
    circle(target, 0.045, '#a8ffd2');
    ctx.shadowBlur = 0;
    // Large ring remains visible around a finger; collision still uses .062 world units.
    circle(target, Math.max(0.115, 23 / s), '#98ffd00a', '#a8ffd2', 0.009);
    circle(target, Math.max(0.135, 27 / s), null, '#a8ffd235', 0.004);
    ctx.restore();
  }
}
