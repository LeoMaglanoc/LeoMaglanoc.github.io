// MuJoCo's mesh arrays are views into the live physics model. Never swizzle them
// in-place for rendering: mesh colliders use the same vertex storage.
export function copyMuJoCoVectors(source) {
  const result = Float32Array.from(source);
  for (let i = 0; i < result.length; i += 3) {
    const y = result[i + 1];
    result[i + 1] = result[i + 2];
    result[i + 2] = -y;
  }
  return result;
}
