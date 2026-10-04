function byId(id) {
  return document.getElementById(id);
}

function format(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export class G1UI {
  constructor() {
    this.status = byId("g1-status");
    this.loading = byId("g1-loading");
    this.pauseButton = byId("g1-pause");
    this.resetButton = byId("g1-reset");
    this.pushLeftButton = byId("g1-push-left");
    this.pushRightButton = byId("g1-push-right");
    this.command = byId("g1-command");
    this.speed = byId("g1-speed");
    this.distance = byId("g1-distance");
    this.walkTime = byId("g1-walk-time");
    this.pushes = byId("g1-pushes");
    this.error = byId("g1-error");
  }

  setLoading(message) {
    this.loading.hidden = false;
    this.loading.textContent = message;
    this.status.textContent = message;
  }

  ready() {
    this.loading.hidden = true;
    this.status.textContent = "Running locally in your browser";
    this.pauseButton.disabled = false;
  }

  setPaused(paused) {
    this.pauseButton.textContent = paused ? "Resume" : "Pause";
    this.status.textContent = paused ? "Paused" : "Running locally in your browser";
  }

  update(command, stats) {
    this.command.textContent = `${format(command[0])} / ${format(command[1])} / ${format(command[2])}`;
    this.speed.textContent = `${format(stats.speed)} m/s`;
    this.distance.textContent = `${format(stats.distance)} m`;
    this.walkTime.textContent = `${format(stats.walkTime, 1)} s`;
    this.pushes.textContent = String(stats.pushes);
  }

  showError(error) {
    console.error(error);
    this.loading.hidden = true;
    this.error.hidden = false;
    this.error.textContent = `The simulator could not start: ${error.message || error}`;
    this.status.textContent = "Simulator unavailable";
  }
}
