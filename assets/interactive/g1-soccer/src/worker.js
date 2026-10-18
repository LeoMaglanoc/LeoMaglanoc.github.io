import { SoccerSimulation } from "./simulation.js";
import { loadAsset } from "./assets.js";
let sim,
  layouts,
  running = false,
  layout,
  chain = Promise.resolve(),
  lastWall = 0,
  accumulator = 0,
  timer;
const send = () =>
  postMessage({
    type: "state",
    state: { ...sim.snapshot(), running, seed: layout.seed },
  });
function queue(fn, id) {
  chain = chain
    .then(async () => {
      const value = await fn();
      if (id) postMessage({ type: "reply", id, value });
    })
    .catch((e) => {
      running = false;
      clearTimeout(timer);
      postMessage({ type: "error", id, message: e.message || String(e) });
    });
  return chain;
}
async function tick() {
  if (!running) return;
  const now = performance.now();
  accumulator = Math.min(0.06, accumulator + (now - lastWall) / 1000);
  lastWall = now;
  let count = 0;
  while (running && accumulator >= 0.02 && count < 3) {
    await sim.controlStep();
    accumulator -= 0.02;
    count++;
    if (sim.result) running = false;
  }
  if (count) send();
  if (running) timer = setTimeout(() => queue(tick), 4);
}
function pause() {
  running = false;
  clearTimeout(timer);
  accumulator = 0;
}
function start() {
  if (running || sim.result) return;
  running = true;
  lastWall = performance.now();
  accumulator = 0;
  timer = setTimeout(() => queue(tick), 0);
}
onmessage = ({ data: m }) =>
  queue(async () => {
    switch (m.type) {
      case "init":
        sim = new SoccerSimulation();
        [layouts] = await Promise.all([
          loadAsset(
            new URL("../layouts.json", import.meta.url),
            "starting layouts",
            (r) => r.json(),
          ),
          sim.init(),
        ]);
        layout = structuredClone(layouts[0]);
        sim.reset(layout);
        postMessage({ type: "ready", version: sim.mj.mj_versionString() });
        send();
        break;
      case "start":
        start();
        send();
        break;
      case "pause":
        pause();
        send();
        break;
      case "reset":
        pause();
        sim.reset(layout);
        send();
        break;
      case "layout":
        pause();
        layout = structuredClone(layouts[m.index % layouts.length]);
        sim.reset(layout);
        send();
        break;
      case "edit": {
        if (running) throw Error("Pause before editing the setup.");
        const x = Math.max(-3.4, Math.min(3.4, m.x)),
          y = Math.max(-2.4, Math.min(2.4, m.y));
        if (m.object === "ball") {
          if (
            Math.hypot(
              x - layout.qpos[sim.base],
              y - layout.qpos[sim.base + 1],
            ) < 0.65
          )
            return {
              accepted: false,
              reason: "Place the ball at least 0.65 m from the robot.",
            };
          layout.qpos[sim.ball] = x;
          layout.qpos[sim.ball + 1] = y;
        } else layout.target[0] = [x, y, 0.002];
        sim.reset(layout);
        send();
        return { accepted: true };
      }
      case "snapshot":
        return sim.snapshot();
      case "evaluate": {
        pause();
        const results = [];
        const startTime = performance.now();
        for (const fixture of m.fixtures) {
          sim.reset(fixture.initial || fixture);
          let trace = [];
          while (!sim.result) {
            await sim.controlStep();
            if (sim.steps % 100 === 0 && m.trace)
              trace.push({
                ...sim.snapshot(),
                obs: Array.from(sim.highObs),
                action: Array.from(sim.highAction),
                next_obs: Array.from(sim.highObservation()),
              });
          }
          const s = sim.snapshot();
          results.push({
            seed: fixture.seed,
            outcome: s.result,
            steps: s.steps / 100,
            final_distance: Math.hypot(
              s.qpos[s.ballIndex] - s.target[0],
              s.qpos[s.ballIndex + 1] - s.target[1],
            ),
            trace,
          });
          postMessage({
            type: "evaluation-progress",
            completed: results.length,
            total: m.fixtures.length,
          });
        }
        sim.reset(layout);
        send();
        return {
          results,
          wall_seconds: (performance.now() - startTime) / 1000,
        };
      }
      case "parity": {
        pause();
        let maxCoach = 0,
          maxWalker = 0,
          maxHidden = 0,
          maxCell = 0;
        for (const t of m.high) {
          const a = await sim.policies.high(Float32Array.from(t.obs));
          maxCoach = Math.max(
            maxCoach,
            ...a.map((v, i) => Math.abs(v - t.action[i])),
          );
        }
        for (const t of m.low) {
          sim.policies.hidden = Float32Array.from(t.hidden.flat(2));
          sim.policies.cell = Float32Array.from(t.cell.flat(2));
          const a = await sim.policies.low(Float32Array.from(t.obs.flat()));
          maxWalker = Math.max(
            maxWalker,
            ...a.map((v, i) => Math.abs(v - t.action[0][i])),
          );
          maxHidden = Math.max(
            maxHidden,
            ...sim.policies.hidden.map((v, i) =>
              Math.abs(v - t.next_hidden[0][0][i]),
            ),
          );
          maxCell = Math.max(
            maxCell,
            ...sim.policies.cell.map((v, i) =>
              Math.abs(v - t.next_cell[0][0][i]),
            ),
          );
        }
        sim.reset(layout);
        send();
        return { maxCoach, maxWalker, maxHidden, maxCell };
      }
    }
  }, m.id);
