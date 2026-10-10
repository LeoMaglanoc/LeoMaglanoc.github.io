// All dimensions in metres. Panels are floor-aligned mounting rails.
export const LEVEL = {
  name: "Escape",
  height: 4.4,
  spawn: [0, 0.9, 1.8],
  cube: [0, 0.43, -11.5],
  plate: [3.6, 0.06, 0.2],
  exit: [4.4, 1.5, 4],
  panels: [
    { id: "entry", x: -3.5, z: -8, w: 3.4, h: 4.4, normal: [0, 0, 1], label: "01 / LINK" },
    { id: "vault", x: 0, z: -14, w: 4, h: 4.4, normal: [0, 0, 1], label: "02 / RETRIEVE" },
    { id: "return", x: 3.5, z: -8.4, w: 3.4, h: 4.4, normal: [0, 0, -1], label: "03 / RETURN" },
  ],
};
