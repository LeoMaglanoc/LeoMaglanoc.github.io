export class FlightUI {
  constructor() {
    this.lastUpdate = 0;
    this.el = Object.fromEntries(
      [
        "lap",
        "best",
        "loading",
        "error",
        "status",
        "speed",
        "gate",
        "time",
        "solve",
        "perf",
        "race-stats",
        "ghost-time",
        "reset",
        "pause",
        "camera",
      ].map((id) => [id, document.getElementById(id)])
    );
  }
  ready() {
    this.el.loading.hidden = true;
    document.querySelectorAll("button").forEach((el) => (el.disabled = false));
  }
  error(error) {
    this.el.loading.hidden = true;
    this.el.error.hidden = false;
    this.el.error.textContent = error.message;
  }
  update(runner, stats, ghost, paused, time) {
    if (time - this.lastUpdate < 150) return;
    this.lastUpdate = time;
    const race = runner.race,
      mpc = runner.mpc.timing();
    this.el.speed.innerHTML = `${Math.hypot(...runner.sim.state.v).toFixed(1)} <small>m/s</small>`;
    this.el.gate.textContent = `${race.gate + 1} / ${runner.course.gates.length}`;
    this.el.time.innerHTML = `${race.currentLapTime.toFixed(2)} <small>s</small>`;
    this.el.solve.textContent = runner.mode === "AUTOPILOT" ? `${mpc.last.toFixed(2)} ms` : "—";
    this.el.lap.textContent = String(race.lap);
    this.el.best.textContent = race.bestLapTime === null ? "—" : `${race.bestLapTime.toFixed(2)} s`;
    this.el.status.textContent = paused
      ? "Paused"
      : runner.mode === "AUTOPILOT"
        ? "Autopilot · racing continuous laps"
        : runner.mode === "RACE AI"
          ? "Follow the lit gate · race the looping AI"
          : "Stabilized flight · follow the lit gate";
    this.el.perf.textContent = `FPS ${stats.fps.toFixed(0)} · real time ${stats.ratio.toFixed(2)}×\nPhysics ${stats.physics.toFixed(
      2
    )} ms/frame\nRender ${stats.render.toFixed(2)} ms/frame\nMPC last ${mpc.last.toFixed(3)} ms · mean ${mpc.average.toFixed(
      3
    )} ms\nMPC p95 ${mpc.p95.toFixed(3)} ms (last ${runner.mpc.times.length} solves)`;
    this.el["race-stats"].textContent = `Collisions ${race.collisions} · Resets ${runner.resets}`;
    this.el["ghost-time"].hidden = runner.mode !== "RACE AI";
    this.el["ghost-time"].textContent = `YOU · lap ${race.lap} · ${race.currentLapTime.toFixed(2)} s · best ${
      race.bestLapTime?.toFixed(2) ?? "—"
    } / AI · ${ghost.finishTime.toFixed(2)} s`;
    document.querySelector("[data-disturb=mass]").setAttribute("aria-pressed", runner.sim.massScale > 1);
    document.querySelector("[data-disturb=motor]").setAttribute("aria-pressed", runner.sim.efficiency < 1);
  }
}
