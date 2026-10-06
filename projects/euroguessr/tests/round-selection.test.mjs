import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { selectRounds } from "../src/round-selection.js";
globalThis.crypto ??= webcrypto;

test("matches cover distinct countries and equalize exposure despite uneven photo counts", () => {
  const pack = JSON.parse(readFileSync(new URL("../rounds.json", import.meta.url)));
  let history = {};
  const prior = new Map();
  for (let n = 0; n < 200; n++) {
    const selected = selectRounds(pack, history);
    assert.equal(new Set(selected.rounds.map((p) => p.country)).size, 5);
    for (const photo of selected.rounds) {
      const countryPhotos = pack.filter((p) => p.country === photo.country);
      const visited = prior.get(photo.country) ?? new Set();
      if (visited.size === countryPhotos.length) visited.clear();
      assert.ok(!visited.has(photo.id), "Each country's photos cycle before repeating");
      visited.add(photo.id);
      prior.set(photo.country, visited);
    }
    history = selected.history;
    const counts = Object.values(history.counts);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
  assert.equal(Object.keys(history.counts).length, 39);
});

test("stale history is sanitized without mutating prior matches or input pack", () => {
  const pack = Array.from({ length: 5 }, (_, i) => ({ id: String(i), country: String(i) }));
  const previous = { counts: { 0: -1, 1: "bad" }, seen: { 0: ["removed"], 1: "bad" } };
  const before = JSON.stringify({ pack, previous });
  const result = selectRounds(pack, previous);
  assert.equal(result.rounds.length, 5);
  assert.equal(JSON.stringify({ pack, previous }), before);
  assert.deepEqual(Object.values(result.history.counts), [1, 1, 1, 1, 1]);
});
