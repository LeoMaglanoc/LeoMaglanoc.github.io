import { C } from './config.js';
export function pixelToWorld([x, y], z = C.drawZ) {
  return [C.centerX + C.halfX * (1 - 2 * y / (C.height - 1)), C.halfY * (1 - 2 * x / (C.width - 1)), z];
}
export function worldToPixel([x, y]) {
  return [(1 - y / C.halfY) * (C.width - 1) / 2, (1 - (x - C.centerX) / C.halfX) * (C.height - 1) / 2];
}
