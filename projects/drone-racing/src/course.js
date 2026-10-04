import { VEHICLE } from "./vehicle-config.js";
export function vehicleXml(xml, spawn = { position: [0, 0, 1.5], yaw: 0 }) {
  const v = VEHICLE;
  const arms = v.motorPositions
    .map((p, i) => `<geom type="capsule" fromto="0 0 0 ${p.join(" ")}" size=".009"/><site name="motor${i + 1}" pos="${p.join(" ")}"/>`)
    .join("");
  return xml.replace(
    "{{VEHICLE_BODY}}",
    `<body name="drone" pos="${spawn.position.join(" ")}" quat="${Math.cos(spawn.yaw / 2)} 0 0 ${Math.sin(
      spawn.yaw / 2
    )}"><freejoint/><inertial pos="0 0 0" mass="${v.mass}" diaginertia="${v.inertia.join(" ")}"/><geom name="hull" type="box" size="${
      v.visual.bodyLength / 2
    } ${v.visual.bodyWidth / 2} ${v.visual.bodyHeight / 2}"/>${arms}</body>`
  );
}
// Gate local X is its normal, Y horizontal, Z vertical. Rz(yaw) Ry(pitch).
export function gateBasis(gate) {
  const c = Math.cos(gate.yaw || 0),
    s = Math.sin(gate.yaw || 0),
    cp = Math.cos(gate.pitch || 0),
    sp = Math.sin(gate.pitch || 0);
  return { normal: [c * cp, s * cp, -sp], horizontal: [-s, c, 0], vertical: [c * sp, s * sp, cp] };
}
export function gateIntersection(previous, current, gate, margin = VEHICLE.collisionRadius) {
  const { normal, horizontal, vertical } = gateBasis(gate);
  const dot = (p, axis) => p.reduce((sum, x, i) => sum + (x - gate.position[i]) * axis[i], 0);
  const before = dot(previous, normal),
    after = dot(current, normal);
  if (before >= 0 || after < 0) return null;
  const u = -before / (after - before);
  const hit = previous.map((x, i) => x + u * (current[i] - x));
  if (Math.abs(dot(hit, horizontal)) > gate.width / 2 - margin || Math.abs(dot(hit, vertical)) > gate.height / 2 - margin) return null;
  return u;
}
export function gateCrossing(previous, current, gate, opening, margin = VEHICLE.collisionRadius) {
  // Array input retained for small historical fixture callers.
  if (Array.isArray(gate)) gate = { position: gate, width: opening[0], height: opening[1], yaw: 0 };
  return gateIntersection(previous, current, gate, margin) !== null;
}
export function sceneXml(droneXml, course) {
  const f = course.frame;
  const gates = course.gates
    .map((g, i) => {
      const w = g.width,
        h = g.height;
      const geom = (suffix, pos, size) => `<geom name="gate${i}_${suffix}" type="box" pos="${pos.join(" ")}" size="${size.join(" ")}"/>`;
      const cy = Math.cos(g.yaw / 2),
        sy = Math.sin(g.yaw / 2),
        cp = Math.cos((g.pitch || 0) / 2),
        sp = Math.sin((g.pitch || 0) / 2);
      return (
        `<body pos="${g.position.join(" ")}" quat="${cy * cp} ${-sy * sp} ${cy * sp} ${sy * cp}">` +
        geom("left", [0, -w / 2 - f, 0], [f, f, h / 2 + 2 * f]) +
        geom("right", [0, w / 2 + f, 0], [f, f, h / 2 + 2 * f]) +
        geom("top", [0, 0, h / 2 + f], [f, w / 2, f]) +
        geom("bottom", [0, 0, -h / 2 - f], [f, w / 2, f]) +
        "</body>"
      );
    })
    .join("");
  const obstacles = course.obstacles
    .map(([x, y, z, r], i) => `<geom name="obstacle${i}" type="box" pos="${x} ${y} ${z}" size="${r} ${r} ${z}"/>`)
    .join("");
  return vehicleXml(droneXml, course.spawn).replace("</worldbody>", gates + obstacles + "</worldbody>");
}
