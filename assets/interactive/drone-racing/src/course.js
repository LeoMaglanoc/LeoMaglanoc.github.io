export function sceneXml(droneXml, course) {
  const [width, height] = course.opening,
    f = course.frame;
  const gates = course.gates
    .map(([x, y, z], i) => {
      const geom = (suffix, pos, size) => `<geom name="gate${i}_${suffix}" type="box" pos="${pos.join(" ")}" size="${size.join(" ")}"/>`;
      return (
        geom("left", [x, y - width / 2 - f, z], [f, f, height / 2 + 2 * f]) +
        geom("right", [x, y + width / 2 + f, z], [f, f, height / 2 + 2 * f]) +
        geom("top", [x, y, z + height / 2 + f], [f, width / 2, f]) +
        geom("bottom", [x, y, z - height / 2 - f], [f, width / 2, f])
      );
    })
    .join("");
  const obstacles = course.obstacles
    .map(([x, y, z, r], i) => `<geom name="obstacle${i}" type="box" pos="${x} ${y} ${z}" size="${r} ${r} ${z}"/>`)
    .join("");
  return droneXml.replace("</worldbody>", gates + obstacles + "</worldbody>");
}
// All course gates face +X. Interpolate the crossing, not the current position.
export function gateCrossing(previous, current, center, opening, margin = 0.07) {
  const before = previous[0] - center[0],
    after = current[0] - center[0];
  if (before >= 0 || after < 0) return false;
  const u = -before / (after - before);
  const y = previous[1] + u * (current[1] - previous[1]),
    z = previous[2] + u * (current[2] - previous[2]);
  return Math.abs(y - center[1]) <= opening[0] / 2 - margin && Math.abs(z - center[2]) <= opening[1] / 2 - margin;
}
