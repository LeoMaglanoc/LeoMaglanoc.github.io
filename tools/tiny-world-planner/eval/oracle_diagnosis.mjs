// PRIVILEGED OFFLINE DIAGNOSTIC ONLY. Never imported by browser source.
// This asks whether the current CEM settings can solve the task even with physics.
import fs from "node:fs";
import {
  createScene,
  coverage,
} from "../../../assets/interactive/tiny-world-planner/src/physics.js";
const { CEM, CONFIGS } = await import(
  process.env.IMPROVED
    ? "./search.mjs"
    : "../../../assets/interactive/tiny-world-planner/src/planner.js"
);
function encode(scene) {
  const s = scene.state(),
    v = new Float32Array(48);
  v.set([
    s.object.x,
    s.object.y,
    Math.sin(s.object.angle),
    Math.cos(s.object.angle),
  ]);
  v.set([s.agent.x, s.agent.y, ...s.velocity], 16);
  return v;
}
const count = +(process.argv[2] || 3),
  budget = +(process.argv[3] || 60),
  N = +(process.argv[4] || 64),
  H = +(process.argv[5] || 8),
  I = +(process.argv[6] || 5);
CONFIGS.oracle = { horizon: H, candidates: N, iterations: I };
const pool = Array.from({ length: N }, () => createScene(1)),
  model = {
    async predict(states, actions, batch) {
      const out = new Float32Array(batch * 48);
      for (let n = 0; n < batch; n++) {
        const s = states.subarray(n * 48, (n + 1) * 48),
          p = pool[n];
        p.block.setTransform({ x: s[0], y: s[1] }, Math.atan2(s[2], s[3]));
        p.block.setLinearVelocity({ x: s[18], y: s[19] });
        p.block.setAngularVelocity(s[20]);
        p.pusher.setTransform({ x: s[16], y: s[17] }, 0);
        p.pusher.setLinearVelocity({ x: 0, y: 0 });
        p.step(actions.subarray(n * 2, n * 2 + 2));
        out.set(encode(p), n * 48);
      }
      return out;
    },
  };
const rows = [];
for (let i = 0; i < count; i++) {
  const seed = 901500 + i,
    scene = createScene(seed, "easy"),
    planner = new CEM(model),
    goal = new Float32Array(16);
  goal.set([
    scene.goal.x,
    scene.goal.y,
    Math.sin(scene.goal.angle),
    Math.cos(scene.goal.angle),
  ]);
  let best = 0,
    success = false,
    streak = 0;
  for (let t = 0; t < budget; t++) {
    const plan = await planner.plan(encode(scene), goal, "oracle");
    scene.step(plan.action);
    const overlap = coverage(scene.state().object, scene.goal);
    best = Math.max(best, overlap);
    streak = overlap >= 0.95 ? streak + 1 : 0;
    if (t % 10 === 0) console.log(seed, t, overlap, plan.action);
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
    "results/oracle-diagnosis.json",
    JSON.stringify(
      {
        label: "PRIVILEGED OFFLINE PHYSICS DIAGNOSTIC; never deployed",
        config: { N, H, I, budget },
        rows,
      },
      null,
      2,
    ),
  );
}
