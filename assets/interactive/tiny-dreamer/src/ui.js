export function setupUI(runner, reset) {
  const pause = document.getElementById("pause");
  const dream = document.getElementById("dream");
  const pauseToggle = () => {
    runner.paused = !runner.paused;
    pause.textContent = runner.paused ? "Resume" : "Pause";
    pause.setAttribute("aria-pressed", String(runner.paused));
  };
  const strength = () => Number(document.getElementById("strength").value);
  for (const button of document.querySelectorAll("[data-push]")) {
    button.addEventListener("click", () =>
      runner.sim.push(Number(button.dataset.push), strength()),
    );
  }
  document.getElementById("strength").addEventListener("input", () => {
    document.getElementById("force").textContent = `${strength()} N`;
  });
  pause.addEventListener("click", pauseToggle);
  dream.addEventListener("click", () => {
    runner.showDream = !runner.showDream;
    dream.setAttribute("aria-pressed", String(runner.showDream));
    dream.textContent = runner.showDream ? "Dream on" : "Dream off";
    runner.dreamTime = -Infinity;
  });
  document.getElementById("reset").addEventListener("click", reset);
  window.addEventListener("keydown", (event) => {
    if (
      event.repeat ||
      /INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|A/.test(event.target.tagName)
    )
      return;
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      event.preventDefault();
      runner.sim.push(event.code === "ArrowLeft" ? -1 : 1, strength());
    } else if (event.code === "Space") {
      event.preventDefault();
      pauseToggle();
    }
  });
  return () => {
    document.getElementById("reward").textContent =
      runner.sim.reward.toFixed(2);
    document.getElementById("predicted").textContent = runner.dream.length
      ? runner.dream.at(-1).reward.toFixed(2)
      : "—";
    document.getElementById("model-error").textContent =
      runner.error.toFixed(3);
    const status = document.getElementById("status");
    const message = runner.paused
      ? "Paused"
      : runner.sim.pushRemaining > 0
        ? "External push"
        : "Running locally";
    if (status.textContent !== message) status.textContent = message;
  };
}
