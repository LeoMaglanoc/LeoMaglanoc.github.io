function cameraError(error) {
  if (!error) return 'Camera access was rejected.';
  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Camera permission was denied. Enable camera access in your browser settings and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'SourceUnavailableError':
      return 'The camera is busy or unavailable. Close other camera apps and try again.';
    case 'OverconstrainedError':
      return 'The requested rear-camera settings are unavailable on this device.';
    default:
      return `Camera error: ${error.message || error.name || 'unknown failure'}.`;
  }
}

export class CameraSession {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.source = 'camera';
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support camera access. Try a recent Chrome, Safari, or Firefox over HTTPS.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          aspectRatio: { ideal: 16 / 9 },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (error) {
      throw new Error(cameraError(error));
    }

    this.video.srcObject = this.stream;
    this.video.controls = false;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    await this.waitForMetadata();
    return this;
  }

  async startVideo(file) {
    this.stop();
    this.source = 'video';
    this.video.srcObject = null;
    this.video.src = URL.createObjectURL(file);
    this.video.loop = true;
    this.video.muted = true;
    await this.video.play();
    await this.waitForMetadata();
    return this;
  }

  async waitForMetadata() {
    if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) return;
    await new Promise((resolve, reject) => {
      const onMetadata = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('The video input could not be loaded.')); };
      const cleanup = () => {
        this.video.removeEventListener('loadedmetadata', onMetadata);
        this.video.removeEventListener('error', onError);
      };
      this.video.addEventListener('loadedmetadata', onMetadata, { once: true });
      this.video.addEventListener('error', onError, { once: true });
    });
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.video.src);
      this.video.removeAttribute('src');
      this.video.load();
    }
  }
}

export function coverRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height, scale };
}
