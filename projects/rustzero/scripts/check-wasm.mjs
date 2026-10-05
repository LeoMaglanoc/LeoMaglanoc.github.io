import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import init, { Game } from "../web/pkg/rustzero.js";
await init({ module_or_path: readFileSync(new URL("../web/pkg/rustzero_bg.wasm", import.meta.url)) });
const game = new Game(readFileSync(process.argv[2] || new URL("../web/models/final.json", import.meta.url), "utf8"));
const fixture = JSON.parse(readFileSync(process.argv[3] || new URL("../web/metrics/inference-fixture.json", import.meta.url), "utf8"));
let maxError = 0;
for (const expected of fixture) {
  const state = JSON.parse(game.state());
  assert.deepEqual(
    state.legal.map((m) => m.action),
    expected.actions
  );
  const actual = JSON.parse(game.inference());
  for (let i = 0; i < 108; i++) {
    const error = Math.abs(expected.policy[i] - actual.policy[i]);
    maxError = Math.max(maxError, error);
    assert.ok(error < 0.0001, `logit ${i}: ${error}`);
  }
  assert.ok(Math.abs(expected.value - actual.value) < 0.0001);
  game.play(state.legal[0].action);
}
game.reset();
let plies = 0;
while (JSON.parse(game.state()).terminal === null) {
  const state = JSON.parse(game.state());
  game.start_search();
  const result = JSON.parse(game.search_chunk(32));
  assert.equal(
    result.stats.reduce((n, s) => n + s.visits, 0),
    32
  );
  assert.ok(state.legal.some((m) => m.action === result.best));
  game.finish_search();
  assert.ok(++plies < 200);
}
assert.equal(JSON.parse(game.state()).legal.length, 0);
game.reset();
assert.equal(JSON.parse(game.state()).board.filter((p) => p === 1).length, 12);
assert.throws(() => game.play(108));
assert.throws(() => new Game("{}"));
console.log(
  JSON.stringify({ nativeWasmParity: "PASS", maxPolicyLogitError: maxError, completeWasmGamePlies: plies, reset: "PASS", illegalMove: "PASS" })
);

const local = new Game("");
assert.throws(() => local.start_search());
assert.throws(() => local.inference());
const snapshots = [JSON.parse(local.state())];
for (let i = 0; i < 3; i++) {
  local.play(JSON.parse(local.state()).legal[0].action);
  snapshots.push(JSON.parse(local.state()));
}
local.back(-1);
assert.deepEqual(JSON.parse(local.state()).board, snapshots[2].board);
assert.equal(JSON.parse(local.state()).ply, 2);
local.forward(-1);
assert.deepEqual(JSON.parse(local.state()).board, snapshots[3].board);
local.back(-1);
const alternate = JSON.parse(local.state()).legal[1].action;
local.play(alternate);
assert.equal(JSON.parse(local.state()).total_plies, 3);
local.forward(-1);
assert.equal(JSON.parse(local.state()).ply, 3);
local.reset();
let localPlies = 0;
while (JSON.parse(local.state()).terminal === null) {
  const s = JSON.parse(local.state());
  local.play(s.legal[0].action);
  assert.ok(++localPlies < 200);
}
const terminalBoard = JSON.parse(local.state()).board;
local.back(-1);
assert.equal(JSON.parse(local.state()).terminal, null);
local.forward(-1);
assert.deepEqual(JSON.parse(local.state()).board, terminalBoard);
assert.notEqual(JSON.parse(local.state()).terminal, null);
game.reset();
for (let i = 0; i < 4; i++) game.play(JSON.parse(game.state()).legal[0].action);
const pairedBoard = JSON.parse(game.state()).board;
game.back(0);
assert.equal(JSON.parse(game.state()).ply, 2);
game.forward(0);
assert.equal(JSON.parse(game.state()).ply, 4);
assert.deepEqual(JSON.parse(game.state()).board, pairedBoard);
console.log(
  JSON.stringify({
    localTwoPlayer: "PASS",
    localTerminalUndoRedo: "PASS",
    branchTruncation: "PASS",
    pairedAiUndoRedo: "PASS",
    noModelInLocalMode: "PASS",
  })
);
