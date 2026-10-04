import test from "node:test";
import assert from "node:assert/strict";
import { C } from "../src/config.js";
import { pixelToWorld, worldToPixel } from "../src/coordinate-map.js";
import { resampleStroke, resampleStrokes, pointSegmentDistance } from "../src/stroke-processing.js";
import { detectMissing } from "../src/error-detector.js";
import { repairRuns } from "../src/repair-planner.js";
import { InkModel } from "../src/ink-model.js";
function raster(paths) {
  const image = new Uint8ClampedArray(C.width * C.height * 4).fill(255);
  for (const path of paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      for (let y = Math.max(0, Math.floor(Math.min(a[1], b[1]) - 2)); y <= Math.min(C.height - 1, Math.ceil(Math.max(a[1], b[1]) + 2)); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(a[0], b[0]) - 2)); x <= Math.min(C.width - 1, Math.ceil(Math.max(a[0], b[0]) + 2)); x++)
          if (pointSegmentDistance([x, y], a, b) <= 1.5) image[(y * C.width + x) * 4] = 0;
      }
    }
  return image;
}
test("mapping uses the correct signs, axes and inverse at center and four corners", () => {
  for (const p of [
    [0, 0],
    [639, 0],
    [0, 511],
    [639, 511],
    [319.5, 255.5],
  ]) {
    const roundtrip = worldToPixel(pixelToWorld(p));
    assert.ok(Math.hypot(...roundtrip.map((v, i) => v - p[i])) < 1e-9);
  }
  assert.deepEqual(pixelToWorld([0, 0]), [0.6900000000000001, 0.12, 0.412]);
  const right = pixelToWorld([639, 0]),
    bottom = pixelToWorld([0, 511]);
  assert.equal(right[1], -0.12);
  assert.ok(Math.abs(bottom[0] - 0.41) < 1e-12);
});
test("resampling handles duplicates, degenerate paths, endpoints and disconnected strokes", () => {
  assert.deepEqual(
    resampleStroke([
      [2, 3],
      [2, 3],
    ]),
    [[2, 3]]
  );
  assert.deepEqual(resampleStroke([]), []);
  assert.deepEqual(
    resampleStroke(
      [
        [0, 0],
        [0, 0],
        [25, 0],
      ],
      12
    ),
    [
      [0, 0],
      [12, 0],
      [24, 0],
      [25, 0],
    ]
  );
  const paths = resampleStrokes(
    [
      [
        [0, 0],
        [100, 0],
      ],
      [
        [300, 300],
        [400, 300],
      ],
    ],
    12,
    12
  );
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[1][0], [300, 300]);
  assert.ok(paths.flat().length <= 12);
});
const line = [
  [
    [100, 256],
    [540, 256],
  ],
];
test("directional detector accepts perfect output and sideways error, preserves middle gaps and missing endpoints", () => {
  assert.equal(detectMissing(line, raster(line)).missingPercent, 0);
  assert.equal(
    detectMissing(
      line,
      raster([
        [
          [100, 262],
          [540, 262],
        ],
      ])
    ).missingPercent,
    0
  );
  const gap = detectMissing(
    line,
    raster([
      [
        [100, 256],
        [280, 256],
      ],
      [
        [340, 256],
        [540, 256],
      ],
    ])
  );
  assert.ok(gap.missingPercent > 10);
  assert.equal(gap.errorMap[256 * 640 + 320], 1);
  const endpoint = detectMissing(
    line,
    raster([
      [
        [140, 256],
        [540, 256],
      ],
    ])
  );
  assert.ok(endpoint.missingPercent > 4);
});
test("repair extracts runs, overlaps healthy ink, reverses nearest endpoint, and separates strokes", () => {
  const d = detectMissing(
    line,
    raster([
      [
        [100, 256],
        [280, 256],
      ],
      [
        [340, 256],
        [540, 256],
      ],
    ])
  );
  const runs = repairRuns(d, [540, 256]);
  assert.equal(runs.length, 1);
  assert.ok(runs[0][0][0] >= 348);
  assert.ok(runs[0].at(-1)[0] <= 272);
  const separated = [
    [
      [100, 100],
      [200, 100],
    ],
    [
      [400, 400],
      [500, 400],
    ],
  ];
  assert.equal(repairRuns(detectMissing(separated, raster([])), [100, 100]).length, 2);
});
test("short healthy bridge merges; a long bridge requires lifting", () => {
  function withRuns(a, b) {
    const points = Array.from({ length: 201 }, (_, i) => [i * 2, 256]);
    const missing = points.map((_, i) => (i >= 20 && i <= 30) || (i >= a && i <= b));
    return { samples: [{ points, missing }] };
  }
  assert.equal(repairRuns(withRuns(40, 50), [0, 256]).length, 1);
  assert.equal(repairRuns(withRuns(180, 190), [0, 256]).length, 2);
});
test("eraser changes the persistent world segments and disturbance version", () => {
  const ink = new InkModel();
  ink.add(pixelToWorld([100, 256]), pixelToWorld([200, 256]));
  ink.add(pixelToWorld([400, 256]), pixelToWorld([500, 256]));
  assert.equal(ink.erase([150, 256], 24), true);
  assert.equal(ink.segments.length, 1);
  assert.equal(ink.disturbanceVersion, 1);
  assert.equal(ink.erase([150, 256], 24), false);
});
test("dense scribbles are simplified deterministically within the waypoint budget", () => {
  const dense = Array.from({ length: 10000 }, (_, i) => [20 + (i % 2) * 600, 20 + (i % 470)]);
  const a = resampleStrokes([dense], 8, 1800),
    b = resampleStrokes([dense], 8, 1800);
  assert.deepEqual(a, b);
  assert.ok(a[0].length <= 1800);
  assert.deepEqual(a[0][0], dense[0]);
  assert.deepEqual(a[0].at(-1), dense.at(-1));
});
