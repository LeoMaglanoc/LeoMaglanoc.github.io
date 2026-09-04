/* global ort */
(function () {
  "use strict";

  const canvas = document.getElementById("pong-canvas");
  const playButton = document.getElementById("pong-play");
  const restartButton = document.getElementById("pong-restart");
  const startOverlay = document.getElementById("pong-start");
  const status = document.getElementById("pong-status");
  const score = document.getElementById("pong-score");
  const context = canvas.getContext("2d");
  const keys = new Set();
  const touchButtons = document.querySelectorAll("[data-action]");
  let touchAction = 1;
  let config;
  let session;
  let state;
  let started = false;
  let gameOver = false;
  let aiAction = 1;
  let inferenceBusy = false;
  let tickCount = 0;
  let policyLoadToken = 0;

  function setStatus(message) { status.textContent = message; }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  function updateOverlay() {
    startOverlay.hidden = started;
    if (!started && gameOver) {
      playButton.textContent = state.humanScore > state.aiScore ? "Play again" : "Try again";
    } else if (!started && session) {
      playButton.textContent = "Play Pong";
    }
  }

  function resetBall(direction) {
    const angle = (Math.random() * 1.1) - 0.55;
    state.ballX = 0.5;
    state.ballY = 0.5;
    state.ballVx = direction * config.BALL_SPEED * Math.cos(angle);
    state.ballVy = config.BALL_SPEED * Math.sin(angle);
  }

  function resetGame() {
    state = {
      ballX: 0.5,
      ballY: 0.5,
      ballVx: 0,
      ballVy: 0,
      aiPaddleY: 0.5,
      humanPaddleY: 0.5,
      aiScore: 0,
      humanScore: 0
    };
    started = false;
    aiAction = 1;
    tickCount = 0;
    gameOver = false;
    resetBall(-1);
    updateScore();
    updateOverlay();
  }

  function updateScore() { score.textContent = `${state.humanScore} : ${state.aiScore}`; }

  function movePaddle(name, action) {
    let y = state[name];
    if (action === 0) y -= config.PADDLE_SPEED * config.CONTROL_DT;
    if (action === 2) y += config.PADDLE_SPEED * config.CONTROL_DT;
    state[name] = clamp(y, config.PADDLE_HEIGHT / 2, config.HEIGHT - config.PADDLE_HEIGHT / 2);
  }

  function humanAction() {
    if (touchAction !== 1) return touchAction;
    if (keys.has("arrowup") || keys.has("w")) return 0;
    if (keys.has("arrowdown") || keys.has("s")) return 2;
    return 1;
  }

  function paddleHit(side) {
    const paddleY = side === "human" ? state.humanPaddleY : state.aiPaddleY;
    if (side === "human") {
      if (state.ballVx >= 0 || state.ballX - config.BALL_RADIUS > config.PADDLE_MARGIN + config.PADDLE_WIDTH) return false;
      if (state.ballY + config.BALL_RADIUS < paddleY - config.PADDLE_HEIGHT / 2 || state.ballY - config.BALL_RADIUS > paddleY + config.PADDLE_HEIGHT / 2) return false;
      state.ballX = config.PADDLE_MARGIN + config.PADDLE_WIDTH + config.BALL_RADIUS;
      return true;
    }
    const paddleX = config.WIDTH - config.PADDLE_MARGIN - config.PADDLE_WIDTH;
    if (state.ballVx <= 0 || state.ballX + config.BALL_RADIUS < paddleX) return false;
    if (state.ballY + config.BALL_RADIUS < paddleY - config.PADDLE_HEIGHT / 2 || state.ballY - config.BALL_RADIUS > paddleY + config.PADDLE_HEIGHT / 2) return false;
    state.ballX = paddleX - config.BALL_RADIUS;
    return true;
  }

  function bounceFromPaddle(side) {
    const paddleY = side === "human" ? state.humanPaddleY : state.aiPaddleY;
    const relative = (state.ballY - paddleY) / (config.PADDLE_HEIGHT / 2);
    const newVx = side === "human" ? Math.abs(state.ballVx) : -Math.abs(state.ballVx);
    const newVy = state.ballVy + relative * 0.18;
    const speed = Math.min(Math.hypot(newVx, newVy) * config.BALL_SPEEDUP, config.MAX_BALL_SPEED);
    const xDirection = side === "human" ? 1 : -1;
    const length = Math.max(Math.hypot(xDirection, newVy), 1e-8);
    state.ballVx = xDirection * speed / length;
    state.ballVy = newVy * speed / length;
  }

  function finishPoint(player) {
    if (player === "ai") state.aiScore += 1;
    else state.humanScore += 1;
    updateScore();
    if (state.aiScore >= config.MAX_SCORE || state.humanScore >= config.MAX_SCORE) {
      gameOver = true;
      started = false;
      setStatus(state.aiScore > state.humanScore ? "The RL agent wins." : "You win.");
      updateOverlay();
      return;
    }
    resetBall(player === "ai" ? 1 : -1);
  }

  function buildObservation() {
    return [
      2 * state.ballX / config.WIDTH - 1,
      2 * state.ballY / config.HEIGHT - 1,
      state.ballVx / config.MAX_BALL_SPEED,
      state.ballVy / config.MAX_BALL_SPEED,
      2 * state.aiPaddleY / config.HEIGHT - 1
    ];
  }

  async function requestInference() {
    if (!session || inferenceBusy || gameOver) return;
    const activeSession = session;
    inferenceBusy = true;
    try {
      const input = new ort.Tensor("float32", Float32Array.from(buildObservation()), [1, 5]);
      const outputs = await activeSession.run({ [activeSession.inputNames[0]]: input });
      const logits = Array.from(outputs[activeSession.outputNames[0]].data);
      aiAction = logits.indexOf(Math.max(...logits));
    } catch (error) {
      if (session === activeSession) {
        started = false;
        setStatus(`Inference failed: ${error.message}`);
        updateOverlay();
        console.error("Pong inference failed", error);
      }
    } finally {
      if (session === activeSession) inferenceBusy = false;
    }
  }

  function tick() {
    if (!started || gameOver) return;
    tickCount += 1;
    movePaddle("humanPaddleY", humanAction());
    movePaddle("aiPaddleY", aiAction);
    state.ballX += state.ballVx * config.CONTROL_DT;
    state.ballY += state.ballVy * config.CONTROL_DT;

    if (state.ballY - config.BALL_RADIUS <= 0 && state.ballVy < 0) {
      state.ballY = config.BALL_RADIUS;
      state.ballVy = Math.abs(state.ballVy);
    } else if (state.ballY + config.BALL_RADIUS >= config.HEIGHT && state.ballVy > 0) {
      state.ballY = config.HEIGHT - config.BALL_RADIUS;
      state.ballVy = -Math.abs(state.ballVy);
    }

    if (paddleHit("human")) bounceFromPaddle("human");
    else if (paddleHit("ai")) bounceFromPaddle("ai");
    if (state.ballX < -config.BALL_RADIUS) finishPoint("ai");
    else if (state.ballX > config.WIDTH + config.BALL_RADIUS) finishPoint("human");
    if (tickCount % 2 === 0) requestInference();
  }

  function render() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#13231f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (config && state) {
      const scaleX = canvas.width / config.WIDTH;
      const scaleY = canvas.height / config.HEIGHT;
      context.setLineDash([8, 12]);
      context.strokeStyle = "rgba(245, 242, 234, 0.28)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(canvas.width / 2, 0);
      context.lineTo(canvas.width / 2, canvas.height);
      context.stroke();
      context.setLineDash([]);

      context.fillStyle = "#f5f2ea";
      const paddleHeight = config.PADDLE_HEIGHT * scaleY;
      const paddleWidth = config.PADDLE_WIDTH * scaleX;
      context.fillRect(config.PADDLE_MARGIN * scaleX, (state.humanPaddleY - config.PADDLE_HEIGHT / 2) * scaleY, paddleWidth, paddleHeight);
      context.fillStyle = "#e36b3d";
      context.fillRect((config.WIDTH - config.PADDLE_MARGIN - config.PADDLE_WIDTH) * scaleX, (state.aiPaddleY - config.PADDLE_HEIGHT / 2) * scaleY, paddleWidth, paddleHeight);
      context.beginPath();
      context.arc(state.ballX * scaleX, state.ballY * scaleY, config.BALL_RADIUS * Math.min(scaleX, scaleY), 0, Math.PI * 2);
      context.fillStyle = "#e36b3d";
      context.fill();
    }
    requestAnimationFrame(render);
  }

  async function loadPolicy() {
    const loadToken = ++policyLoadToken;
    session = null;
    inferenceBusy = false;
    started = false;
    gameOver = false;
    playButton.disabled = true;
    setStatus("Loading RL agent…");
    updateOverlay();
    try {
      const nextSession = await ort.InferenceSession.create(canvas.dataset.modelUrl, { executionProviders: ["wasm"] });
      if (loadToken !== policyLoadToken) return;
      session = nextSession;
      playButton.disabled = false;
      setStatus("Agent ready — move your paddle with the buttons or W / S.");
      updateOverlay();
    } catch (error) {
      if (loadToken !== policyLoadToken) return;
      setStatus(`Loading failed: ${error.message}`);
      console.error("Pong policy loading failed", error);
    }
  }

  function startGame() {
    if (!session) return;
    if (gameOver) resetGame();
    started = true;
    setStatus("You are on the left. Keep the ball away from the agent.");
    updateOverlay();
    canvas.focus();
  }

  function restartGame() {
    if (!session) return;
    resetGame();
    startGame();
  }

  function setTouchAction(action, active, button, event) {
    if (event) event.preventDefault();
    if (active) {
      touchAction = action;
      button.classList.add("is-held");
      if (event && button.setPointerCapture) button.setPointerCapture(event.pointerId);
    } else if (touchAction === action) {
      touchAction = 1;
      button.classList.remove("is-held");
    } else {
      button.classList.remove("is-held");
    }
  }

  playButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", restartGame);
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "w", "s"].includes(key)) {
      event.preventDefault();
      keys.add(key);
    }
    if (key === "r") restartGame();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => {
    keys.clear();
    touchAction = 1;
    touchButtons.forEach((button) => button.classList.remove("is-held"));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      keys.clear();
      touchAction = 1;
      touchButtons.forEach((button) => button.classList.remove("is-held"));
    }
  });
  touchButtons.forEach((button) => {
    const action = button.dataset.action === "up" ? 0 : 2;
    button.addEventListener("pointerdown", (event) => setTouchAction(action, true, button, event));
    button.addEventListener("pointerup", (event) => setTouchAction(action, false, button, event));
    button.addEventListener("pointercancel", (event) => setTouchAction(action, false, button, event));
    button.addEventListener("lostpointercapture", () => setTouchAction(action, false, button));
  });

  setInterval(tick, 20);
  requestAnimationFrame(render);

  (async function initialize() {
    try {
      const configResponse = await fetch(canvas.dataset.configUrl);
      if (!configResponse.ok) throw new Error(`Could not load configuration (${configResponse.status})`);
      config = await configResponse.json();
      resetGame();
      if (!window.ort) throw new Error("ONNX Runtime Web did not load");
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      await loadPolicy();
    } catch (error) {
      setStatus(`Loading failed: ${error.message}`);
      playButton.disabled = true;
      console.error("Pong agent loading failed", error);
    }
  }());

  window.pongDebug = { buildObservation: () => buildObservation(), getState: () => state };
}());
