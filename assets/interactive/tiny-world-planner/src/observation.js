// Pixel-only preprocessing: no body transforms, goals, contacts or physics imports.
export function masks(rgba) {
  if (rgba.length !== 64 * 64 * 4)
    throw Error("Expected 64×64 RGBA sensor image");
  const object = new Float32Array(4096),
    agent = new Float32Array(4096);
  const quantize = (v) =>
    Math.round((Math.round(Math.max(0, Math.min(1, v)) * 4) / 4) * 255) / 255;
  for (let i = 0; i < 4096; i++) {
    const dr = 245 - rgba[4 * i],
      db = 239 - rgba[4 * i + 2];
    object[i] = quantize((6 * dr + 185 * db) / 31874);
    agent[i] = quantize((172 * dr - 9 * db) / 31874);
  }
  return { object, agent };
}
export function history(previous, current) {
  return {
    object: current.object,
    agent: current.agent,
    previousObject: previous.object,
    previousAgent: previous.agent,
  };
}
