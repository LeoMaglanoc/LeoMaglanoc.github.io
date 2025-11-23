(function () {
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');

  const GRAVITY = 1200; // px/s^2
  const AIR_DRAG = 0.995;
  const BOUNCE = 0.6; // energy retention on bounce

  const state = {
    ball: {
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: 0,
      vy: 0,
      r: 26,
      color: '#60a5fa'
    },
    dragging: false,
    dragOffset: { x: 0, y: 0 },
    lastTime: performance.now(),
    lastPointer: null,
    prevPointer: null
  };

  function toCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  function pointerDown(evt) {
    evt.preventDefault();
    const { x, y } = toCanvasCoords(evt.touches ? evt.touches[0] : evt);
    const dx = x - state.ball.x;
    const dy = y - state.ball.y;
    if (dx * dx + dy * dy <= state.ball.r * state.ball.r) {
      state.dragging = true;
      state.dragOffset = { x: dx, y: dy };
      state.ball.vx = 0;
      state.ball.vy = 0;
      const t = performance.now();
      state.prevPointer = { x: state.ball.x, y: state.ball.y, t };
      state.lastPointer = { x: state.ball.x, y: state.ball.y, t };
    }
  }

  function pointerMove(evt) {
    if (!state.dragging) return;
    evt.preventDefault();
    const { x, y } = toCanvasCoords(evt.touches ? evt.touches[0] : evt);
    state.ball.x = x - state.dragOffset.x;
    state.ball.y = y - state.dragOffset.y;
    state.prevPointer = state.lastPointer;
    state.lastPointer = { x: state.ball.x, y: state.ball.y, t: performance.now() };
  }

  function pointerUp(evt) {
    if (!state.dragging) return;
    evt.preventDefault();
    // compute release velocity from last pointer delta
    if (state.lastPointer && state.prevPointer) {
      const dt = (state.lastPointer.t - state.prevPointer.t) / 1000;
      if (dt > 0) {
        state.ball.vx = (state.lastPointer.x - state.prevPointer.x) / dt;
        state.ball.vy = (state.lastPointer.y - state.prevPointer.y) / dt;
      }
    }
    state.dragging = false;
  }

  canvas.addEventListener('mousedown', pointerDown);
  canvas.addEventListener('mousemove', pointerMove);
  window.addEventListener('mouseup', pointerUp);

  canvas.addEventListener('touchstart', pointerDown, { passive: false });
  canvas.addEventListener('touchmove', pointerMove, { passive: false });
  window.addEventListener('touchend', pointerUp, { passive: false });
  window.addEventListener('touchcancel', pointerUp, { passive: false });

  function step(timestamp) {
    const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000); // cap delta
    state.lastTime = timestamp;

    if (!state.dragging) {
      state.ball.vy += GRAVITY * dt;
      state.ball.vx *= AIR_DRAG;
      state.ball.vy *= AIR_DRAG;
      state.ball.x += state.ball.vx * dt;
      state.ball.y += state.ball.vy * dt;

      // collisions with bounds
      if (state.ball.x - state.ball.r < 0) {
        state.ball.x = state.ball.r;
        state.ball.vx = -state.ball.vx * BOUNCE;
      } else if (state.ball.x + state.ball.r > canvas.width) {
        state.ball.x = canvas.width - state.ball.r;
        state.ball.vx = -state.ball.vx * BOUNCE;
      }

      if (state.ball.y + state.ball.r > canvas.height) {
        state.ball.y = canvas.height - state.ball.r;
        state.ball.vy = -state.ball.vy * BOUNCE;
        // small floor friction
        state.ball.vx *= 0.9;
      } else if (state.ball.y - state.ball.r < 0) {
        state.ball.y = state.ball.r;
        state.ball.vy = -state.ball.vy * BOUNCE;
      }
    }

    render();
    requestAnimationFrame(step);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ground gradient
    const g = ctx.createLinearGradient(0, canvas.height * 0.6, 0, canvas.height);
    g.addColorStop(0, '#0c1420');
    g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ball shadow
    ctx.beginPath();
    const shadowScale = Math.max(0.2, 1 - (canvas.height - (state.ball.y + state.ball.r)) / canvas.height);
    ctx.ellipse(state.ball.x, canvas.height - 8, state.ball.r * 1.2, state.ball.r * 0.4 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    // ball
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.r, 0, Math.PI * 2);
    const grd = ctx.createRadialGradient(state.ball.x - 8, state.ball.y - 10, state.ball.r * 0.3, state.ball.x, state.ball.y, state.ball.r);
    grd.addColorStop(0, '#bfdbfe');
    grd.addColorStop(1, state.ball.color);
    ctx.fillStyle = grd;
    ctx.fill();

    // outline
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  requestAnimationFrame(step);
})();
