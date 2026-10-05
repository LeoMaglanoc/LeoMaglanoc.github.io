export function distance(a, b) {
  const r = Math.PI / 180,
    p = a.lat * r,
    q = b.lat * r;
  const v = Math.sin((q - p) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, v))));
}
export function score(km) {
  return Math.round(5000 * Math.exp(-km / 1500));
}
export function selectPrediction(embedding, logits, metadata, references) {
  if (metadata.method === "head") {
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
    const [lat, lon] = metadata.centers[best];
    return { lat, lon };
  }
  const k = Number(metadata.method.split("-")[1]);
  let norm = Math.sqrt(embedding.reduce((a, v) => a + v * v, 0));
  if (!Number.isFinite(norm) || norm === 0) throw Error("Invalid image embedding");
  const sims = references.features
    .map((ref, i) => ({ i, sim: ref.reduce((s, v, j) => s + (v * embedding[j]) / norm, 0) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
  let lat = 0,
    lon = 0,
    total = 0;
  for (const { i, sim } of sims) {
    const w = Math.exp((sim - sims[0].sim) * 20);
    lat += references.gps[i][0] * w;
    lon += references.gps[i][1] * w;
    total += w;
  }
  return { lat: lat / total, lon: lon / total };
}
export function project({ lat, lon }) {
  return [(lon + 25) * 10, (72 - lat) * (630 / 38)];
}
export function unproject(x, y) {
  return { lat: Math.max(34, Math.min(72, 72 - y / (630 / 38))), lon: Math.max(-25, Math.min(45, x / 10 - 25)) };
}
export function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const data = new Uint32Array(1);
    crypto.getRandomValues(data);
    const j = data[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
