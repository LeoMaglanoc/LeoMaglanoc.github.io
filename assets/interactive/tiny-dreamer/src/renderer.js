export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  render(runner) {
    const { canvas, ctx } = this;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(rect.width * dpr) ||
      canvas.height !== Math.round(rect.height * dpr)
    ) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const w = rect.width,
      h = rect.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const scale = Math.min(w / 5, h / 2.9);
    const y = h * 0.52;
    const origin = w / 2;
    const x = (value) => origin + value * scale;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#d9ddd5";
    for (let v = -2; v <= 2; v += 0.5) {
      ctx.beginPath();
      ctx.moveTo(x(v), y - 1.18 * scale);
      ctx.lineTo(x(v), y + 1.12 * scale);
      ctx.stroke();
    }
    ctx.strokeStyle = "#a1a79d";
    ctx.beginPath();
    ctx.moveTo(x(-2.1), y + scale * 0.14);
    ctx.lineTo(x(2.1), y + scale * 0.14);
    ctx.stroke();
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#63705f";
    for (let v = -2; v <= 2; v += 1) {
      ctx.fillText(`${v === 0 ? "0" : v} m`, x(v), y + scale * 0.14 + 22);
    }
    const pose = (obs, ghost, alpha = 1) => {
      const cartX = x(obs[0]);
      const angle = Math.atan2(obs[2], obs[1]);
      const endX = cartX + Math.sin(angle) * scale,
        endY = y - Math.cos(angle) * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ghost ? "#347eae" : "#26392d";
      ctx.fillStyle = ghost ? "#347eae" : "#26392d";
      ctx.lineWidth = ghost ? 2 : Math.max(5, scale * 0.045);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cartX, y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      if (ghost)
        ctx.strokeRect(
          cartX - scale * 0.18,
          y - scale * 0.07,
          scale * 0.36,
          scale * 0.14,
        );
      else
        ctx.fillRect(
          cartX - scale * 0.18,
          y - scale * 0.07,
          scale * 0.36,
          scale * 0.14,
        );
      ctx.beginPath();
      ctx.arc(endX, endY, ghost ? 3 : 6, 0, Math.PI * 2);
      ctx.fill();
      if (!ghost) {
        ctx.fillStyle = "#edf0e7";
        ctx.beginPath();
        ctx.arc(cartX, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    if (runner.showDream) {
      for (const index of [14, 11, 7, 3, 1]) {
        const future = runner.dream[index];
        if (future)
          pose(future.observation, true, 0.16 + 0.45 * (1 - index / 15));
      }
    }
    pose(runner.sim.observation, false);
    if (runner.sim.pushRemaining > 1e-9) {
      const direction = Math.sign(runner.sim.pushForce),
        cartX = x(runner.sim.data.qpos[0]);
      const start = cartX - direction * scale * 0.8,
        end = cartX - direction * scale * 0.25;
      ctx.strokeStyle = "#c35d32";
      ctx.fillStyle = "#c35d32";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(start, y);
      ctx.lineTo(end, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(end, y);
      ctx.lineTo(end - direction * 10, y - 6);
      ctx.lineTo(end - direction * 10, y + 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#63705f";
    ctx.fillText(`${runner.sim.time.toFixed(1)} s`, 16, h - 18);
    ctx.textAlign = "right";
    ctx.fillText(runner.paused ? "PAUSED" : "MUJOCO · LIVE", w - 16, h - 18);
  }
}
