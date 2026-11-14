import fs from "node:fs";
import zlib from "node:zlib";
import {
  createScene,
  rng,
  clip,
} from "../../assets/interactive/tiny-world-planner/src/physics.js";
import { renderSensor } from "../../assets/interactive/tiny-world-planner/src/raster.js";
import { masks } from "../../assets/interactive/tiny-world-planner/src/observation.js";
const episodes = +(process.argv[2] || 1400),
  steps = +(process.argv[3] || 60),
  out = process.argv[4] || "local-data-contact";
fs.mkdirSync(out, { recursive: true });
const images = new Uint8Array(episodes * (steps + 1) * 8192),
  states = new Float32Array(episodes * (steps + 1) * 9),
  actions = new Float32Array(episodes * steps * 2),
  contact = new Uint8Array(episodes * steps),
  random = rng(20261114);
let moving = 0,
  touching = 0;
function capture(scene, e, t) {
  const s = scene.state(),
    m = masks(renderSensor(s.object, s.agent)),
    offset = (e * (steps + 1) + t) * 8192;
  images.set(
    m.object.map((v) => Math.round(v * 255)),
    offset,
  );
  images.set(
    m.agent.map((v) => Math.round(v * 255)),
    offset + 4096,
  );
  states.set(
    [
      s.object.x / 10,
      s.object.y / 10,
      Math.sin(s.object.angle),
      Math.cos(s.object.angle),
      s.agent.x / 10,
      s.agent.y / 10,
      ...s.velocity,
    ],
    (e * (steps + 1) + t) * 9,
  );
}
for (let e = 0; e < episodes; e++) {
  const scene = createScene(120000 + e, "challenge"),
    initial = scene.state(),
    theta = random() * Math.PI * 2;
  const fine = e % 2 === 0;
  if (fine) {
    const points = [
        [-1.46, -0.725],
        [1.46, -0.725],
        [-0.59, 0.6],
        [0.59, 0.6],
        [0, 1.32],
        [0, -1.32],
      ],
      p = points[Math.floor(random() * points.length)],
      c = Math.cos(initial.object.angle),
      s = Math.sin(initial.object.angle);
    scene.disturb(
      "agent",
      initial.object.x + c * p[0] - s * p[1],
      initial.object.y + s * p[0] + c * p[1],
    );
  } else
    scene.disturb(
      "agent",
      initial.object.x + 2 * Math.cos(theta),
      initial.object.y + 2 * Math.sin(theta),
    );
  capture(scene, e, 0);
  let mode = e % 4,
    waypoint = null,
    smooth = [0, 0];
  for (let t = 0; t < steps; t++) {
    const s = scene.state();
    let a;
    if (fine) {
      const angle =
          Math.atan2(s.object.y - s.agent.y, s.object.x - s.agent.x) +
          (random() - 0.5) * 1.8 +
          (t % 17 > 13 ? Math.PI : 0),
        speed = 0.03 + random() * 0.47;
      a = [Math.cos(angle) * speed, Math.sin(angle) * speed];
    } else if (mode === 0) {
      smooth = smooth.map((v) => clip(0.7 * v + (random() - 0.5) * 1.1, -1, 1));
      a = smooth;
    } else {
      if (!waypoint || t % 16 === 0) {
        const angle = random() * Math.PI * 2,
          r = mode === 1 ? 0.7 : 2.8;
        waypoint = {
          x: clip(s.object.x + r * Math.cos(angle), 0.5, 9.5),
          y: clip(s.object.y + r * Math.sin(angle), 0.5, 9.5),
        };
      }
      a = [
        clip((waypoint.x - s.agent.x) / 0.48, -1, 1),
        clip((waypoint.y - s.agent.y) / 0.48, -1, 1),
      ];
      if (mode === 3 && t % 16 > 8)
        a = [(random() - 0.5) * 2, (random() - 0.5) * 2];
    }
    actions.set(a, (e * steps + t) * 2);
    const before = scene.state(),
      after = scene.step(a),
      motion = Math.hypot(
        after.object.x - before.object.x,
        after.object.y - before.object.y,
      ),
      rot = Math.abs(after.object.angle - before.object.angle);
    contact[e * steps + t] = after.lastActionContact ? 1 : 0;
    moving += motion > 0.01 ? 1 : 0;
    touching += contact[e * steps + t];
    capture(scene, e, t + 1);
  }
  if (e % 100 === 0) console.log("episode", e);
}
for (const [name, data] of Object.entries({ images, states, actions, contact }))
  fs.writeFileSync(
    `${out}/${name}.bin.gz`,
    zlib.gzipSync(Buffer.from(data.buffer), { level: 1 }),
  );
const metadata = {
  version: "sensor-v3-contact-precision-planck-1.3.0",
  episodes,
  steps,
  seedBase: 120000,
  collectorSeed: 20261114,
  imageShape: [episodes, steps + 1, 2, 64, 64],
  stateShape: [episodes, steps + 1, 9],
  actionShape: [episodes, steps, 2],
  contactFraction: touching / (episodes * steps),
  movingFraction: moving / (episodes * steps),
  split: {
    train: [0, Math.floor(episodes * 0.8)],
    validation: [Math.floor(episodes * 0.8), Math.floor(episodes * 0.9)],
    test: [Math.floor(episodes * 0.9), episodes],
  },
  contactDefinition:
    "true touching pusher/block contact during any of the 12 physics substeps",
  actionScale: 0.48,
  actionDuration: 0.1,
};
fs.writeFileSync(`${out}/metadata.json`, JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata, null, 2));
