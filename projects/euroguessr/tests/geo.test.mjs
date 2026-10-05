import test from "node:test";
import assert from "node:assert/strict";
import { distance, score, project, unproject, selectPrediction } from "../src/geo.js";
import { resizeNormalize } from "../src/preprocess.js";
test("geodesic scoring uses kilometers, is symmetric and handles antipodes", () => {
  assert.equal(distance({ lat: 0, lon: 0 }, { lat: 0, lon: 0 }), 0);
  assert.ok(Math.abs(distance({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }) - 20015.0868) < 0.01);
  const a = { lat: 48.2, lon: 16.37 },
    b = { lat: 51.5, lon: -0.12 };
  assert.equal(distance(a, b), distance(b, a));
  assert.equal(score(0), 5000);
  assert.ok(score(100) > score(1000));
});
test("map coordinates round-trip and stay within Europe", () => {
  const a = { lat: 48.2, lon: 16.37 },
    b = unproject(...project(a));
  assert.ok(Math.abs(a.lat - b.lat) < 1e-9);
  assert.ok(Math.abs(a.lon - b.lon) < 1e-9);
  assert.deepEqual(unproject(-100, 10000), { lat: 34, lon: -25 });
});
test("retrieval reads visual features and never needs query GPS", () => {
  const refs = {
    features: [
      [1, 0],
      [0, 1],
    ],
    gps: [
      [60, 20],
      [40, -5],
    ],
  };
  assert.deepEqual(selectPrediction([10, 0], [], { method: "retrieval-1" }, refs), { lat: 60, lon: 20 });
  assert.deepEqual(selectPrediction([0, 2], [], { method: "retrieval-1" }, refs), { lat: 40, lon: -5 });
  assert.throws(() => selectPrediction([0, 0], [], { method: "retrieval-1" }, refs), /Invalid/);
});
test("classifier selects a learned cell rather than averaging disconnected modes", () => {
  assert.deepEqual(
    selectPrediction(
      [],
      [0.1, 3, 0.2],
      {
        method: "head",
        centers: [
          [40, 0],
          [60, 20],
          [50, 10],
        ],
      },
      null
    ),
    { lat: 60, lon: 20 }
  );
});
test("pixel preprocessing is NCHW, ignores alpha, and uses half-pixel interpolation", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]);
  const out = resizeNormalize(pixels, 2, 1, 1);
  assert.ok(Math.abs(out[0] - (0.5 - 0.485) / 0.229) < 1e-6);
  assert.ok(Math.abs(out[1] - (0 - 0.456) / 0.224) < 1e-6);
  assert.ok(Math.abs(out[2] - (0.5 - 0.406) / 0.225) < 1e-6);
});
