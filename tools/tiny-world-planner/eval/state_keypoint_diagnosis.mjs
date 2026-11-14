// PRIVILEGED OFFLINE ABLATION. Exact keypoints replace the image encoder only
// to distinguish perception error from learned-transition/search error.
// Candidate evaluation still uses the learned model, never physics rollouts.
import fs from "node:fs";
import {
  createScene,
  coverage,
} from "../../../assets/interactive/tiny-world-planner/src/physics.js";
import { CEM, CONFIGS } from "./search.mjs";
import { loadModel } from "./runtime.mjs";
const ref = [
  [-0.9, -0.725],
  [0.9, -0.725],
  [0, 0.85],
  [0, -0.2],
];
function features(object, agent) {
  const f = new Float32Array(24),
    c = Math.cos(object.angle),
    s = Math.sin(object.angle);
  for (let k = 0; k < 4; k++) {
    const [x, y] = ref[k];
    for (const offset of [0, 8]) {
      f[offset + k * 2] = (object.x + c * x - s * y) / Math.SQRT2;
      f[offset + k * 2 + 1] = (object.y + s * x + c * y) / Math.SQRT2;
    }
  }
  if (agent)
    for (let k = 0; k < 4; k++) {
      f[16 + k * 2] = agent.x / 2;
      f[17 + k * 2] = agent.y / 2;
    }
  return f;
}
CONFIGS.diagnostic = {
  horizon: +(process.env.HORIZON || 8),
  candidates: 128,
  iterations: 6,
  knots: 4,
};
const model = await loadModel(),
  rows = [];
for (let i = 0; i < +(process.argv[2] || 10); i++) {
  const seed = 902000 + i,
    scene = createScene(seed, "easy"),
    planner = new CEM(model),
    goal = features(scene.goal, null).slice(0, 16);
  let s = scene.state(),
    previous = features(s.object, s.agent),
    streak = 0,
    success = false,
    best = 0;
  for (let t = 0; t < 100; t++) {
    s = scene.state();
    const current = features(s.object, s.agent),
      state = new Float32Array(48);
    state.set(current);
    state.set(previous, 24);
    const plan = await planner.plan(state, goal, "diagnostic");
    scene.step(plan.action);
    previous = current;
    const overlap = coverage(scene.state().object, scene.goal);
    best = Math.max(best, overlap);
    streak = overlap >= 0.95 ? streak + 1 : 0;
    if (streak >= 3) {
      success = true;
      break;
    }
  }
  rows.push({
    seed,
    success,
    bestCoverage: best,
    finalCoverage: coverage(scene.state().object, scene.goal),
  });
  console.log(rows.at(-1));
  fs.writeFileSync(
    process.env.OUTPUT || "results/state-keypoint-diagnosis.json",
    JSON.stringify(
      {
        label: "PRIVILEGED offline exact-keypoint ablation; not deployed",
        modelDir: process.env.MODEL_DIR,
        rows,
      },
      null,
      2,
    ),
  );
}
