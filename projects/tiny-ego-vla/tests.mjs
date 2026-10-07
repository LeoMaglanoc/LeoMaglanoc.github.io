import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const project = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(project, "../..");
const web = path.join(root, "assets/interactive/tiny-ego-vla");
const result = JSON.parse(fs.readFileSync(path.join(web, "results.json"), "utf8"));
const { robot, ego } = result;
assert.equal(result.name, "TinyEgoVLA");
assert.equal(result.preview, false, "Local UI previews must never be published");
assert.deepEqual(robot.budgets, result.config.budgets);
assert.deepEqual(robot.seeds, result.config.seeds);
assert.equal(robot.tasks.length, result.config.robot_tasks.length);
assert.equal(robot.rollouts.length, robot.budgets.length * robot.seeds.length * robot.tasks.length * robot.initializations * 2);
assert.equal(robot.goal_audit.passed, true);
assert(robot.goal_audit.maximum_replay_state_error < 1e-8);
assert.equal(robot.goal_audit.goal_boundary_differences, robot.rollouts.filter((r) => r.success !== r.restored_final_pose_goal).length);
assert.equal(robot.metrics.length, robot.budgets.length * robot.seeds.length * 2);
assert.equal(
  new Set(robot.rollouts.map((r) => [r.regime, r.budget_per_task, r.seed, r.task, r.initialization].join(":"))).size,
  robot.rollouts.length
);
assert(ego.params < 1_000_000 && ego.train_samples > 0 && ego.validation_samples > 0);
for (const summary of robot.summary) {
  const rows = robot.rollouts.filter((r) => r.regime === summary.regime && r.budget_per_task === summary.budget);
  assert.equal(summary.episodes, rows.length);
  assert.equal(summary.successes, rows.filter((r) => r.success).length);
  assert.equal(summary.success_rate, summary.successes / summary.episodes);
  assert.equal(summary.restored_final_pose_successes, rows.filter((r) => r.restored_final_pose_goal).length);
}
for (const row of robot.rollouts) {
  assert(["robot", "ego"].includes(row.regime));
  assert(robot.budgets.includes(row.budget_per_task) && robot.seeds.includes(row.seed));
  assert(robot.tasks.some((t) => t.id === row.task));
  assert(Number.isInteger(row.initialization) && row.initialization >= 0 && row.initialization < robot.initializations);
  const metric = robot.metrics.find((m) => m.regime === row.regime && m.seed === row.seed && m.budget_per_task === row.budget_per_task);
  assert.equal(row.checkpoint_sha256, metric.checkpoint_sha256);
  assert.equal(row.held_out_demo, 42 + row.initialization);
  assert.equal(row.held_out_state_index, 1);
  assert(row.length <= result.config.evaluation_max_steps && row.length > 0);
  assert(row.seconds > 0 && typeof row.success === "boolean");
  for (const name of [row.video, row.poster]) {
    assert(fs.statSync(path.join(web, name)).size > 0);
  }
  const video = fs.readFileSync(path.join(web, row.video));
  // Metadata precedes media for progressive MP4 playback.
  assert(video.indexOf(Buffer.from("moov")) < video.indexOf(Buffer.from("mdat")));
}
for (const metric of robot.metrics) {
  assert(metric.curve.length === result.config.robot_epochs);
  assert(metric.selected_epoch >= 1 && metric.selected_epoch <= metric.curve.length);
  assert.equal(metric.best_validation_mse, Math.min(...metric.curve.map((c) => c.validation_mse)));
  assert(Number.isFinite(metric.test_mse));
}
for (const clip of result.clips) {
  const a = JSON.parse(fs.readFileSync(path.join(web, clip.annotations), "utf8"));
  assert.equal(a.hands.length, a.objects.length);
  assert.equal(a.hands.length, a.instructions.length);
  assert.equal(a.hands.length, a.contact.length);
  assert(a.hands.flat().every((h) => h.length === 21));
  assert(fs.existsSync(path.join(web, clip.video)) && fs.existsSync(path.join(web, clip.poster)));
}
for (const p of ego.predictions) {
  assert(fs.existsSync(path.join(web, p.image)));
  assert.equal(p.video, "P01_04");
}
const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
for (const asset of ["style.css", "app.js", "media/ego-poster.webp", "media/expert-poster.webp", "media/expert.mp4"])
  assert(fs.existsSync(path.join(web, asset)));
assert(!/https?:\/\/.*<script/.test(html));
const blog = fs.readFileSync(path.join(root, "_blogs/2025-12-28-AI-coding-agent-case-study.md"), "utf8");
assert(blog.includes("[TinyEgoVLA]({{ '/tiny-ego-vla/' | relative_url }})"));
console.log(
  `PASS: ${robot.rollouts.length} distinct real rollout records, ${robot.metrics.length} training runs, exact aggregate metrics, fast-start videos, complete overlays and held-out predictions.`
);
