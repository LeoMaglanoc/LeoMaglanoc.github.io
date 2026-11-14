import fs from "node:fs";
import {
  createScene,
  coverage,
  rng,
} from "../../../assets/interactive/tiny-world-planner/src/physics.js";
import { renderSensor } from "../../../assets/interactive/tiny-world-planner/src/raster.js";
import {
  masks,
  history,
} from "../../../assets/interactive/tiny-world-planner/src/observation.js";
const { CEM, CONFIGS } = await import(
  process.env.ORIGINAL_PLANNER
    ? "./original_planner.mjs"
    : process.env.SEARCH_EXPERIMENT
      ? "./search.mjs"
      : "../../../assets/interactive/tiny-world-planner/src/planner.js"
);
if (process.env.SEARCH_EXPERIMENT)
  CONFIGS.lite = {
    horizon: +(process.env.HORIZON || 12),
    candidates: +(process.env.CANDIDATES || 128),
    iterations: +(process.env.ITERATIONS || 6),
    knots: 4,
  };
import { loadModel } from "./runtime.mjs";
const seeds = +(process.argv[2] || 50),
  budget = +(process.argv[3] || 100),
  config = process.argv[4] || "lite",
  model = await loadModel(),
  rows = [];
const percentile = (xs, p) =>
  [...xs].sort((a, b) => a - b)[
    Math.min(xs.length - 1, Math.floor(xs.length * p))
  ];
for (const difficulty of (process.env.DIFFICULTIES || "easy").split(","))
  for (const method of ["random", "latent-mpc"])
    for (let i = 0; i < seeds; i++) {
      const seed = +(process.env.SEED_BASE || 902000) + i,
        scene = createScene(seed, difficulty),
        planner = new CEM(model),
        random = rng(seed),
        read = () =>
          masks(renderSensor(scene.state().object, scene.state().agent));
      let current = read(),
        previous = current,
        streak = 0,
        success = false,
        latencies = [],
        steps = 0;
      const goal = await model.goal(
          masks(renderSensor(scene.goal, null)).object,
        ),
        initial = coverage(scene.state().object, scene.goal);
      let best = initial;
      for (let t = 0; t < budget; t++) {
        let action;
        if (method === "random") action = [random() * 2 - 1, random() * 2 - 1];
        else {
          const state = await model.encode(history(previous, current));
          const observedCost =
            state
              .slice(0, 16)
              .reduce((sum, v, j) => sum + (v - goal[j]) ** 2, 0) / 16;
          const plan =
            observedCost < +(process.env.HOLD_COST || 0)
              ? { action: [0, 0], latency: 0 }
              : await planner.plan(state, goal, config);
          action = plan.action;
          latencies.push(plan.latency);
        }
        scene.step(action);
        previous = current;
        current = read();
        steps++;
        const overlap = coverage(scene.state().object, scene.goal);
        best = Math.max(best, overlap);
        streak = overlap >= 0.95 ? streak + 1 : 0;
        if (streak >= 3) {
          success = true;
          break;
        }
      }
      const row = {
        seed,
        difficulty,
        method,
        config,
        success,
        steps,
        initialCoverage: initial,
        finalCoverage: coverage(scene.state().object, scene.goal),
        bestCoverage: best,
        latencyMean:
          latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length),
        latencyP95: latencies.length ? percentile(latencies, 0.95) : 0,
        failure: success
          ? null
          : best >= 0.8
            ? "near-goal precision"
            : scene.state().contacts === 0
              ? "no contact"
              : "contact but inaccurate manipulation",
      };
      rows.push(row);
      console.log(JSON.stringify(row));
      fs.mkdirSync(process.env.RESULT_DIR || "results/development", {
        recursive: true,
      });
      fs.writeFileSync(
        `${process.env.RESULT_DIR || "results/development"}/planning-${config}.json`,
        JSON.stringify(
          {
            timingScope:
              "CEM search only; excludes image encoding and diagnostic decoding",
            backend:
              "ONNX Runtime Web 1.21.0 WASM in Node, single thread; not browser or phone timing",
            seeds,
            budget,
            rows,
          },
          null,
          2,
        ),
      );
    }
for (const difficulty of (process.env.DIFFICULTIES || "easy").split(","))
  for (const method of ["random", "latent-mpc"]) {
    const r = rows.filter(
      (x) => x.difficulty === difficulty && x.method === method,
    );
    console.log("SUMMARY", difficulty, method, {
      success: r.filter((x) => x.success).length / r.length,
      coverage: r.reduce((a, b) => a + b.finalCoverage, 0) / r.length,
      latency: r.reduce((a, b) => a + b.latencyMean, 0) / r.length,
    });
  }
