export function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
  if (!Number.isFinite(norm) || norm < 1e-12) throw new Error("Invalid model embedding.");
  return Float32Array.from(vector, (x) => x / norm);
}
export function rankRegions(query, embeddings, manifest, strategy = "max") {
  const dim = manifest.embeddingDim;
  if (query.length !== dim || embeddings.length !== dim * (1 + manifest.numRegions * 3)) throw new Error("Embedding shape mismatch.");
  let sceneScore = 0;
  for (let d = 0; d < dim; d++) sceneScore += query[d] * embeddings[d];
  const results = [];
  for (let r = 0; r < manifest.numRegions; r++) {
    const scores = [];
    for (let v = 0; v < 3; v++) {
      let score = 0,
        offset = dim * (1 + r * 3 + v);
      for (let d = 0; d < dim; d++) score += query[d] * embeddings[offset + d];
      scores.push(score);
    }
    const score = strategy === "weighted" ? scores[0] * 0.4 + scores[1] * 0.4 + scores[2] * 0.2 : Math.max(...scores);
    results.push({ id: r + 1, score, views: scores });
  }
  results.sort((a, b) => b.score - a.score || a.id - b.id);
  return { results, sceneScore };
}
