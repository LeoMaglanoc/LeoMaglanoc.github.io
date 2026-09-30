import { worldToPixel } from './coordinate-map.js';
import { pointSegmentDistance } from './stroke-processing.js';
export class InkModel {
  constructor() { this.segments = []; this.version = 0; this.disturbanceVersion = 0; }
  add(start, end) {
    this.segments.push({ start: [...start], end: [...end], a: worldToPixel(start), b: worldToPixel(end) });
    this.version++;
  }
  erase(point, radius) {
    const remaining = this.segments.filter(s => pointSegmentDistance(point, s.a, s.b) > radius);
    if (remaining.length === this.segments.length) return false;
    this.segments = remaining; this.version++; this.disturbanceVersion++; return true;
  }
  clear() { this.segments = []; this.version++; this.disturbanceVersion++; }
}
