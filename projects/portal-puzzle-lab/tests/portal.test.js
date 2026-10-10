import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../vendor/three.module.js";
import { frame, transfer, rotation, crosses, validPlacement } from "../src/portal.js";
import { Simulation, DT } from "../src/simulation.js";
import { LEVEL } from "../src/level.js";
const v = (x, y, z) => new T.Vector3(x, y, z);
const p = (pos, n) => ({ matrix: frame(pos, n) });
test("portal transform is reversible, rotates momentum and preserves speed", () => {
  const a = p(v(-3, 1.4, -8), v(0, 0, 1)),
    b = p(v(0, 1.4, -14), v(0, 0, 1));
  const m = transfer(a, b),
    back = transfer(b, a);
  assert.ok(
    v(1, 2, 3)
      .applyMatrix4(m)
      .applyMatrix4(back)
      .distanceTo(v(1, 2, 3)) < 1e-10
  );
  const velocity = v(2, -5, -9),
    out = velocity.clone().applyQuaternion(rotation(m));
  assert.ok(Math.abs(out.length() - velocity.length()) < 1e-10);
  assert.ok(out.z > 0);
  assert.equal(out.y, -5);
});
test("plane sweep rejects reverse direction and crossing outside aperture", () => {
  const a = p(v(0, 1.4, 0), v(0, 0, 1));
  assert.ok(crosses(a, v(0, 0.9, 0.1), v(0, 0.9, -0.1), 0.3, 0.88));
  assert.equal(crosses(a, v(2, 0.9, 0.1), v(2, 0.9, -0.1), 0.3, 0.88), false);
  assert.equal(crosses(a, v(0, 0.9, -0.1), v(0, 0.9, 0.1)), false);
});
test("placement rejects edges and overlapping portals; pairs cut real collision holes", () => {
  const s = new Simulation(),
    panel = LEVEL.panels[0];
  assert.equal(validPlacement(panel, panel.x + 1), false);
  assert.equal(s.place(0, panel, panel.x), null);
  assert.ok(s.place(1, panel, panel.x));
  assert.equal(s.place(1, LEVEL.panels[1], 0), null);
  assert.ok(s.panelBodies.length > LEVEL.panels.length);
});
test("player physically crosses in both directions without teleport loops", () => {
  const s = new Simulation();
  s.place(0, LEVEL.panels[0], -3.5);
  s.place(1, LEVEL.panels[1], 0);
  s.player.position.set(-3.5, 0.9, -7);
  s.player.previousPosition.copy(s.player.position);
  for (let i = 0; i < 80; i++) s.step({ x: 0, z: -1 });
  assert.equal(s.crossings.player, 1);
  assert.ok(s.player.position.z > -14);
  s.yaw = 0;
  for (let i = 0; i < 95; i++) s.step({ x: 0, z: -1 });
  assert.equal(s.crossings.player, 2);
  assert.ok(s.player.position.z > -8);
});
test("free cube crosses and pressure plate opens and closes exit; reset restores puzzle", () => {
  const s = new Simulation();
  s.place(0, LEVEL.panels[0], -3.5);
  s.place(1, LEVEL.panels[1], 0);
  s.cube.position.set(-3.5, 0.5, -7.5);
  s.cube.velocity.set(0, 0, -4);
  for (let i = 0; i < 35; i++) s.step();
  assert.equal(s.crossings.cube, 1);
  s.cube.position.set(LEVEL.plate[0], 0.42, LEVEL.plate[2]);
  s.cube.velocity.setZero();
  s.step();
  assert.ok(s.doorOpen);
  s.player.position.set(4.4, 0.9, 5);
  s.step();
  assert.ok(s.complete);
  s.reset();
  assert.equal(s.complete, false);
  assert.equal(s.holding, false);
  assert.equal(s.doorOpen, false);
  assert.deepEqual(s.portals, [null, null]);
  assert.equal(s.time, 0);
  s.cube.position.set(3.6, 0.42, 0.2);
  s.step();
  assert.ok(s.doorOpen);
  s.cube.position.x = 0;
  s.step();
  assert.equal(s.doorOpen, false);
});
test("carry spring transports cube through aperture as player follows", () => {
  const s = new Simulation();
  s.place(0, LEVEL.panels[0], -3.5);
  s.place(1, LEVEL.panels[1], 0);
  s.player.position.set(-3.5, 0.9, -6);
  s.cube.position.set(-3.5, 1.4, -7);
  s.holding = true;
  for (let i = 0; i < 140; i++) s.step({ x: 0, z: -1 });
  assert.equal(s.crossings.player, 1);
  assert.equal(s.crossings.cube, 1);
  assert.ok(s.holding);
  assert.ok(s.cube.position.z > -14);
  assert.ok(s.cube.position.distanceTo(s.player.position) < 2);
});
