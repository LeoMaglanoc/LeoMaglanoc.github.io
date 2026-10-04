import { loadSimulation } from "../tests/load-model.js";
import { SortingTask } from "../src/task.js";
const s = await loadSimulation(),
  t = new SortingTask(s),
  limit = Number(process.argv[2] ?? 180),
  seed = Number(process.argv[3] ?? 731);
t.reset(seed);
let last = "";
for (let i = 0; i < limit / 0.002; i++) {
  t.step();
  if (t.state !== last) {
    last = t.state;
    console.log(s.data.time.toFixed(2), last, JSON.stringify(t.stats), t.lastError);
  }
}
console.log(JSON.stringify(t.snapshot()));
