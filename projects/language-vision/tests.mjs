import { strict as assert } from "node:assert";
import fs from "node:fs";
import { Tokenizer } from "../../assets/interactive/language-vision/tokenizer.mjs";
import { normalize, rankRegions } from "../../assets/interactive/language-vision/retrieval.mjs";
import { decodeMask } from "../../assets/interactive/language-vision/masks.mjs";
const root = new URL("../../assets/interactive/language-vision/", import.meta.url);
const json = (path) => JSON.parse(fs.readFileSync(new URL(path, root)));
const tokenizer = new Tokenizer(json("models/tokenizer.json"));
for (const f of [...json("models/parity-fixtures.json"), ...json("models/tokenizer-edge-fixtures.json")])
  assert.deepEqual(tokenizer.encode(f.query).ids, f.tokens, `Tokenizer parity: ${f.query}`);
assert.deepEqual(Array.from(decodeMask([1, 2, 1], 2, 2)), [0, 1, 1, 0]);
assert.deepEqual(Array.from(decodeMask([0, 4], 2, 2)), [1, 1, 1, 1]);
assert.throws(() => decodeMask([5], 2, 2));
assert.throws(() => decodeMask([1], 2, 2));
assert.deepEqual(Array.from(normalize([3, 4])), Array.from(new Float32Array([0.6, 0.8])));
let total = 0;
for (const s of json("data/scenes.json")) {
  const m = json(`data/${s.id}/manifest.json`),
    rs = json(`data/${s.id}/regions.json`);
  const ebuf = fs.readFileSync(new URL(`data/${s.id}/embeddings.bin`, root)),
    cbuf = fs.readFileSync(new URL(`data/${s.id}/masks.bin`, root));
  const e = new Float32Array(ebuf.buffer.slice(ebuf.byteOffset, ebuf.byteOffset + ebuf.byteLength)),
    c = new Uint32Array(cbuf.buffer.slice(cbuf.byteOffset, cbuf.byteOffset + cbuf.byteLength));
  assert.equal(rs.length, m.numRegions);
  assert.equal(e.length, m.embeddingDim * (1 + 3 * m.numRegions));
  for (let i = 0; i < e.length; i += m.embeddingDim)
    assert.ok(Math.abs(Math.hypot(...e.subarray(i, i + m.embeddingDim)) - 1) < 1e-5, "normalized image embedding");
  for (const r of rs) {
    const mask = decodeMask(c.subarray(r.rleOffset, r.rleOffset + r.rleLength), m.maskWidth, m.maskHeight);
    assert.equal(
      mask.reduce((a, b) => a + b, 0),
      r.pixelArea,
      `Mask area ${s.id} #${r.id}`
    );
  }
  const ranked = rankRegions(e.subarray(m.embeddingDim, 2 * m.embeddingDim), e, m).results;
  assert.equal(ranked[0].id, rs[0].id);
  assert.ok(ranked[0].score > 0.9999);
  total += rs.length;
}
console.log(`PASS: tokenizer parity, RLE reconstruction, image normalization and retrieval shapes; ${total} regions.`);
