import { AlvaAR } from '../assets/alva_ar.js';

export class AlvaSlam {
  constructor() {
    this.alva = null;
    this.width = 0;
    this.height = 0;
    this.hasMapApi = false;
  }

  async initialize(width, height) {
    this.width = width;
    this.height = height;
    this.alva = await AlvaAR.Initialize(width, height);
    this.hasMapApi = typeof this.alva.getMapPoints === 'function';
  }

  processFrame(imageData) {
    if (!this.alva) throw new Error('SLAM has not been initialized.');
    const pose = this.alva.findCameraPose(imageData);
    const framePoints = this.alva.getFramePoints();
    const mapPoints = this.hasMapApi ? this.alva.getMapPoints() : new Float32Array();
    return {
      pose: pose ? new Float32Array(pose) : null,
      framePoints,
      mapPoints,
      tracking: Boolean(pose)
    };
  }

  reset() {
    this.alva?.reset();
  }
}
